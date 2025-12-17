/* flight-details.cleaned.js
   Cleaned & simplified to avoid runtime ReferenceErrors and syntax errors.
   Key changes:
   - Weather uses destination CITY name (via Open-Meteo Geocoding), not airport codes or lat/lon tables.
   - Removed airport coord table + getAirportCoords.
   - Removed Leaflet example code (your page uses an SVG route map, not a <div id="map">).
*/

(() => {
  "use strict";

  const airportCodeToCityName = {
  "ABZ": "Aberdeen",
  "AGP": "Malaga",
  "ADA": "Izmir",
  "ALC": "Alicante",
  "AMS": "Amsterdam",
  "ATA": "Antalya",
  "AYT": "Dalaman",
  "BCN": "Barcelona",
  "BLQ": "Bologna",
  "BHD": "Belfast City",
  "BFS": "Belfast International",
  "CDG": "Paris Charles de Gaulle",
  "CFU": "Corfu",
  "CUN": "Cancun",
  "DAA": "Sharm el Sheikh",
  "DLM": "Dalaman",
  "EDI": "Edinburgh",
  "FAO": "Faro",
  "FCO": "Rome",
  "FNC": "Madeira",
  "GLA": "Glasgow",
  "HRG": "Hurghada",
  "INV": "Inverness",
  "IOM": "Isle of Man",
  "JER": "Jersey",
  "KRK": "Krakow",
  "LIN": "Milan",
  "LIS": "Lisbon",
  "LPA": "Gran Canaria",
  "MAN": "Manchester",
  "MME": "Teesside",
  "MUC": "Munich",
  "NAP": "Naples",
  "NCL": "Newcastle",
  "OLB": "Olbia",
  "ORY": "Paris Orly",
  "PMI": "Palma de Mallorca",
  "PSA": "Pisa",
  "RHO": "Rhodes",
  "SKG": "Thessaloniki",
  "SSH": "Sharm el Sheikh",
  "TFS": "Tenerife South",
  "VIE": "Vienna",
  "ZRH": "Zurich",
  };

    function getCityName(code){ return airportCodeToCityName[code] || code || ""; }

  // ---------- DOM ----------
  const els = {
    headline: document.getElementById("headline"),
    subhead: document.getElementById("subhead"),
    lastUpdated: document.getElementById("lastUpdated"),
    sourceLine: document.getElementById("sourceLine"),
    statusBadge: document.getElementById("statusBadge"),

    depKv: document.getElementById("depKv"),
    arrKv: document.getElementById("arrKv"),
    kpis: document.getElementById("kpis"),
    rawJson: document.getElementById("rawJson"),

    backBtn: document.getElementById("backBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    autoBtn: document.getElementById("autoBtn"),

    overflowBtn: document.getElementById("overflowDetailsBtn"),
    menu: document.getElementById("detailsMenu"),

    // Airline / aircraft
    airlineLogo: document.getElementById("airlineLogo"),
    airlineName: document.getElementById("airlineName"),
    airlineCodeLine: document.getElementById("airlineCodeLine"),
    aircraftType: document.getElementById("aircraftType"),
    aircraftReg: document.getElementById("aircraftReg"),
    aircraftImageWrap: document.getElementById("aircraftImageWrap"),
    aircraftImage: document.getElementById("aircraftImage"),
    aircraftImageCredit: document.getElementById("aircraftImageCredit"),

    // Weather
    weatherBox: document.getElementById("weatherBox"),
    wxHint: document.getElementById("wxHint"),
  };

  // ---------- State ----------
  const state = {
    storageKey: null,
    context: null,   // stored context (mode/airport/day), if you use it
    current: null,   // current flight object
    auto: true,
    intervalMs: 30000,
    timer: null,
  };

  // ---------- Utilities ----------
  function safeGetLocal(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeSetLocal(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
  function safeGetSession(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }
  function safeSetSession(key, value) {
    try { sessionStorage.setItem(key, value); return true; } catch { return false; }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;

    // numeric unix sec/ms
    const n = Number(v);
    if (!Number.isNaN(n) && String(v).length >= 10) {
      return new Date(n < 2e10 ? n * 1000 : n);
    }

    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fmtTime(v) {
    const d = toDate(v);
    if (!d) return v ? String(v) : "";
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function flattenObject(obj, prefix = "", out = {}) {
    if (obj == null) return out;
    if (typeof obj !== "object") {
      out[prefix || "value"] = obj;
      return out;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => flattenObject(v, prefix ? `${prefix}[${i}]` : `[${i}]`, out));
      return out;
    }
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") flattenObject(v, p, out);
      else out[p] = v;
    }
    return out;
  }

  function pickAny(flat, paths) {
    for (const p of paths) {
      const v = flat[p];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  }

  function deriveIdentity(f) {
    const flat = flattenObject(f || {});
    const flightNo =
      pickAny(flat, ["flight.iataNumber", "flight_iata", "flightNumber", "number", "flight_no", "flight.iata"]) || null;

    const dep =
      pickAny(flat, ["departure.iataCode", "departure.iata", "dep_iata", "origin", "from", "flight.airport.origin.code.iata"]) || null;

    const arr =
      pickAny(flat, ["arrival.iataCode", "arrival.iata", "arr_iata", "destination", "to", "flight.airport.destination.code.iata"]) || null;

    const schedDep =
      pickAny(flat, ["departure.scheduledTime", "departure.scheduled", "departure_time", "scheduled_departure", "scheduledDeparture",
                    "flight.time.scheduled.departure"]) || null;

    const schedArr =
      pickAny(flat, ["arrival.scheduledTime", "arrival.scheduled", "arrival_time", "scheduled_arrival", "scheduledArrival",
                    "flight.time.scheduled.arrival"]) || null;

    return { flightNo, dep, arr, schedDep, schedArr };
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  // ---------- Overflow menu ----------
  function closeMenu() {
    if (!els.menu || !els.overflowBtn) return;
    els.menu.classList.remove("open");
    els.overflowBtn.setAttribute("aria-expanded", "false");
  }
  function openMenu() {
    if (!els.menu || !els.overflowBtn) return;
    els.menu.classList.add("open");
    els.overflowBtn.setAttribute("aria-expanded", "true");
  }
  function toggleMenu(ev) {
    if (!els.menu || !els.overflowBtn) return;
    if (ev) ev.stopPropagation();
    if (els.menu.classList.contains("open")) closeMenu();
    else openMenu();
  }

  if (els.overflowBtn && els.menu) {
    els.overflowBtn.addEventListener("click", toggleMenu);
    document.addEventListener("click", (e) => {
      if (!els.menu.classList.contains("open")) return;
      if (els.menu.contains(e.target) || els.overflowBtn.contains(e.target)) return;
      closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
    els.menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn) closeMenu();
    });
  }

  // ---------- Controls ----------
  if (els.backBtn) els.backBtn.addEventListener("click", () => window.history.back());
  if (els.refreshBtn) els.refreshBtn.addEventListener("click", () => refreshNow(true));
  if (els.autoBtn) {
    els.autoBtn.addEventListener("click", () => {
      state.auto = !state.auto;
      els.autoBtn.setAttribute("aria-pressed", state.auto ? "true" : "false");
      els.autoBtn.textContent = `Auto-refresh: ${state.auto ? "On" : "Off"}`;
      if (state.auto) startAuto();
      else stopAuto();
    });
  }

  // ---------- Init ----------
  init();

  function init() {
    const params = new URLSearchParams(window.location.search);
    state.storageKey = params.get("key");

    let payload = null;
    if (state.storageKey) {
      const raw = safeGetSession(state.storageKey);
      if (raw) {
        try { payload = JSON.parse(raw); } catch { payload = null; }
      }
    }

    if (!payload) {
      const flightParam = params.get("flight");
      setText(els.headline, flightParam ? `Flight ${flightParam}` : "Flight details");
      setText(els.subhead, "Open this page from the list to see full details.");
      if (els.statusBadge) {
        els.statusBadge.className = "badge neutral";
        els.statusBadge.textContent = "Unavailable";
      }
      setText(els.sourceLine, "No stored flight context");
      stopAuto();
      return;
    }

    state.context = payload.context || null;
    state.current = payload.flight || null;

    render(state.current, null);
    startAuto();
  }

  function startAuto() {
    stopAuto();
    if (!state.auto) return;
    state.timer = setInterval(() => refreshNow(false), state.intervalMs);
  }

  function stopAuto() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  // ---------- Refresh (optional / best-effort) ----------
  function getFlightApiKey() {
    let k = safeGetLocal("flightapi_key");
    if (!k) {
      k = prompt("Enter your FlightAPI.io API key:");
      if (k) safeSetLocal("flightapi_key", k);
    }
    return k;
  }

  async function refreshNow(forceFeedback) {
    if (!state.context || !state.current) return;

    const apiKey = getFlightApiKey();
    if (!apiKey) return;

    try {
      const updated = await fetchBestEffortUpdate(apiKey, state.context, state.current);
      if (!updated) return;

      const prev = state.current;
      state.current = updated;

      if (state.storageKey) {
        safeSetSession(state.storageKey, JSON.stringify({ flight: state.current, context: state.context }));
      }

      render(state.current, prev);
      if (forceFeedback) flashStatus("good", "Updated");
    } catch (e) {
      console.error(e);
      if (forceFeedback) flashStatus("bad", "Refresh failed");
    }
  }

  function flashStatus(kind, text) {
    if (!els.statusBadge) return;
    els.statusBadge.className = `badge ${kind}`;
    els.statusBadge.textContent = text;
  }

  function scoreMatch(a, b) {
    let s = 0;
    const norm = (x) => String(x || "").trim().toUpperCase();
    if (a.flightNo && b.flightNo && norm(a.flightNo) === norm(b.flightNo)) s += 4;
    if (a.dep && b.dep && norm(a.dep) === norm(b.dep)) s += 2;
    if (a.arr && b.arr && norm(a.arr) === norm(b.arr)) s += 2;

    const td = timeDistanceMinutes(a.schedDep, b.schedDep);
    if (td !== null && td <= 10) s += 2;
    else if (td !== null && td <= 30) s += 1;

    const ta = timeDistanceMinutes(a.schedArr, b.schedArr);
    if (ta !== null && ta <= 10) s += 2;
    else if (ta !== null && ta <= 30) s += 1;

    return s;
  }

  function timeDistanceMinutes(t1, t2) {
    const a = toDate(t1);
    const b = toDate(t2);
    if (!a || !b) return null;
    return Math.abs(a.getTime() - b.getTime()) / 60000;
  }

  async function fetchBestEffortUpdate(apiKey, context, current) {
    const mode = context.mode || "departures";
    const airport = context.airport || "BRS";
    const day = context.day || 1;

    const url = new URL(`https://api.flightapi.io/schedule/${encodeURIComponent(apiKey)}`);
    url.searchParams.set("mode", mode);
    url.searchParams.set("iata", airport);
    url.searchParams.set("day", String(day));

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;

    const data = await res.json();

    const list =
      (Array.isArray(data) && data) ||
      (data && Array.isArray(data.data) && data.data) ||
      (data && Array.isArray(data.result) && data.result) ||
      null;

    if (!list) return null;

    const curId = deriveIdentity(current);

    let best = null;
    let bestScore = -1;
    for (const f of list) {
      const candId = deriveIdentity(f);
      const score = scoreMatch(curId, candId);
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    if (bestScore < 3) return null;
    return best;
  }

  // ---------- Render ----------
  function render(flight, prev) {
    if (!flight) return;

    const now = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
    setText(els.lastUpdated, `Last updated: ${now}`);

    if (els.sourceLine) {
      els.sourceLine.textContent = state.context
        ? `Source: FlightAPI schedule (${state.context.airport || "—"} • ${state.context.mode || "—"})`
        : "Source: stored flight";
    }

    const flat = flattenObject(flight);
    const id = deriveIdentity(flight);

    const route = `${id.dep || "—"} → ${id.arr || "—"}`;
    const displayNo = id.flightNo || "—";
    setText(els.headline, `${displayNo} • ${route}`);

    const depTime = fmtTime(pickAny(flat, [
      "flight.time.scheduled.departure",
      "departure.scheduledTime",
      "departure.scheduled",
      "scheduled_departure",
      "departure_time",
      "scheduledDeparture",
    ]));
    const arrTime = fmtTime(pickAny(flat, [
      "flight.time.scheduled.arrival",
      "arrival.scheduledTime",
      "arrival.scheduled",
      "scheduled_arrival",
      "arrival_time",
      "scheduledArrival",
    ]));
    setText(els.subhead, depTime && arrTime ? `${depTime} → ${arrTime}` : depTime ? `Departs ${depTime}` : "—");

    renderStatusBadge(flat);

    // Airline basics
    const airlineNameVal = pickAny(flat, ["airline.name", "flight.airline.name", "airlineName", "airline"]) || "—";
    const airlineIata = pickAny(flat, ["airline.iata", "airline.iataCode", "flight.airline.code.iata", "airline_iata", "airlineCode"]) || "";
    if (els.airlineName) els.airlineName.textContent = airlineNameVal;
    if (els.airlineCodeLine) els.airlineCodeLine.textContent = airlineIata ? `Airline code: ${airlineIata}` : "Airline code: —";

    // Logo (best effort)
    const logoIata = airlineIata || (displayNo !== "—" ? String(displayNo).slice(0, 2) : "");
    if (els.airlineLogo) {
      if (logoIata) {
        els.airlineLogo.src = `https://www.gstatic.com/flights/airline_logos/70px/${encodeURIComponent(logoIata)}.png`;
        els.airlineLogo.alt = `${airlineNameVal} logo`;
        els.airlineLogo.onerror = () => { els.airlineLogo.style.display = "none"; };
        els.airlineLogo.style.display = "";
      } else {
        els.airlineLogo.style.display = "none";
      }
    }

    // Aircraft (best effort)
    const acCode = pickAny(flat, ["aircraft.icaoCode", "aircraft.model.code", "flight.aircraft.model.code", "aircraftCode", "aircraft.code"]) || "";
    const acText = pickAny(flat, ["aircraft.model.text", "flight.aircraft.model.text", "aircraftType", "aircraft.text", "aircraft.model"]) || "";
    if (els.aircraftType) {
      els.aircraftType.textContent = acText ? `${acText}${acCode ? ` (${acCode})` : ""}` : acCode ? `Aircraft ${acCode}` : "Aircraft —";
    }
    const reg = pickAny(flat, ["aircraft.regNumber", "flight.aircraft.registration", "aircraft.registration", "registration"]) || "";
    const icao24 = pickAny(flat, ["aircraft.icao24", "icao24"]) || "";
    if (els.aircraftReg) {
      els.aircraftReg.textContent = reg
        ? `Registration: ${reg}${icao24 ? ` • ICAO24: ${icao24}` : ""}`
        : icao24 ? `ICAO24: ${icao24}` : "Registration: —";
    }

    // Aircraft image (if exists)
    const imgSrc = pickAny(flat, [
      "flight.aircraft.images.large[0].src",
      "flight.aircraft.images.medium[0].src",
      "flight.aircraft.images.thumbnails[0].src",
      "aircraft.images.large[0].src",
      "aircraft.images.medium[0].src",
      "aircraft.images.thumbnails[0].src",
    ]);
    const imgCredit = pickAny(flat, [
      "flight.aircraft.images.large[0].copyright",
      "flight.aircraft.images.large[0].source",
      "aircraft.images.large[0].copyright",
      "aircraft.images.large[0].source",
    ]) || "";

    if (els.aircraftImageWrap) {
      if (imgSrc) {
        if (els.aircraftImage) els.aircraftImage.src = imgSrc;
        els.aircraftImageWrap.style.display = "";
        if (els.aircraftImageCredit) els.aircraftImageCredit.textContent = imgCredit ? `Image: ${imgCredit}` : "";
      } else {
        els.aircraftImageWrap.style.display = "none";
      }
    }

    // Basic panels
    if (els.depKv) els.depKv.innerHTML = `<div class="small">Scheduled: ${escapeHtml(depTime || "—")}</div>`;
    if (els.arrKv) els.arrKv.innerHTML = `<div class="small">Scheduled: ${escapeHtml(arrTime || "—")}</div>`;

    // Raw JSON
    if (els.rawJson) els.rawJson.textContent = JSON.stringify(flight, null, 2);

    // Weather (CITY NAME based)
    renderWeatherByCityName(flat);
  }

  function renderStatusBadge(flat) {
    if (!els.statusBadge) return;
    const rawStatus = pickAny(flat, ["status", "flight_status", "arrival.status", "departure.status", "flight.status", "info.status"]) || "Unknown";
    const st = String(rawStatus).toLowerCase();

    let label = rawStatus;
    if (st.includes("cancel")) label = "Cancelled";
    else if (st.includes("delay")) label = "Delayed";
    else if (st.includes("boarding")) label = "Boarding";
    else if (st.includes("depart")) label = "Departed";
    else if (st.includes("land")) label = "Landed";
    else if (st.includes("scheduled") || st.includes("on time")) label = "On time";

    let cls = "neutral";
    if (st.includes("cancel")) cls = "bad";
    else if (st.includes("delay")) cls = "warn";
    else if (st.includes("on time") || st.includes("scheduled") || st.includes("boarding") || st.includes("active") || st.includes("depart") || st.includes("land"))
      cls = "good";

    els.statusBadge.className = `badge ${cls}`;
    els.statusBadge.textContent = label;
  }

  // ---------- Weather (city name only) ----------
  async function geocodeCity(cityName) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", cityName);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error("geocode");
    const data = await res.json();
    const r = data && Array.isArray(data.results) && data.results[0];
    if (!r) throw new Error("no-results");
    return { lat: r.latitude, lon: r.longitude, name: r.name, country: r.country, admin1: r.admin1 };
  }

  async function fetchWeather(lat, lon) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("current_weather", "true");
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error("weather");
    return res.json();
  }

  function cityFromFlight(flat, flightObj) {
  // Prefer an explicit destination city name if the API provides one.
  const cityCandidates = [
    "flight.airport.destination.city",
    "flight.airport.destination.cityName",
    "flight.destination.city",
    "destination.city",
    "arrival.city",
    "arrival.cityName",
    "arrival.airport.city",
    "toCity",
    "destinationCity",
  ];
  const explicitCity = pickAny(flat, cityCandidates);
  if (explicitCity) return String(explicitCity).trim();

  // Fallback: many feeds only provide an airport/IATA code for destination.
  const codeCandidates = [
    "arrival.iataCode",
    "arrival.iata_code",
    "arrival.iata",
    "arrival.airport.iataCode",
    "arrival.airport.iata_code",
    "arrival.airport.iata",
    "arrival.airport.code",
    "arrivalAirportIata",
    "arrivalAirportCode",
    "destination.iata",
    "destination.iataCode",
    "destination.iata_code",
    "destinationAirport",
    "destinationAirportCode",
    "to",
    "toCode",
    "flight.airport.destination.code",
    "flight.airport.destination.iata",
    "flight.airport.destination.iataCode",
    "flight.destination.iata",
    "flight.destination.iataCode",
  ];
  const codeRaw = pickAny(flat, codeCandidates);
  let code = codeRaw ? String(codeRaw).trim().toUpperCase() : "";

  // Extra fallback: use the same identity derivation the page already uses for the header.
  if (!code && flightObj) {
    try {
      const id = deriveIdentity(flightObj);
      if (id && id.arr) code = String(id.arr).trim().toUpperCase();
    } catch {}
  }

  if (code) return getCityName(code).trim();
  return "";
}

  async function renderWeatherByCityName(flat) {
    if (!els.weatherBox) return;

    const city = cityFromFlight(flat, state.current);
    console.log("Extracted city:", city, "| arrival.iataCode=", flat["arrival.iataCode"], "| arrival.iata=", flat["arrival.iata"], "| destination.iataCode=", flat["destination.iataCode"]);  // Add this line to see the city being extracted
    if (!city) {
      if (els.wxHint) els.wxHint.textContent = "Weather";
      els.weatherBox.innerHTML = `<div class="small">Weather unavailable (no destination city in flight data).</div>`;
      return;
    }

    if (els.wxHint) els.wxHint.textContent = `Destination weather • ${city}`;
    els.weatherBox.innerHTML = `<div class="small">Loading weather for ${escapeHtml(city)}…</div>`;

    try {
      // Cache geocode+wx for a short window to avoid hammering APIs.
      const cacheKey = `wx_city_${city.toLowerCase()}`;
      const cachedRaw = safeGetLocal(cacheKey);
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.t && (Date.now() - cached.t) < 15 * 60 * 1000 && cached.html) {
            els.weatherBox.innerHTML = cached.html;
            return;
          }
        } catch {}
      }

      const g = await geocodeCity(city);
      const wx = await fetchWeather(g.lat, g.lon);

      const cur = wx?.current_weather;
      const daily = wx?.daily;
      const todayMax = daily?.temperature_2m_max?.[0];
      const todayMin = daily?.temperature_2m_min?.[0];
      const rain = daily?.precipitation_probability_max?.[0];

      const place = [g.name, g.admin1, g.country].filter(Boolean).join(", ");

      const htmlOut = `
        <div class="callout" style="margin-top:0;">
          <div class="hero-title">${escapeHtml(place)}</div>
          <div class="panel-grid" style="margin-top:10px;">
            <div class="kpi">
              <div class="label">Now</div>
              <div class="value mono">${cur ? `${Math.round(cur.temperature)}°C` : "—"}</div>
              <div class="small">${cur ? `Wind ${Math.round(cur.windspeed)} km/h` : ""}</div>
            </div>
            <div class="kpi">
              <div class="label">Today</div>
              <div class="value mono">${(todayMin !== undefined && todayMax !== undefined) ? `${Math.round(todayMin)}–${Math.round(todayMax)}°C` : "—"}</div>
              <div class="small">${rain !== undefined ? `Rain chance ${Math.round(rain)}%` : ""}</div>
            </div>
          </div>
          <div class="small" style="margin-top:10px;">Powered by Open‑Meteo (geocoding + forecast).</div>
        </div>
      `;

      els.weatherBox.innerHTML = htmlOut;
      safeSetLocal(cacheKey, JSON.stringify({ t: Date.now(), html: htmlOut }));
    } catch (e) {
      console.error(e);
      els.weatherBox.innerHTML = `<div class="small">Weather unavailable for ${escapeHtml(city)} right now.</div>`;
    }
  }

})();
