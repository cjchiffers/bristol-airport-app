/* flight-details.js
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

  function guessCityFromCode(code) {
    const c = (code || "").toUpperCase().trim();
    return airportCodeToCityName[c] || "";
  }

  function getCityName(code) { return airportCodeToCityName[code] || code || ""; }

  // Width and height of the route SVG canvas
  const ROUTE_SVG_W = 1000;
  const ROUTE_SVG_H = 420;

  // Function to project longitude and latitude into SVG coordinates
  function projectLonLatToSvg(lon, lat) {
    // Equirectangular projection:
    // lon -180..180 -> x 0..W
    // lat  90..-90  -> y 0..H
    const x = ((lon + 180) / 360) * ROUTE_SVG_W;
    const y = ((90 - lat) / 180) * ROUTE_SVG_H;
    return { x, y };
  }

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
    mapHint: document.getElementById("mapHint"),
    routeSvg: document.getElementById("routeSvg"),
    aircraftImageCredit: document.getElementById("aircraftImageCredit"),

    // Weather
    weatherBox: document.getElementById("weatherBox"),
    wxHint: document.getElementById("wxHint"),
  };

  // ---------- State ----------
  const state = {
    storageKey: null,
    context: null,
    current: null,
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

  // Utility function to create SVG elements (supports text content)
  function svgEl(name, attrs = {}, text = null) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== null && text !== undefined) el.textContent = String(text);
    return el;
  }

  async function geocodeCached(cityName) {
    const key = `geo_city_${String(cityName).toLowerCase()}`;
    const cachedRaw = safeGetLocal(key);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (cached && typeof cached.lat === "number" && typeof cached.lon === "number") return cached;
      } catch {}
    }

    const geoData = await geocodeCity(cityName);
    if (geoData && typeof geoData.latitude === "number" && typeof geoData.longitude === "number") {
      const out = { lat: geoData.latitude, lon: geoData.longitude, name: geoData.name || cityName };
      safeSetLocal(key, JSON.stringify(out));
      return out;
    }
    return null;
  }

  async function geocodeCity(cityName) {
    // Free geocoding via Open-Meteo (no API key)
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", cityName);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!r) return null;

    return { latitude: r.latitude, longitude: r.longitude, name: r.name || cityName };
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  // ---------- Derive flight identity ----------
  function deriveIdentity(f) {
    const flat = flattenObject(f || {});
    const flightNo =
      pickAny(flat, ["flight.departure.iataCode", "flight.departure.iata_code", "flight.departure.iata",
        "flight.origin.iataCode", "flight.origin.iata_code", "flight.origin.iata",
        "flight.iataNumber", "flight_iata", "flightNumber", "number", "flight_no", "flight.iata"]) || null;

    const dep =
      pickAny(flat, ["departure.iataCode", "departure.iata", "dep_iata", "origin", "from", "flight.airport.origin.code.iata"]) || null;

    const arr =
      pickAny(flat, ["flight.arrival.iataCode", "flight.arrival.iata_code", "flight.arrival.iata",
        "flight.destination.iataCode", "flight.destination.iata_code", "flight.destination.iata",
        "arrival.iataCode", "arrival.iata", "arr_iata", "destination", "to", "flight.airport.destination.code.iata"]) || null;

    const schedDep =
      pickAny(flat, ["departure.scheduledTime", "departure.scheduled", "departure_time", "scheduled_departure", "scheduledDeparture",
        "flight.time.scheduled.departure"]) || null;

    const schedArr =
      pickAny(flat, ["arrival.scheduledTime", "arrival.scheduled", "arrival_time", "scheduled_arrival", "scheduledArrival",
        "flight.time.scheduled.arrival"]) || null;

    return { flightNo, dep, arr, schedDep, schedArr };
  }

  // ---------- Route map (SVG) ----------
  async function renderRouteMapFromFlight(flight, id) {
    if (!els.routeSvg) return;

    els.routeSvg.replaceChildren();

    // Subtle background so the grid is visible regardless of surrounding styles
    els.routeSvg.append(svgEl("rect", { x: 0, y: 0, width: ROUTE_SVG_W, height: ROUTE_SVG_H, fill: "var(--surface)", opacity: "0.35" }));

    const depCode = (id && id.dep) ? String(id.dep).toUpperCase() : "";
    const arrCode = (id && id.arr) ? String(id.arr).toUpperCase() : "";

    const depCity = guessCityFromCode(depCode) || depCode;
    const arrCity = guessCityFromCode(arrCode) || arrCode;

    if (els.mapHint) {
      els.mapHint.textContent = depCode && arrCode ? `${depCode} → ${arrCode}` : "—";
    }

    if (!depCity || !arrCity) {
      els.routeSvg.append(
        svgEl("text", { x: ROUTE_SVG_W / 2, y: ROUTE_SVG_H / 2, "text-anchor": "middle", "dominant-baseline": "middle", opacity: "0.75", "font-size": "18" }, "Route unavailable")
      );
      return;
    }

    const [depGeo, arrGeo] = await Promise.all([
      geocodeCached(depCity),
      geocodeCached(arrCity),
    ]);

    if (!depGeo || !arrGeo) {
      els.routeSvg.append(
        svgEl("text", { x: ROUTE_SVG_W / 2, y: ROUTE_SVG_H / 2, "text-anchor": "middle", "dominant-baseline": "middle", opacity: "0.75", "font-size": "18" }, "Route unavailable")
      );
      return;
    }

    const p1 = projectLonLatToSvg(depGeo.lon, depGeo.lat);
    const p2 = projectLonLatToSvg(arrGeo.lon, arrGeo.lat);

    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;
    const arc = Math.max(30, Math.min(140, dist * 0.25));
    const nx = -dy / dist;
    const ny = dx / dist;
    const cx = mx + nx * arc;
    const cy = my + ny * arc;

    const grid = svgEl("g", { opacity: "0.40" });
    const stepX = 100, stepY = 70;
    for (let x = 0; x <= ROUTE_SVG_W; x += stepX)
      grid.append(svgEl("line", { x1: x, y1: 0, x2: x, y2: ROUTE_SVG_H, stroke: "currentColor", "stroke-width": "1", opacity: "0.12" }));
    for (let y = 0; y <= ROUTE_SVG_H; y += stepY)
      grid.append(svgEl("line", { x1: 0, y1: y, x2: ROUTE_SVG_W, y2: y, stroke: "currentColor", "stroke-width": "1", opacity: "0.12" }));
    els.routeSvg.append(grid);

    const pathD = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    els.routeSvg.append(
      svgEl("path", { d: pathD, fill: "none", stroke: "currentColor", "stroke-width": "4", opacity: "0.92" })
    );

    const markerAttrs = { r: "8", fill: "currentColor", opacity: "0.95" };
    els.routeSvg.append(svgEl("circle", { cx: p1.x, cy: p1.y, ...markerAttrs }));
    els.routeSvg.append(svgEl("circle", { cx: p2.x, cy: p2.y, ...markerAttrs }));

    const labelGroup = svgEl("g", { "font-size": "16", opacity: "0.95" });
    const pad = 14;
    labelGroup.append(svgEl("text", { x: Math.min(Math.max(p1.x + pad, 8), ROUTE_SVG_W - 8), y: Math.min(Math.max(p1.y - pad, 18), ROUTE_SVG_H - 8) }, depCode || depCity));
    labelGroup.append(svgEl("text", { x: Math.min(Math.max(p2.x + pad, 8), ROUTE_SVG_W - 8), y: Math.min(Math.max(p2.y - pad, 18), ROUTE_SVG_H - 8), "text-anchor": "start" }, arrCode || arrCity));
    els.routeSvg.append(labelGroup);
  }

  // ---------- Weather ----------
  // Fetch weather for the destination (next 3 days)
  async function fetchWeather(lat, lon) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode");
    url.searchParams.set("forecast_days", "3");
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
    const data = await res.json();
    return data.daily || null;
  }

  async function renderWeatherByCityName(flat) {
    if (els.weatherBox) els.weatherBox.innerHTML = "";
    setText(els.wxHint, "Loading…");

    // Try a few common shapes for destination IATA in Aviation Edge payloads
    const destinationAirportCode = (pickAny(flat, [
      "flight.arrival.iataCode",
      "flight.arrival.iata_code",
      "flight.destination.iataCode",
      "flight.destination.iata_code",
      "arrival.iataCode",
      "arrival.iata",
      "arr_iata",
      "arr",
      "destination",
      "to",
    ]) || "").toUpperCase().trim();

    if (!destinationAirportCode) {
      setText(els.wxHint, "Destination not found in flight data.");
      return;
    }

    const cityName = getCityName(destinationAirportCode);

    try {
      const geoData = await geocodeCached(cityName);
      if (!geoData) {
        setText(els.wxHint, `Weather unavailable for ${cityName}.`);
        return;
      }

      const daily = await fetchWeather(geoData.lat, geoData.lon);
      displayWeatherForecast(daily);
    } catch (error) {
      console.error("Weather fetch error:", error);
      setText(els.wxHint, "Error fetching weather.");
    }
  }

  // Display the fetched weather data (expects Open-Meteo 'daily' object)
  function displayWeatherForecast(daily) {
    if (!els.weatherBox) return;

    if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) {
      els.weatherBox.innerHTML = "";
      setText(els.wxHint, "Weather unavailable.");
      return;
    }

    const days = Math.min(3, daily.time.length);

    let forecastHtml = '<div class="wx-grid">';
    for (let i = 0; i < days; i++) {
      const date = daily.time[i];
      const tMax = daily.temperature_2m_max?.[i];
      const tMin = daily.temperature_2m_min?.[i];
      const code = daily.weathercode?.[i];

      forecastHtml += `
        <div class="wx-card">
          <div class="wx-title">${escapeHtml(date)}</div>
          <div class="wx-sub">Max: ${escapeHtml(tMax)}°C • Min: ${escapeHtml(tMin)}°C</div>
          <div class="wx-sub">Code: ${escapeHtml(code)}</div>
        </div>`;
    }
    forecastHtml += "</div>";

    setText(els.wxHint, "Next 3 days");
    els.weatherBox.innerHTML = forecastHtml;
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
  const apiKey = "YOUR_API_KEY_HERE";  // Replace with your actual API key

  async function refreshNow(forceFeedback) {
    if (!state.context || !state.current) return;

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
    const mode = context.mode || "departure";

    const url = new URL(`https://aviation-edge.com/v2/public/timetable?key=${encodeURIComponent(apiKey)}`);
    url.searchParams.set("type", mode);

    // NOTE: your original code referenced `flightNo` here, but it isn't defined in this scope.
    // If you want refreshing to work, derive it from `current`:
    const curId = deriveIdentity(current);
    if (curId.flightNo) url.searchParams.set("flight_Iata", curId.flightNo);

    url.searchParams.set("iataCode", "BRS");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;

    const data = await res.json();

    const list =
      (Array.isArray(data) && data) ||
      (data && Array.isArray(data.data) && data.data) ||
      (data && Array.isArray(data.result) && data.result) ||
      null;

    if (!list) return null;

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

    renderRouteMapFromFlight(flight, id).catch((e) => console.warn("Route map render failed:", e));

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

    const airlineNameVal = pickAny(flat, ["airline.name", "flight.airline.name", "airlineName", "airline"]) || "—";
    const airlineIata = pickAny(flat, ["airline.iata", "airline.iataCode", "flight.airline.code.iata", "airline_iata", "airlineCode"]) || "";
    if (els.airlineName) els.airlineName.textContent = airlineNameVal;
    if (els.airlineCodeLine) els.airlineCodeLine.textContent = airlineIata ? `Airline code: ${airlineIata}` : "Airline code: —";

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

    if (els.depKv) els.depKv.innerHTML = `<div class="small">Scheduled: ${escapeHtml(depTime || "—")}</div>`;
    if (els.arrKv) els.arrKv.innerHTML = `<div class="small">Scheduled: ${escapeHtml(arrTime || "—")}</div>`;

    if (els.rawJson) els.rawJson.textContent = JSON.stringify(flight, null, 2);

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
})();
