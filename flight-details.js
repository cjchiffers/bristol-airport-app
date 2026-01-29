console.log("[BRS Flights] flight-details.js BUILD_20260104_TOP5 loaded");
/* flight-details.js
   Route map upgrade (Leaflet basemap + animated route + dark/light) + Weather (Open‑Meteo)
   Notes:
   - Uses Leaflet tiles (no API key) when available; falls back to your SVG route if Leaflet isn't loaded.
   - Weather remains Open‑Meteo (free) via geocoding -> forecast.
*/

  "use strict";

  
console.log("[BRS Flights] flight-details.js BUILD_20260108_fixA loaded");
// --- Airport code -> city name (for geocoding). Add as needed.
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
    "BRS": "Bristol",
    "CDG": "Paris Charles de Gaulle",
    "CFU": "Corfu",
    "CUN": "Cancun",
    "DAA": "Sharm el Sheikh",
    "DLM": "Dalaman",
    "EDI": "Edinburgh",
    "FAO": "Faro",
    "FCO": "Rome",
    "FNC": "Madeira",
    "FUE": "Fuerteventura",
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

  // Optional: airport coordinates lookup (IATA -> {lat, lon}).
  // If you have a full table, you can set window.airportCoords = {...} before this script.
  const airportCoords = (typeof window !== "undefined" && window.airportCoords && typeof window.airportCoords === "object")
    ? window.airportCoords
    : {};

  // ---------- Airport geocoding (robust pin placement) ----------
  // We prefer an explicit lat/lon table when available (window.airportCoords),
  // otherwise we geocode using Open‑Meteo and *prefer airport features* (feature_code=AIRP).
  // Results are cached in localStorage for fast repeat loads.
  const AIRPORT_GEO_CACHE_KEY = "brs_airport_geo_cache_v1";
  const AIRPORT_GEO_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

  function loadAirportGeoCache() {
    try {
      const raw = localStorage.getItem(AIRPORT_GEO_CACHE_KEY);
      if (!raw) return { ts: 0, data: {} };
      const parsed = JSON.parse(raw);
      const ts = Number(parsed && parsed.ts) || 0;
      const data = (parsed && parsed.data && typeof parsed.data === "object") ? parsed.data : {};
      return { ts, data };
    } catch {
      return { ts: 0, data: {} };
    }
  }
  function saveAirportGeoCache(cache) {
    try { localStorage.setItem(AIRPORT_GEO_CACHE_KEY, JSON.stringify(cache)); } catch {}
  }

  function isValidLatLon(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) &&
      Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
      !(Math.abs(lat) < 0.001 && Math.abs(lon) < 0.001);
  }

  function airportQueryFromIata(iata) {
    const code = normIata(iata);
    if (!code) return "";
    const mapped = getCityName(code);
    // If mapping already looks like an airport name, keep it; otherwise bias to airports.
    if (/airport/i.test(mapped)) return mapped;
    // Some mappings are "Paris Charles de Gaulle" etc; appending "Airport" helps Open‑Meteo pick AIRP.
    return mapped ? `${mapped} Airport` : `${code} Airport`;
  }

  async function geocodeAirportOpenMeteo(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", q);
    url.searchParams.set("count", "5");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const results = (data && Array.isArray(data.results)) ? data.results : [];
    if (!results.length) return null;

    // Prefer airports explicitly.
    const best = results.find(r => String(r.feature_code || "").toUpperCase() === "AIRP") || results[0];
    const lat = Number(best.latitude);
    const lon = Number(best.longitude);
    if (!isValidLatLon(lat, lon)) return null;

    return { lat, lon, name: best.name || q };
  }

  async function geocodeCachedQuery(queryOrIata) {
    // Accept either a free-text query (for SVG fallback) or an IATA-ish string.
    const raw = String(queryOrIata || "").trim();
    if (!raw) return null;

    // If it's a 3-letter code, treat as IATA.
    const isIata = /^[A-Za-z]{3}$/.test(raw);
    const key = isIata ? normIata(raw) : raw.toLowerCase();

    const now = Date.now();
    const cache = loadAirportGeoCache();
    const fresh = (now - (cache.ts || 0)) < AIRPORT_GEO_TTL_MS;
    if (fresh && cache.data && cache.data[key]) return cache.data[key];

    const query = isIata ? airportQueryFromIata(key) : raw;
    const geo = await geocodeAirportOpenMeteo(query);
    if (!geo) return null;

    const entry = { lat: geo.lat, lon: geo.lon, name: geo.name, q: query, t: now };
    // Update cache (keep old entries too)
    cache.ts = now;
    cache.data = cache.data || {};
    cache.data[key] = entry;
    saveAirportGeoCache(cache);

    return entry;
  }


  function getCityName(code) {
    const c = (code || "").toUpperCase().trim();
    return airportCodeToCityName[c] || (code || "");
  }

  // ---------- DOM ----------
  const els = {
    headline: document.getElementById("headline"),
    subhead: document.getElementById("subhead"),
    lastUpdated: document.getElementById("lastUpdated"),
    sourceLine: document.getElementById("sourceLine"),
    statusBadge: document.getElementById("statusBadge"),
    statusBanner: document.getElementById("statusBanner"),
    opsBar: document.getElementById("opsBar"),
    netBanner: document.getElementById("netBanner"),
    refreshSpin: document.getElementById("refreshSpin"),

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
    routeMap: document.getElementById("routeMap"),
    aircraftImageCredit: document.getElementById("aircraftImageCredit"),

    // Weather
    weatherBox: document.getElementById("weatherBox"),
    wxHint: document.getElementById("wxHint"),

    // Flight time hero (original)
    depDate: document.getElementById("depDate"),
    arrDate: document.getElementById("arrDate"),
    depAirport: document.getElementById("depAirport"),
    arrAirport: document.getElementById("arrAirport"),
    depTimeActual: document.getElementById("depTimeActual"),
    depTimeSched: document.getElementById("depTimeSched"),
    arrTimeActual: document.getElementById("arrTimeActual"),
    arrTimeSched: document.getElementById("arrTimeSched"),
    depDelay: document.getElementById("depDelay"),
    arrDelay: document.getElementById("arrDelay"),

    // New Hero Card elements
    heroCard: document.getElementById("heroCard"),
    heroFlightNumber: document.getElementById("heroFlightNumber"),
    heroDepDate: document.getElementById("heroDepDate"),
    heroDepCity: document.getElementById("heroDepCity"),
    heroDepTime: document.getElementById("heroDepTime"),
    heroDepTimeOld: document.getElementById("heroDepTimeOld"),
    heroDepDelay: document.getElementById("heroDepDelay"),
    heroArrDate: document.getElementById("heroArrDate"),
    heroArrCity: document.getElementById("heroArrCity"),
    heroArrTime: document.getElementById("heroArrTime"),
    heroArrTimeOld: document.getElementById("heroArrTimeOld"),
    heroArrDelay: document.getElementById("heroArrDelay"),
    // Hero pills
    heroGateDep: document.getElementById("heroGateDep"),
    heroBelt: document.getElementById("heroBelt"),
    heroCountdown: document.getElementById("heroCountdown"),
    heroCountdownText: document.getElementById("heroCountdownText"),
  };

  // ---------- State ----------
  const state = {
    storageKey: null,
    context: null,
    current: null,
    auto: true,
    intervalMs: 30000,
    timer: null,

    fetching: false,
    lastFetchOk: true,

    // Leaflet map
    map: null,
    tileLight: null,
    tileDark: null,
    mapTheme: null,
    themeOverridden: false,
    routeGroup: null,
    routeLine: null,
    depMarker: null,
    arrMarker: null,
    planeMarker: null,
    animRaf: null,
    lastRouteKey: null,
    prefersDark: window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null,
  };

  // ---------- Ops change tracking (session scoped) ----------
  // Used to detect "gate changed" and highlight accordingly.
  function getOpsKey(suffix) {
    const k = state && state.storageKey ? state.storageKey : "unknown";
    return `fd_${k}_${suffix}`;
  }

  function opsChanged(suffix, nextVal) {
    try {
      const key = getOpsKey(suffix);
      const prev = sessionStorage.getItem(key);
      const next = (nextVal == null) ? "" : String(nextVal).trim();
      // Only count as "changed" if we had a previous non-empty value and it differs.
      // IMPORTANT: if the API temporarily stops returning a value, we DO NOT overwrite the stored
      // previous value. Otherwise we lose change detection and create false positives.
      const prevNorm = (prev == null) ? "" : String(prev).trim();
      const nextNorm = next;
      const changed = (prevNorm !== "" && nextNorm !== "" && prevNorm !== nextNorm);

      // Only persist when we have a real value.
      if (nextNorm !== "") sessionStorage.setItem(key, nextNorm);

      return changed;
    } catch {
      return false;
    }
  }

  // ---------- Storage helpers ----------
  function safeGetLocal(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function safeSetLocal(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
  function safeGetSession(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
  function safeSetSession(key, value) { try { sessionStorage.setItem(key, value); return true; } catch { return false; } }

  // ---------- Utilities ----------
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
    if (!Number.isNaN(n) && String(v).length >= 10) return new Date(n < 2e10 ? n * 1000 : n);

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
    if (typeof obj !== "object") { out[prefix || "value"] = obj; return out; }
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

  function setText(el, text) { if (el) el.textContent = text; }

  function deriveIdentity(f) {
    const flat = flattenObject(f || {});
    const flightNo =
      pickAny(flat, [
        "flight.iataNumber", "flight_iata", "flightNumber", "number", "flight_no", "flight.iata",
        "flight.iata_number",
      ]) || null;

    const dep =
      pickAny(flat, [
        "departure.iataCode", "departure.iata", "dep_iata", "origin", "from", "flight.departure.iataCode",
        "flight.departure.iata_code", "flight.origin.iataCode", "flight.airport.origin.code.iata",
      ]) || null;

    const arr =
      pickAny(flat, [
        "arrival.iataCode", "arrival.iata", "arr_iata", "destination", "to", "flight.arrival.iataCode",
        "flight.arrival.iata_code", "flight.destination.iataCode", "flight.airport.destination.code.iata",
      ]) || null;

    const schedDep =
      pickAny(flat, [
        "departure.scheduledTime", "departure.scheduled", "departure_time", "scheduled_departure", "scheduledDeparture",
        "flight.time.scheduled.departure",
      ]) || null;

    const schedArr =
      pickAny(flat, [
        "arrival.scheduledTime", "arrival.scheduled", "arrival_time", "scheduled_arrival", "scheduledArrival",
        "flight.time.scheduled.arrival",
      ]) || null;

    return { flightNo, dep, arr, schedDep, schedArr };
  }

  // ---------- Menu ----------
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
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
    els.menu.addEventListener("click", (e) => { if (e.target.closest("button")) closeMenu(); });
  }

  // ---------- Controls ----------
  if (els.backBtn) els.backBtn.addEventListener("click", () => window.history.back());
  if (els.refreshBtn) els.refreshBtn.addEventListener("click", () => refreshNow(true));
  if (els.autoBtn) {
    els.autoBtn.addEventListener("click", () => {
      state.auto = !state.auto;
      els.autoBtn.setAttribute("aria-pressed", state.auto ? "true" : "false");
      els.autoBtn.textContent = `Auto-refresh: ${state.auto ? "On" : "Off"}`;
      if (state.auto) startAuto(); else stopAuto();
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
      if (raw) { try { payload = JSON.parse(raw); } catch { payload = null; } }
    }

    if (!payload) {
      const flightParam = params.get("flight");
      setText(els.headline, flightParam ? `Flight ${flightParam}` : "Flight details");
      setText(els.subhead, "Open this page from the list to see full details.");
      if (els.statusBadge) { els.statusBadge.className = "badge neutral"; els.statusBadge.textContent = "Unavailable"; }
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
  function stopAuto() { if (state.timer) clearInterval(state.timer); state.timer = null; }

  // ---------- Refresh (best-effort) ----------
  const apiKey = "26071f-14ef94"; // Aviation Edge key

  async function refreshNow(forceFeedback) {
    if (!state.context || !state.current) return;
    setFetching(true);
    try {
      const updated = await fetchBestEffortUpdate(apiKey, state.context, state.current);
      if (!updated) return;

      const prev = state.current;
      state.current = updated;

      if (state.storageKey) safeSetSession(state.storageKey, JSON.stringify({ flight: state.current, context: state.context }));
      render(state.current, prev);
      setNetBanner(false);
      if (forceFeedback) flashStatus("good", "Updated");
    } catch (e) {
      console.error(e);
      setNetBanner(true);
      if (forceFeedback) flashStatus("bad", "Refresh failed");
    } finally {
      setFetching(false);
    }
  }

  function setFetching(isFetching) {
    state.fetching = !!isFetching;
    if (els.refreshSpin) {
      els.refreshSpin.className = `refresh-spin${state.fetching ? " on" : ""}`;
    }
  }

  function setNetBanner(isError) {
    state.lastFetchOk = !isError;
    if (!els.netBanner) return;
    if (!isError) {
      els.netBanner.style.display = "none";
      els.netBanner.textContent = "";
      return;
    }
    els.netBanner.style.display = "";
    els.netBanner.textContent = "Connection issue — showing last known data.";
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

  async function fetchBestEffortUpdate(apiKey_, context, current) {
    // UI uses plural ("departures"/"arrivals"), but Aviation Edge timetable expects singular ("departure"/"arrival").
    const normalizeMode = (m) => {
      const x = String(m || "").trim().toLowerCase();
      if (x === "departures") return "departure";
      if (x === "arrivals") return "arrival";
      if (x === "departure" || x === "arrival") return x;
      return "departure";
    };

    const mode = normalizeMode(context.mode);
    const airport = context.airport || "BRS";

    const curId = deriveIdentity(current);
    const flightNo = curId.flightNo || "";

    const url = new URL("https://aviation-edge.com/v2/public/timetable");
    url.searchParams.set("key", apiKey_ || "");
    url.searchParams.set("type", mode);
    if (flightNo) url.searchParams.set("flight_Iata", flightNo);
    url.searchParams.set("iataCode", airport);

    console.log("[BRS Flights] timetable request", { mode, url: url.toString(), contextMode: context && context.mode });
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
      if (score > bestScore) { bestScore = score; best = f; }
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
        ? `Source: Timetable (${state.context.airport || "—"} • ${state.context.mode || "—"})`
        : "Source: stored flight";
    }

    const flat = flattenObject(flight);
    const id = deriveIdentity(flight);

    const route = `${id.dep || "—"} → ${id.arr || "—"}`;
    const displayNo = id.flightNo || "—";
    setText(els.headline, `${displayNo} • ${route}`);

    // Route map
    renderRouteMapFromFlight(flight, id, flat).catch((e) => console.warn("Route map render failed:", e));

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

    // Big time hero (departure / arrival times + delay chips)
    renderTimeHero(flight, flat, id);
    
    // New hero card (app-style flight overview)
    renderHeroCard(flight, flat, id);

    // Status + operational info
    // Keep this page "glanceable": no duplicated top banners.
    renderStatusBadge(flat);
    renderOpsBar(flight, flat);

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
      } else els.airlineLogo.style.display = "none";
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
      } else els.aircraftImageWrap.style.display = "none";
    }

    // Basic panels (more details)
const depInfo = {
  sched: fmtTime(pickAny(flat, ["flight.time.scheduled.departure","departure.scheduledTime","departure.scheduled","scheduled_departure","departure_time","scheduledDeparture"])),
  est: fmtTime(pickAny(flat, ["departure.estimatedTime","departure.estimated","estimated_departure","departure_estimated","flight.time.estimated.departure"])),
  act: fmtTime(pickAny(flat, ["departure.actualTime","departure.actual","actual_departure","departure_actual","flight.time.actual.departure"])),
  term: pickAny(flat, ["departure.terminal","flight.departure.terminal","departureTerminal"]) || "",
  gate: pickAny(flat, ["departure.gate","flight.departure.gate","departureGate"]) || "",
  stand: pickAny(flat, ["departure.stand","flight.departure.stand","departureStand"]) || "",
};

depInfo.gateChanged = opsChanged('gate_dep', depInfo.gate);


const arrInfo = {
  sched: fmtTime(pickAny(flat, ["flight.time.scheduled.arrival","arrival.scheduledTime","arrival.scheduled","scheduled_arrival","arrival_time","scheduledArrival"])),
  est: fmtTime(pickAny(flat, ["arrival.estimatedTime","arrival.estimated","estimated_arrival","arrival_estimated","flight.time.estimated.arrival"])),
  act: fmtTime(pickAny(flat, ["arrival.actualTime","arrival.actual","actual_arrival","arrival_actual","flight.time.actual.arrival"])),
  term: pickAny(flat, ["arrival.terminal","flight.arrival.terminal","arrivalTerminal"]) || "",
  gate: pickAny(flat, ["arrival.gate","flight.arrival.gate","arrivalGate"]) || "",
  belt: pickAny(flat, ["arrival.baggage","arrival.belt","flight.arrival.baggage","baggage"]) || "",
};

arrInfo.gateChanged = opsChanged('gate_arr', arrInfo.gate);
arrInfo.beltChanged = opsChanged('belt_arr', arrInfo.belt);


function kvLine(label, val) {
  if (!val) return "";
  return `<div class="kv-line"><span class="kv-k">${escapeHtml(label)}</span><span class="kv-v">${escapeHtml(val)}</span></div>`;
}

if (els.depKv) {
  els.depKv.innerHTML = `
    <div class="kv-stack">
      ${kvLine("Scheduled", depInfo.sched || "—")}
      ${kvLine("Estimated", depInfo.est)}
      ${kvLine("Actual", depInfo.act)}
      ${kvLine("Terminal", depInfo.term)}
      ${kvLine(depInfo.gateChanged ? "New gate" : "Gate", depInfo.gate, true, depInfo.gateChanged ? "newgate" : "gate")}
      ${kvLine("Stand", depInfo.stand)}
    </div>
  `;
}

if (els.arrKv) {
  els.arrKv.innerHTML = `
    <div class="kv-stack">
      ${kvLine("Scheduled", arrInfo.sched || "—")}
      ${kvLine("Estimated", arrInfo.est)}
      ${kvLine("Actual", arrInfo.act)}
      ${kvLine("Terminal", arrInfo.term)}
      ${kvLine(arrInfo.gateChanged ? "New gate" : "Gate", arrInfo.gate, true, arrInfo.gateChanged ? "newgate" : "gate")}
      ${kvLine("Belt", arrInfo.belt, true, "belt")}
    </div>
  `;
}


    // Raw JSON
    if (els.rawJson) els.rawJson.textContent = JSON.stringify(flight, null, 2);

    
    // KPIs (duration, distance, carbon, delay trend)
    renderKpis(flat, id);
// Weather
    renderWeatherByCityName(flat).catch((e) => console.warn("Weather render failed:", e));
  }

  // Back-compat: older cached builds called this. We now avoid the big green banner entirely.
  function renderStatusBannerAndOps(flight, flat, id) {
    renderOpsBar(flight, flat);
    // Safety: if an old HTML still includes the banner element, hide it.
    if (els.statusBanner) {
      els.statusBanner.style.display = "none";
      els.statusBanner.innerHTML = "";
    }
  }

  function renderOpsBar(flight, flat) {
    if (!els.opsBar) return;
    const t = String((flight && flight.type) || (state.context && state.context.mode) || "").toLowerCase();
    const isDeparture = t.includes("depart");

    const dep = (flight && flight.departure) || {};
    const arr = (flight && flight.arrival) || {};

    // Aviation Edge / timetables are inconsistent. Prefer multiple field shapes.
    const gate = (
      (isDeparture ? dep.gate : arr.gate) ||
      pickAny(flat || {}, [
        "departure.gate", "departure.gateNumber", "departureGate", "gate", "gate_number",
        "arrival.gate", "arrival.gateNumber", "arrivalGate",
      ])
    ) || null;

    const terminal = (
      (isDeparture ? dep.terminal : arr.terminal) ||
      pickAny(flat || {}, [
        "departure.terminal", "departureTerminal", "terminal", "terminal_number",
        "arrival.terminal", "arrivalTerminal",
      ])
    ) || null;

    const baggage = (
      (!isDeparture ? arr.baggage : null) ||
      (!isDeparture ? pickAny(flat || {}, [
        "arrival.baggage", "arrival.baggage_belt", "arrival.baggageBelt",
        "arrival.belt", "arrival.beltNumber", "baggage", "baggage_belt", "belt",
      ]) : null)
    ) || null;

    // Hide if we have nothing useful.
    if (!gate && !terminal && !baggage) {
      els.opsBar.style.display = "none";
      els.opsBar.innerHTML = "";
      return;
    }

    const fmt = (v) => (v === null || v === undefined || String(v).trim() === "" ? "—" : String(v));
    els.opsBar.style.display = "";
    els.opsBar.innerHTML = `
      <div class="ops-item">
        <div class="ops-k">🚪 Gate</div>
        <div class="ops-v">${escapeHtml(fmt(gate))}</div>
      </div>
      <div class="ops-item">
        <div class="ops-k">🏢 Terminal</div>
        <div class="ops-v">${escapeHtml(fmt(terminal))}</div>
      </div>
      <div class="ops-item">
        <div class="ops-k">🧳 Belt</div>
        <div class="ops-v">${escapeHtml(fmt(baggage))}</div>
      </div>
    `;
  }

  function renderStatusBanner(flight, flat, id) {
    if (!els.statusBanner) return;
    const stRaw = pickAny(flat, ["status"]) || "Unknown";
    const st = String(stRaw).toLowerCase();

    const isDeparture = String((flight && flight.type) || (state.context && state.context.mode) || "").toLowerCase().includes("depart");
    const delayStr = isDeparture ? (flight?.departure?.delay) : (flight?.arrival?.delay);
    const delayMin = Number(delayStr);
    const hasDelay = Number.isFinite(delayMin) && delayMin > 0;

    const times = pickPrimaryTimes(flight, isDeparture);
    const now = Date.now();
    const targetMs = times.target ? times.target.getTime() : null;
    const minsTo = targetMs ? Math.round((targetMs - now) / 60000) : null;

    const depArrWord = isDeparture ? "Departs" : "Arrives";
    const countdown = (minsTo === null)
      ? "—"
      : minsTo > 0 ? `${depArrWord} in ${fmtRelative(minsTo)}` : `${depArrWord} ${fmtRelative(Math.abs(minsTo))} ago`;

    // Boarding estimate (no explicit API field): 30 min before target.
    let boardingLine = "";
    if (targetMs && isDeparture) {
      const boardMs = targetMs - 30 * 60000;
      const minsToBoard = Math.round((boardMs - now) / 60000);
      if (minsToBoard > 0) boardingLine = `Boarding in ${fmtRelative(minsToBoard)}`;
      else if (minsToBoard >= -10 && minsTo <= 15) boardingLine = "Boarding window";
    }

    let label = stRaw;
    let cls = "neutral";

    if (st.includes("cancel")) { label = "Cancelled"; cls = "bad"; }
    else if (hasDelay) { label = `Delayed ${delayMin}m`; cls = "warn"; }
    else if (st.includes("board")) { label = "Boarding"; cls = "good"; }
    else if (st.includes("land")) { label = "Landed"; cls = "good"; }
    else if (st.includes("depart")) { label = "Departed"; cls = "good"; }
    else if (st.includes("active")) { label = "Active"; cls = "good"; }
    else if (st.includes("sched") || st.includes("on time")) { label = "On time"; cls = "good"; }

    const subBits = [countdown, boardingLine].filter(Boolean);
    const sub = subBits.join(" • ");

    els.statusBanner.className = `status-banner ${cls}`;
    els.statusBanner.style.display = "";
    els.statusBanner.innerHTML = `
      <div class="sb-left">
        <div class="sb-title">${escapeHtml(label)}</div>
        <div class="sb-sub">${escapeHtml(sub || "—")}</div>
      </div>
      <div class="sb-right small">${escapeHtml((id.dep || "—") + " → " + (id.arr || "—"))}</div>
    `;
  }

  function pickPrimaryTimes(flight, isDeparture) {
    const seg = isDeparture ? (flight && flight.departure) : (flight && flight.arrival);
    const sched = toDate(seg?.scheduledTime || null);
    const est = toDate(seg?.estimatedTime || null);
    const act = toDate(seg?.actualTime || null);
    const target = act || est || sched;
    return { sched, est, act, target };
  }

  function fmtRelative(mins) {
    const m = Math.abs(Math.round(mins));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h}h ${String(mm).padStart(2, "0")}m` : `${h}h`;
  }

  // ---------- Time hero (KLM-style) ----------
  function fmtDayMon(v) {
    const d = toDate(v);
    if (!d) return "—";
    try {
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    } catch {
      return "—";
    }
  }

  function setHeroTime(mainEl, oldEl, actualOrEst, scheduled) {
    if (!mainEl) return;
    const main = fmtTime(actualOrEst || scheduled);
    const old = fmtTime(scheduled);
    mainEl.textContent = main || "—";

    // Only show the crossed-out scheduled time if it's meaningfully different.
    if (oldEl && scheduled && actualOrEst && main && old && main !== old) {
      oldEl.textContent = old;
      oldEl.style.display = "";
    } else if (oldEl) {
      oldEl.textContent = "";
      oldEl.style.display = "none";
    }
  }

  function paintDelayChip(el, mins) {
    if (!el) return;
    const n = Number(mins);
    if (!Number.isFinite(n) || n === 0) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("fh-delay-good");
      el.classList.add("fh-delay-warn");
      return;
    }

    // Aviation Edge delay is often in minutes; negative can indicate early.
    if (n > 0) {
      el.textContent = `${Math.round(n)}m delayed`;
      el.classList.remove("fh-delay-good");
      el.classList.add("fh-delay-warn");
      el.hidden = false;
      return;
    }
    el.textContent = `${Math.abs(Math.round(n))}m early`;
    el.classList.remove("fh-delay-warn");
    el.classList.add("fh-delay-good");
    el.hidden = false;
  }

  function renderTimeHero(flight, flat, id) {
    if (!flight || !flat) return;

    const dep = flight.departure || {};
    const arr = flight.arrival || {};

    // Best-effort times (prefer actual, else estimated, else scheduled)
    const depSched = dep.scheduledTime || pickAny(flat, ["departure.scheduledTime", "departure.scheduled", "scheduledDeparture", "flight.time.scheduled.departure"]);
    const depActOrEst = dep.actualTime || dep.estimatedTime || pickAny(flat, ["departure.actualTime", "departure.estimatedTime", "departure.estimated", "flight.time.actual.departure", "flight.time.estimated.departure"]);

    const arrSched = arr.scheduledTime || pickAny(flat, ["arrival.scheduledTime", "arrival.scheduled", "scheduledArrival", "flight.time.scheduled.arrival"]);
    const arrActOrEst = arr.actualTime || arr.estimatedTime || pickAny(flat, ["arrival.actualTime", "arrival.estimatedTime", "arrival.estimated", "flight.time.actual.arrival", "flight.time.estimated.arrival"]);

    setHeroTime(els.depTimeActual, els.depTimeSched, depActOrEst, depSched);
    setHeroTime(els.arrTimeActual, els.arrTimeSched, arrActOrEst, arrSched);

    if (els.depDate) els.depDate.textContent = fmtDayMon(depSched || depActOrEst || Date.now());
    if (els.arrDate) els.arrDate.textContent = fmtDayMon(arrSched || arrActOrEst || Date.now());
    if (els.depAirport) els.depAirport.textContent = id?.dep || "—";
    if (els.arrAirport) els.arrAirport.textContent = id?.arr || "—";

    // Delay chips
    paintDelayChip(els.depDelay, dep.delay);
    paintDelayChip(els.arrDelay, arr.delay);
  }

  // ---------- New Hero Card Renderer ----------
  function renderHeroCard(flight, flat, id) {
    if (!flight || !flat || !els.heroCard) return;

    // Debug: log the data to help diagnose issues (can be removed later)
    console.log('[Hero Card] Flight data:', flight);

    const dep = flight.departure || {};
    const arr = flight.arrival || {};

    // Flight number - Aviation Edge uses flight.iataNumber
    const flightNo = flight.flight?.iataNumber || id?.flightNo || "—";
    const airlineIata = flight.airline?.iataCode || "";
    if (els.heroFlightNumber) {
      els.heroFlightNumber.textContent = flightNo;
    }

    // Departure info
    if (els.heroDepDate) {
      const depDateVal = dep.scheduledTime || dep.estimatedTime || Date.now();
      els.heroDepDate.textContent = fmtDayMon(depDateVal);
    }
    if (els.heroDepCity) {
      const depCode = dep.iataCode || id?.dep || "";
      els.heroDepCity.textContent = getCityName(depCode) || depCode || "—";
    }
    if (els.heroDepTime) {
      const mainTime = fmtTime(dep.actualTime || dep.estimatedTime || dep.scheduledTime);
      els.heroDepTime.textContent = mainTime || "—";
    }
    if (els.heroDepTimeOld) {
      const schedTime = fmtTime(dep.scheduledTime);
      const actualTime = fmtTime(dep.actualTime || dep.estimatedTime);
      if (schedTime && actualTime && schedTime !== actualTime) {
        els.heroDepTimeOld.textContent = schedTime;
        els.heroDepTimeOld.style.display = "";
      } else {
        els.heroDepTimeOld.textContent = "";
        els.heroDepTimeOld.style.display = "none";
      }
    }

    // Arrival info
    if (els.heroArrDate) {
      const arrDateVal = arr.scheduledTime || arr.estimatedTime || Date.now();
      els.heroArrDate.textContent = fmtDayMon(arrDateVal);
    }
    if (els.heroArrCity) {
      const arrCode = arr.iataCode || id?.arr || "";
      els.heroArrCity.textContent = getCityName(arrCode) || arrCode || "—";
    }
    if (els.heroArrTime) {
      const mainTime = fmtTime(arr.actualTime || arr.estimatedTime || arr.scheduledTime);
      els.heroArrTime.textContent = mainTime || "—";
    }
    if (els.heroArrTimeOld) {
      const schedTime = fmtTime(arr.scheduledTime);
      const actualTime = fmtTime(arr.actualTime || arr.estimatedTime);
      if (schedTime && actualTime && schedTime !== actualTime) {
        els.heroArrTimeOld.textContent = schedTime;
        els.heroArrTimeOld.style.display = "";
      } else {
        els.heroArrTimeOld.textContent = "";
        els.heroArrTimeOld.style.display = "none";
      }
    }

    // Status badges - show flight status with appropriate colors
    function paintHeroStatus(el, segment, status, delayVal) {
      if (!el) return;
      
      // Get flight status
      const flightStatus = String(status || "").toLowerCase();
      const delay = Number(delayVal);
      const hasDelay = Number.isFinite(delay) && delay !== 0;
      
      // Debug logging
      console.log('[Hero Status]', {
        element: el.id,
        status: flightStatus,
        delay: delay,
        hasDelay: hasDelay
      });
      
      // Reset classes
      el.classList.remove("hero-delay-good", "hero-delay-warn", "hero-delay-bad", "hero-delay-neutral");
      
      // Determine status and styling
      let text = "";
      let className = "";
      
      // Priority 1: Cancelled
      if (flightStatus.includes("cancel")) {
        text = "Cancelled";
        className = "hero-delay-neutral";
      }
      // Priority 2: Departed/Landed (completed)
      else if (flightStatus.includes("departed") || flightStatus.includes("depart")) {
        text = "Departed";
        className = "hero-delay-good";
      }
      else if (flightStatus.includes("landed") || flightStatus.includes("land")) {
        text = "Landed";
        className = "hero-delay-good";
      }
      // Priority 3: Delayed (has positive delay value)
      else if (hasDelay && delay > 0) {
        text = `${Math.round(delay)}m delayed`;
        className = "hero-delay-bad";
      }
      // Priority 4: Early (negative delay)
      else if (hasDelay && delay < 0) {
        text = `${Math.abs(Math.round(delay))}m early`;
        className = "hero-delay-good";
      }
      // Priority 5: On time (scheduled with no delay)
      else if (flightStatus.includes("scheduled") || 
               flightStatus.includes("on time") || 
               flightStatus.includes("active") ||
               flightStatus.includes("boarding")) {
        text = "On time";
        className = "hero-delay-good";
      }
      
      // Show badge only if we have status information
      if (text) {
        el.textContent = text;
        el.classList.add(className);
        el.hidden = false;
        console.log('[Hero Status] Showing:', text, className);
      } else {
        el.hidden = true;
        console.log('[Hero Status] Hidden - no status to show');
      }
    }
    
    // Get flight status
    const flightStatus = flight.status || "";
    
    paintHeroStatus(els.heroDepDelay, dep, flightStatus, dep.delay);
    paintHeroStatus(els.heroArrDelay, arr, flightStatus, arr.delay);

    // Info pills (glanceable)
    // Per your requirement:
    // - Gate pill = *departure gate* (always from timetable departure.gate)
    // - Belt pill = *arrival baggage belt* (always from timetable arrival.baggage)
    // Both pills must ALWAYS render (dash when missing).
    // Gate pill defaults yellow; turns red if the departure gate changes.
    if (els.heroGateDep) {
      const gateVal = (
        (flight.departure && flight.departure.gate) ||
        pickAny(flat, [
          "departure.gate", "departure.gateNumber", "departureGate",
          "flight.departure.gate", "flight.departure.gateNumber",
        ])
      ) || "";

      els.heroGateDep.textContent = gateVal ? String(gateVal) : "—";
      const changed = opsChanged("gate_dep", gateVal);
      els.heroGateDep.classList.toggle("is-changed", !!changed);
    }

    // Belt pill: ALWAYS shown, aligned right via CSS.
    if (els.heroBelt) {
      const beltVal = (
        (flight.arrival && flight.arrival.baggage) ||
        pickAny(flat, [
          "arrival.baggage", "arrival.baggage_belt", "arrival.baggageBelt",
          "arrival.belt", "arrival.beltNumber",
          "flight.arrival.baggage", "flight.arrival.belt",
          "baggage", "baggage_belt", "belt",
        ])
      ) || "";

      els.heroBelt.textContent = beltVal ? String(beltVal) : "—";
    }

    // Info grid uses the flight.type to decide the countdown copy (departure vs arrival)
    const isDeparture = String(flight.type || "").toLowerCase() === "departure";

    // Countdown
    if (els.heroCountdownText) {
      const times = pickPrimaryTimes(flight, isDeparture);
      const now = Date.now();
      const targetMs = times.target ? times.target.getTime() : null;
      const minsTo = targetMs ? Math.round((targetMs - now) / 60000) : null;

      const depArrWord = isDeparture ? "departure" : "arrival";
      if (minsTo === null) {
        els.heroCountdownText.textContent = "—";
      } else if (minsTo > 0) {
        els.heroCountdownText.textContent = `${fmtRelative(minsTo)} before ${depArrWord}`;
      } else {
        els.heroCountdownText.textContent = `${fmtRelative(Math.abs(minsTo))} after ${depArrWord}`;
      }
    }
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
    else if (st.includes("on time") || st.includes("scheduled") || st.includes("boarding") || st.includes("active") || st.includes("depart") || st.includes("land")) cls = "good";

    els.statusBadge.className = `badge ${cls}`;
    els.statusBadge.textContent = label;
  }


  // ---------- Flight metrics (duration, distance, carbon) + delay trend ----------
  function minutesBetween(a, b) {
    const d1 = toDate(a);
    const d2 = toDate(b);
    if (!d1 || !d2) return null;
    let mins = Math.round((d2.getTime() - d1.getTime()) / 60000);
    // handle overnight (e.g., dep 23:10, arr 01:05 next day but API may omit date)
    if (mins < -720) mins += 1440;
    if (mins > 2880) return null; // sanity
    return mins;
  }

  function fmtDuration(mins) {
    if (!Number.isFinite(mins)) return "—";
    const h = Math.floor(mins / 60);
    const m = Math.abs(mins % 60);
    return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  }

  function fmtKm(km) {
    if (!Number.isFinite(km)) return "—";
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
  }

  function estimateCarbonKg(distanceKm) {
    // Very rough economy-class short-haul factor. Keep it simple + clearly labelled as an estimate.
    // Source varies widely by aircraft/load/route; treat as indicative only.
    const FACTOR_KG_PER_PAX_KM = 0.115;
    if (!Number.isFinite(distanceKm)) return null;
    return distanceKm * FACTOR_KG_PER_PAX_KM;
  }

  function fmtKg(kg) {
    if (!Number.isFinite(kg)) return "—";
    if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
    return `${Math.round(kg)} kg`;
  }

  function getTimeValue(flat, paths) {
    const v = pickAny(flat, paths);
    return v || null;
  }

  function getDelays(flat) {
    // Best-effort: use actual or estimated if available, else null.
    const schedDep = getTimeValue(flat, [
      "flight.time.scheduled.departure",
      "departure.scheduledTime",
      "departure.scheduled",
      "scheduled_departure",
      "departure_time",
      "scheduledDeparture",
    ]);
    const schedArr = getTimeValue(flat, [
      "flight.time.scheduled.arrival",
      "arrival.scheduledTime",
      "arrival.scheduled",
      "scheduled_arrival",
      "arrival_time",
      "scheduledArrival",
    ]);

    const actualDep = getTimeValue(flat, [
      "flight.time.actual.departure",
      "departure.actualTime",
      "departure.actual",
      "actual_departure",
      "actualDeparture",
      "departure.actualTimeLocal",
      "departure.actual_time",
      "departure.estimatedTime",
      "departure.estimated",
      "estimated_departure",
      "estimatedDeparture",
    ]);

    const actualArr = getTimeValue(flat, [
      "flight.time.actual.arrival",
      "arrival.actualTime",
      "arrival.actual",
      "actual_arrival",
      "actualArrival",
      "arrival.actualTimeLocal",
      "arrival.actual_time",
      "arrival.estimatedTime",
      "arrival.estimated",
      "estimated_arrival",
      "estimatedArrival",
    ]);

    const depDelay = minutesBetween(schedDep, actualDep);
    const arrDelay = minutesBetween(schedArr, actualArr);

    return {
      depDelay: Number.isFinite(depDelay) ? depDelay : null,
      arrDelay: Number.isFinite(arrDelay) ? arrDelay : null,
      schedDep,
      schedArr,
      actualDep,
      actualArr,
    };
  }

  function delayTrendKey(id) {
    const fn = String(id?.flightNo || "").trim().toUpperCase();
    const dep = String(id?.dep || "").trim().toUpperCase();
    const arr = String(id?.arr || "").trim().toUpperCase();
    return `delay_hist_${fn || `${dep}_${arr}` || "unknown"}`;
  }

  function recordDelaySample(id, delays) {
    const key = delayTrendKey(id);
    const now = Date.now();

    // De-dupe: only record if it changes or at least every 10 minutes.
    const lastKey = `${key}_last`;
    const lastRaw = safeGetSession(lastKey);
    const last = lastRaw ? safeParseJson(lastRaw) : null;
    const hash = `${delays.depDelay ?? "n"}|${delays.arrDelay ?? "n"}`;
    if (last && last.hash === hash && (now - (last.t || 0)) < 10 * 60 * 1000) return;

    safeSetSession(lastKey, JSON.stringify({ t: now, hash }));

    const raw = safeGetLocal(key);
    const arr = raw ? safeParseJson(raw) : null;
    const list = Array.isArray(arr) ? arr : [];
    list.push({ t: now, dep: delays.depDelay, arr: delays.arrDelay });
    while (list.length > 30) list.shift();
    safeSetLocal(key, JSON.stringify(list));
  }

  function computeDelayTrend(id) {
    const key = delayTrendKey(id);
    const raw = safeGetLocal(key);
    const list = raw ? safeParseJson(raw) : null;
    if (!Array.isArray(list) || list.length < 6) return null;

    const recent = list.slice(-5);
    const prev = list.slice(-10, -5);

    const avg = (xs, field) => {
      const vals = xs.map((x) => Number(x?.[field])).filter((n) => Number.isFinite(n));
      if (!vals.length) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const r = avg(recent, "dep");
    const p = avg(prev, "dep");
    if (!Number.isFinite(r)) return null;

    let arrow = "→";
    let delta = null;
    if (Number.isFinite(p)) {
      delta = r - p;
      if (delta > 2) arrow = "↑";
      else if (delta < -2) arrow = "↓";
    }

    return { avgDep: r, delta, arrow };
  }

  function renderKpis(flat, id) {
    if (!els.kpis) return;

    const delays = getDelays(flat);
    // record trend best-effort (won't store if all null)
    if (delays.depDelay !== null || delays.arrDelay !== null) recordDelaySample(id, delays);

    // Duration: scheduled (fallback to actual/estimated when needed)
    const dur = minutesBetween(delays.schedDep || delays.actualDep, delays.schedArr || delays.actualArr);

    // Distance: use airportCoords first; else use cached endpoints from state (if Leaflet already resolved)
    const depCode = normIata(id?.dep);
    const arrCode = normIata(id?.arr);
    let km = null;

    const depC = depCode && airportCoords && airportCoords[depCode] ? airportCoords[depCode] : null;
    const arrC = arrCode && airportCoords && airportCoords[arrCode] ? airportCoords[arrCode] : null;

    if (depC && arrC) {
      km = haversineKm(depC.lat, depC.lon, arrC.lat, arrC.lon);
    } else if (state.lastRouteMeta && state.lastRouteMeta.distanceKm) {
      km = state.lastRouteMeta.distanceKm;
    }

    const co2 = estimateCarbonKg(km);

    const trend = computeDelayTrend(id);

    const delayLabel = delays.depDelay === null ? "—" : `${delays.depDelay >= 0 ? "+" : ""}${Math.round(delays.depDelay)}m`;
    const trendLabel = trend ? `${trend.arrow} ${Math.round(trend.avgDep)}m avg` : "—";

    els.kpis.innerHTML = `
      <div class="kpi-chip"><span class="kpi-k">Duration</span><span class="kpi-v">${escapeHtml(fmtDuration(dur))}</span></div>
      <div class="kpi-chip"><span class="kpi-k">Distance</span><span class="kpi-v">${escapeHtml(fmtKm(km))}</span></div>
      <div class="kpi-chip"><span class="kpi-k">CO₂e</span><span class="kpi-v" title="Rough estimate per passenger">${escapeHtml(fmtKg(co2))}</span></div>
      <div class="kpi-chip"><span class="kpi-k">Dep delay</span><span class="kpi-v">${escapeHtml(delayLabel)}</span></div>
      <div class="kpi-chip"><span class="kpi-k">Delay trend</span><span class="kpi-v" title="Rolling average of recent samples">${escapeHtml(trendLabel)}</span></div>
    `;
  }

// ---------- Weather (5-day one-card + icons + local time + extras) ----------
  const WX_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  function wxCacheKey(iata, fallbackName) {
    const k = String(iata || "").trim().toUpperCase();
    if (k) return `wx_${k}`;
    return `wx_${String(fallbackName || "dest").toLowerCase().replace(/\s+/g, "_")}`;
  }

  function safeParseJson(s) { try { return JSON.parse(s); } catch { return null; } }

  function weatherCodeToIconAndLabel(code) {
    const c = Number(code);
    if (!Number.isFinite(c)) return { icon: "❓", label: "Unknown" };
    if (c === 0) return { icon: "☀️", label: "Clear" };
    if (c === 1) return { icon: "🌤️", label: "Mainly clear" };
    if (c === 2) return { icon: "⛅", label: "Partly cloudy" };
    if (c === 3) return { icon: "☁️", label: "Overcast" };
    if (c === 45 || c === 48) return { icon: "🌫️", label: "Fog" };
    if ([51,53,55].includes(c)) return { icon: "🌦️", label: "Drizzle" };
    if ([56,57].includes(c)) return { icon: "🌧️", label: "Freezing drizzle" };
    if ([61,63,65].includes(c)) return { icon: "🌧️", label: "Rain" };
    if ([66,67].includes(c)) return { icon: "🌧️", label: "Freezing rain" };
    if ([71,73,75,77].includes(c)) return { icon: "❄️", label: "Snow" };
    if ([80,81,82].includes(c)) return { icon: "🌧️", label: "Showers" };
    if ([85,86].includes(c)) return { icon: "🌨️", label: "Snow showers" };
    if ([95,96,99].includes(c)) return { icon: "⛈️", label: "Thunderstorm" };
    return { icon: "🌥️", label: "Weather" };
  }

  function formatLocalTimeNow(timezone) {
    try {
      return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone || "UTC" });
    } catch {
      return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }
  }

  function formatWxDay(dateStr, timezone) {
    try {
      const d = new Date(`${dateStr}T12:00:00`);
      return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: timezone || "UTC" }).format(d);
    } catch {
      return dateStr;
    }
  }

  function fmtSun(timeStr, timezone) {
    // Open-Meteo returns ISO time in local tz when timezone=auto; still safe to format.
    const d = toDate(timeStr);
    if (!d) return "—";
    try {
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone || "UTC" });
    } catch {
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }
  }

  async function geocodeCityOpenMeteo(name) {
    const q = String(name || "").trim();
    if (!q) return null;
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", q);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") return null;
    return { lat: r.latitude, lon: r.longitude, name: r.name || q };
  }

  async function fetchOpenMeteoDaily(lat, lon) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("daily",
      [
        "weathercode",
        "temperature_2m_max",
        "temperature_2m_min",
        "apparent_temperature_max",
        "apparent_temperature_min",
        "precipitation_sum",
        "precipitation_probability_max",
        "windspeed_10m_max",
        "uv_index_max",
        "sunrise",
        "sunset",
      ].join(",")
    );

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
    return await res.json();
  }

  async function renderWeatherByCityName(flat) {
    if (!els.weatherBox) return;

    const destCode = String(pickAny(flat, [
      "flight.arrival.iataCode",
      "flight.arrival.iata",
      "flight.destination.iataCode",
      "flight.destination.iata",
      "arrival.iataCode",
      "arrival.iata",
      "arr_iata",
      "arr",
      "destination",
      "to",
      "flight.airport.destination.code.iata",
    ]) || "").trim().toUpperCase();

    const placeLabel = airportCodeToCityName[destCode] || destCode || "";
    const cacheKey = wxCacheKey(destCode, placeLabel);

    // cache hit
    const cachedRaw = safeGetLocal(cacheKey);
    const cached = cachedRaw ? safeParseJson(cachedRaw) : null;
    if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < WX_CACHE_TTL_MS && cached.payload) {
      paintWeather(cached.payload, placeLabel);
      return;
    }

    if (!destCode && !placeLabel) {
      if (els.wxHint) els.wxHint.textContent = "Destination not found.";
      els.weatherBox.innerHTML = "";
      return;
    }

    // Coords: airportCoords first, else geocode by name
    let lat = null, lon = null;
    if (destCode && typeof airportCoords === "object" && airportCoords && airportCoords[destCode]) {
      lat = airportCoords[destCode].lat;
      lon = airportCoords[destCode].lon;
    } else if (placeLabel) {
      const geo = await geocodeCityOpenMeteo(placeLabel);
      if (geo) { lat = geo.lat; lon = geo.lon; }
    }

    if (!(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
      if (els.wxHint) els.wxHint.textContent = "Weather: destination coordinates unavailable.";
      els.weatherBox.innerHTML = "";
      return;
    }

    try {
      if (els.wxHint) els.wxHint.textContent = "Loading weather…";
      const payload = await fetchOpenMeteoDaily(lat, lon);
      safeSetLocal(cacheKey, JSON.stringify({ fetchedAt: Date.now(), payload }));
      paintWeather(payload, placeLabel);
    } catch (e) {
      console.warn("Weather fetch error:", e);
      if (els.wxHint) els.wxHint.textContent = "Weather unavailable.";
      els.weatherBox.innerHTML = "";
    }
  }

  function tempClass(tMax) {
    const t = Number(tMax);
    if (!Number.isFinite(t)) return "";
    if (t >= 25) return "wx-hot";
    if (t <= 5) return "wx-cold";
    return "";
  }

  function paintWeather(payload, placeLabel) {
    if (!els.weatherBox) return;

    if (!payload || !payload.daily) {
      if (els.wxHint) els.wxHint.textContent = "Weather unavailable.";
      els.weatherBox.innerHTML = "";
      return;
    }

    const tz = payload.timezone || "UTC";
    const localNow = formatLocalTimeNow(tz);
    if (els.wxHint) els.wxHint.textContent = `Local time in ${placeLabel || "destination"}: ${localNow}`;

    const d = payload.daily;
    const times = Array.isArray(d.time) ? d.time : [];
    const tmax = Array.isArray(d.temperature_2m_max) ? d.temperature_2m_max : [];
    const tmin = Array.isArray(d.temperature_2m_min) ? d.temperature_2m_min : [];
    const feelsMax = Array.isArray(d.apparent_temperature_max) ? d.apparent_temperature_max : [];
    const feelsMin = Array.isArray(d.apparent_temperature_min) ? d.apparent_temperature_min : [];
    const wcode = Array.isArray(d.weathercode) ? d.weathercode : [];
    const precipSum = Array.isArray(d.precipitation_sum) ? d.precipitation_sum : [];
    const precipProb = Array.isArray(d.precipitation_probability_max) ? d.precipitation_probability_max : [];
    const windMax = Array.isArray(d.windspeed_10m_max) ? d.windspeed_10m_max : [];
    const uvMax = Array.isArray(d.uv_index_max) ? d.uv_index_max : [];
    const sunrise = Array.isArray(d.sunrise) ? d.sunrise : [];
    const sunset = Array.isArray(d.sunset) ? d.sunset : [];

    const n = Math.min(5, (times || []).length, (tmax || []).length, (tmin || []).length, (wcode || []).length);
    if (n <= 0) {
      els.weatherBox.innerHTML = "";
      return;
    }

    // One card containing 5-day rows
    let rows = "";
    for (let i = 0; i < n; i++) {
      const meta = weatherCodeToIconAndLabel(wcode[i]);
      const dayLabel = formatWxDay(times[i], tz);
      const tHi = Number.isFinite(Number(tmax[i])) ? `${Number(tmax[i]).toFixed(0)}°` : "—";
      const tLo = Number.isFinite(Number(tmin[i])) ? `${Number(tmin[i]).toFixed(0)}°` : "—";
      const fHi = Number.isFinite(Number(feelsMax[i])) ? `${Number(feelsMax[i]).toFixed(0)}°` : "—";
      const fLo = Number.isFinite(Number(feelsMin[i])) ? `${Number(feelsMin[i]).toFixed(0)}°` : "—";
      const pSum = Number.isFinite(Number(precipSum[i])) ? `${Number(precipSum[i]).toFixed(1)} mm` : "—";
      const pProb = Number.isFinite(Number(precipProb[i])) ? `${Number(precipProb[i]).toFixed(0)}%` : "—";
      const w = Number.isFinite(Number(windMax[i])) ? `${Number(windMax[i]).toFixed(0)} km/h` : "—";
      const uv = Number.isFinite(Number(uvMax[i])) ? `${Number(uvMax[i]).toFixed(0)}` : "—";
      const sr = sunrise[i] ? fmtSun(sunrise[i], tz) : "—";
      const ss = sunset[i] ? fmtSun(sunset[i], tz) : "—";

      rows += `
        <div class="wx-row ${tempClass(tmax[i])}">
          <div class="wx-day">
            <div class="wx-day-top"><span class="wx-ico" aria-hidden="true">${meta.icon}</span><span>${escapeHtml(dayLabel)}</span></div>
            <div class="wx-desc">${escapeHtml(meta.label)}</div>
          </div>
          <div class="wx-metric"><div class="wx-k">Temp</div><div class="wx-v">${escapeHtml(tHi)} / ${escapeHtml(tLo)}</div></div>
          <div class="wx-metric"><div class="wx-k">Feels</div><div class="wx-v">${escapeHtml(fHi)} / ${escapeHtml(fLo)}</div></div>
          <div class="wx-metric"><div class="wx-k">Rain</div><div class="wx-v">${escapeHtml(pProb)} • ${escapeHtml(pSum)}</div></div>
          <div class="wx-metric"><div class="wx-k">Wind</div><div class="wx-v">${escapeHtml(w)}</div></div>
          <div class="wx-metric"><div class="wx-k">UV</div><div class="wx-v">${escapeHtml(uv)}</div></div>
          <div class="wx-metric"><div class="wx-k">Sun</div><div class="wx-v">${escapeHtml(sr)}–${escapeHtml(ss)}</div></div>
        </div>
      `;
    }

    els.weatherBox.innerHTML = `
      <div class="wx-onecard">
        <div class="wx-onecard-hdr">
          <div class="wx-place">${escapeHtml(placeLabel || "Destination")}</div>
          <div class="wx-note">5-day forecast</div>
        </div>
        <div class="wx-rows">${rows}</div>
      </div>
    `;
  }


// ---------- Route map: Leaflet basemap + animation, with SVG fallback ----------
  const ROUTE_SVG_W = 1000;
  const ROUTE_SVG_H = 420;

  function projectLonLatToSvg(lon, lat) {
    const x = ((lon + 180) / 360) * ROUTE_SVG_W;
    const y = ((90 - lat) / 180) * ROUTE_SVG_H;
    return { x, y };
  }

  function svgEl(name, attrs = {}, text = null) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text != null) el.textContent = text;
    return el;
  }

  function normIata(code) { return String(code || "").trim().toUpperCase(); }

  function resolvePlaceQuery(flat, kind, iata) {
    const paths = (kind === "dep")
      ? [
          "departure.city", "departure.cityName", "departure.city_name",
          "departure.airport.name", "departure.airportName", "departure.airport",
          "flight.departure.city", "flight.origin.city", "flight.airport.origin.name",
        ]
      : [
          "arrival.city", "arrival.cityName", "arrival.city_name",
          "arrival.airport.name", "arrival.airportName", "arrival.airport",
          "flight.arrival.city", "flight.destination.city", "flight.airport.destination.name",
        ];

    const fromPayload = pickAny(flat, paths);
    if (fromPayload) return String(fromPayload);

    const mapped = getCityName(iata);
    if (mapped) return mapped;

    const c = normIata(iata);
    return c ? `${c} airport` : "";
  }

  async function resolveEndpoint(flat, kind, iata) {
    // Try to use coords if present in the payload (best accuracy).
    const latPaths = (kind === "dep")
      ? ["departure.latitude", "departure.lat", "flight.departure.latitude", "flight.departure.lat", "departure.geo.lat"]
      : ["arrival.latitude", "arrival.lat", "flight.arrival.latitude", "flight.arrival.lat", "arrival.geo.lat"];
    const lonPaths = (kind === "dep")
      ? ["departure.longitude", "departure.lon", "flight.departure.longitude", "flight.departure.lon", "departure.geo.lon"]
      : ["arrival.longitude", "arrival.lon", "flight.arrival.longitude", "flight.arrival.lon", "arrival.geo.lon"];

    const lat = Number(pickAny(flat, latPaths));
    const lon = Number(pickAny(flat, lonPaths));
    // Some APIs send 0,0 as "unknown" — reject that and fall back to geocoding.
    if (isValidLatLon(lat, lon)) {
      return { lat, lon, label: normIata(iata) || "—" };
    }

    // Otherwise geocode a place query (city/airport name).
    let query = resolvePlaceQuery(flat, kind, iata);
    // Bias to airport features (avoids pins landing on city centres)
    if (iata && query && !/airport/i.test(query)) query = airportQueryFromIata(iata);
    const geo = query ? await geocodeCachedQuery(query) : null;
    if (!geo) return null;
    return { lat: geo.lat, lon: geo.lon, label: normIata(iata) || "—" };
  }

  function greatCirclePoints(lat1, lon1, lat2, lon2, steps = 72) {
    // Spherical linear interpolation between two coords.
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;

    const φ1 = toRad(lat1), λ1 = toRad(lon1);
    const φ2 = toRad(lat2), λ2 = toRad(lon2);

    const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
    const sinφ2 = Math.sin(φ2), cosφ2 = Math.cos(φ2);

    const Δλ = λ2 - λ1;

    const d = 2 * Math.asin(Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 +
      cosφ1 * cosφ2 * Math.sin(Δλ / 2) ** 2
    ));
    if (!Number.isFinite(d) || d === 0) return [[lat1, lon1], [lat2, lon2]];

    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);

      const x = A * cosφ1 * Math.cos(λ1) + B * cosφ2 * Math.cos(λ2);
      const y = A * cosφ1 * Math.sin(λ1) + B * cosφ2 * Math.sin(λ2);
      const z = A * sinφ1 + B * sinφ2;

      const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
      const λ = Math.atan2(y, x);

      pts.push([toDeg(φ), toDeg(λ)]);
    }
    return pts;
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function bearingDeg(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;

    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δλ = toRad(lon2 - lon1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (toDeg(θ) + 360) % 360;
  }

  function makeAirportIcon(code) {
    if (!window.L) return null;
    return L.divIcon({
      className: "",
      html: `<div class="airport-pin"><div class="code">${escapeHtml(code || "—")}</div></div>`,
      iconSize: [46, 46],
      iconAnchor: [23, 42],
    });
  }

  function makePlaneIcon(rotationDeg) {
    if (!window.L) return null;
    const rot = Number.isFinite(rotationDeg) ? rotationDeg : 0;
    return L.divIcon({
      className: "",
      html: `
        <div class="plane-pin">
          <svg viewBox="0 0 24 24" aria-hidden="true" style="transform: rotate(${rot}deg)">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9L2 14v2l8-2.5V19l-2 1.5V22l3-1 3 1v-1.5L13 19v-5.5L21 16z" fill="currentColor"></path>
          </svg>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }

  function applyTheme(theme) {
    if (!state.map) return;
    const want = theme === "dark" ? "dark" : "light";
    if (state.mapTheme === want) return;

    // swap tile layers
    if (state.mapTheme === "dark" && state.tileDark) state.map.removeLayer(state.tileDark);
    if (state.mapTheme === "light" && state.tileLight) state.map.removeLayer(state.tileLight);

    if (want === "dark" && state.tileDark) state.tileDark.addTo(state.map);
    if (want === "light" && state.tileLight) state.tileLight.addTo(state.map);

    state.mapTheme = want;
  }

  function ensureLeafletMap() {
    if (!els.routeMap || !window.L) return false;
    if (state.map) return true;

    // enable Leaflet view, hide SVG fallback
    document.body.classList.add("leaflet-on");

    const L = window.L;

    state.map = L.map(els.routeMap, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      tap: true,
      worldCopyJump: true,
      preferCanvas: false,
      renderer: L.svg(),
    });

    L.control.zoom({ position: "bottomright" }).addTo(state.map);

    state.tileLight = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      subdomains: "abc",
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });

    state.tileDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      className: "tiles-dark",
    });

    // Fallback if CARTO tiles are blocked: use OSM tiles with a dark filter.
    const tileDarkFallback = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      subdomains: "abc",
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      className: "tiles-dark-fallback",
    });

    // If tiles fail to load (common on some networks), switch to a fallback layer.
    state.tileLight.on("tileerror", () => {
      // OSM is already state.tileLight, so nothing to do here.
    });

    state.tileDark.on("tileerror", () => {
      // Swap dark layer to the fallback once, then re-apply the current theme.
      if (state.tileDark === tileDarkFallback) return;
      try {
        if (state.mapTheme === "dark") state.map.removeLayer(state.tileDark);
      } catch {}
      state.tileDark = tileDarkFallback;
      applyTheme("dark");
    });

    // initial theme
    const initial = state.prefersDark && state.prefersDark.matches ? "dark" : "light";
    state.mapTheme = null;
    applyTheme(initial);

    // auto-switch with OS theme unless user overrides
    if (state.prefersDark && state.prefersDark.addEventListener) {
      state.prefersDark.addEventListener("change", (e) => {
        if (state.themeOverridden) return;
        applyTheme(e.matches ? "dark" : "light");
      });
    }

    // Theme toggle control
    const Toggle = L.Control.extend({
      options: { position: "topright" },
      onAdd: () => {
        const btn = L.DomUtil.create("button", "map-toggle-btn");
        btn.type = "button";
        btn.textContent = "Map: Auto";
        L.DomEvent.disableClickPropagation(btn);
        btn.addEventListener("click", () => {
          state.themeOverridden = true;
          const next = state.mapTheme === "dark" ? "light" : "dark";
          applyTheme(next);
          btn.textContent = `Map: ${next === "dark" ? "Dark" : "Light"}`;
        });
        return btn;
      }
    });
    state.map.addControl(new Toggle());

    // size fix when container is visible
    setTimeout(() => { try { state.map.invalidateSize(); } catch {} }, 50);

    return true;
  }

  async function renderRouteMapFromFlight(flight, id, flat) {
    const depCode = normIata(id?.dep);
    const arrCode = normIata(id?.arr);

    if (els.mapHint) els.mapHint.textContent = depCode && arrCode ? `${depCode} → ${arrCode}` : "—";

    const routeKey = `${depCode}|${arrCode}`;
    const useLeaflet = ensureLeafletMap();

    // Prefer Leaflet if available; else SVG fallback.
    if (useLeaflet) {
      // Avoid re-animating if same route and map already rendered.
      if (routeKey && routeKey === state.lastRouteKey && state.routeLine) {
        // still make sure bounds are sane on resize
        setTimeout(() => { try { state.map.invalidateSize(); } catch {} }, 0);
        return;
      }
      state.lastRouteKey = routeKey;
      await renderLeafletRoute(flat, depCode, arrCode);
      return;
    }

    // --- SVG fallback (your original behaviour) ---
    if (!els.routeSvg) return;
    els.routeSvg.replaceChildren();

    const depCity = getCityName(depCode) || depCode;
    const arrCity = getCityName(arrCode) || arrCode;

    if (!depCity || !arrCity) {
      els.routeSvg.append(
        svgEl("text", { x: ROUTE_SVG_W/2, y: ROUTE_SVG_H/2, "text-anchor":"middle", "dominant-baseline":"middle", opacity:"0.7", "font-size":"18" }, "Route unavailable")
      );
      return;
    }

    const [depGeo, arrGeo] = await Promise.all([
      geocodeCachedQuery(depCity),
      geocodeCachedQuery(arrCity),
    ]);

    if (!depGeo || !arrGeo) {
      els.routeSvg.append(
        svgEl("text", { x: ROUTE_SVG_W/2, y: ROUTE_SVG_H/2, "text-anchor":"middle", "dominant-baseline":"middle", opacity:"0.7", "font-size":"18" }, "Route unavailable")
      );
      return;
    }

    
    // Cache route meta for KPIs
    try { state.lastRouteMeta = { dep: { lat: depGeo.lat, lon: depGeo.lon }, arr: { lat: arrGeo.lat, lon: arrGeo.lon }, distanceKm: haversineKm(depGeo.lat, depGeo.lon, arrGeo.lat, arrGeo.lon) }; } catch {}
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

    // faint background
    els.routeSvg.append(svgEl("rect", { x:0, y:0, width:ROUTE_SVG_W, height:ROUTE_SVG_H, fill:"currentColor", opacity:"0.03" }));

    const grid = svgEl("g", { opacity: "0.35" });
    const stepX = 100, stepY = 70;
    for (let x = 0; x <= ROUTE_SVG_W; x += stepX) grid.append(svgEl("line", { x1:x, y1:0, x2:x, y2:ROUTE_SVG_H, stroke:"currentColor", "stroke-width":"1", opacity:"0.10" }));
    for (let y = 0; y <= ROUTE_SVG_H; y += stepY) grid.append(svgEl("line", { x1:0, y1:y, x2:ROUTE_SVG_W, y2:y, stroke:"currentColor", "stroke-width":"1", opacity:"0.10" }));
    els.routeSvg.append(grid);

    const pathD = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    els.routeSvg.append(svgEl("path", { d: pathD, fill:"none", stroke:"currentColor", "stroke-width":"4", opacity:"0.9" }));

    const markerAttrs = { r:"8", fill:"currentColor", opacity:"0.95" };
    els.routeSvg.append(svgEl("circle", { cx:p1.x, cy:p1.y, ...markerAttrs }));
    els.routeSvg.append(svgEl("circle", { cx:p2.x, cy:p2.y, ...markerAttrs }));

    const labelGroup = svgEl("g", { "font-size":"16", opacity:"0.95" });
    const pad = 14;
    labelGroup.append(svgEl("text", { x: Math.min(Math.max(p1.x + pad, 8), ROUTE_SVG_W-8), y: Math.min(Math.max(p1.y - pad, 18), ROUTE_SVG_H-8) }, depCode || depCity));
    labelGroup.append(svgEl("text", { x: Math.min(Math.max(p2.x + pad, 8), ROUTE_SVG_W-8), y: Math.min(Math.max(p2.y - pad, 18), ROUTE_SVG_H-8) }, arrCode || arrCity));
    els.routeSvg.append(labelGroup);
  }

  async function renderLeafletRoute(flat, depCode, arrCode) {
    const L = window.L;
    if (!state.map || !L) return;

    // Cancel any in-flight animation
    if (state.animRaf) { cancelAnimationFrame(state.animRaf); state.animRaf = null; }

    // Resolve endpoints
    const [dep, arr] = await Promise.all([
      resolveEndpoint(flat, "dep", depCode),
      resolveEndpoint(flat, "arr", arrCode),
    ]);

    if (!dep || !arr) return;

    const points = greatCirclePoints(dep.lat, dep.lon, arr.lat, arr.lon, 84);
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));

    // Clear previous layers
    if (state.routeGroup) state.routeGroup.remove();
    state.routeGroup = L.layerGroup().addTo(state.map);

    // Markers
    state.depMarker = L.marker([dep.lat, dep.lon], { icon: makeAirportIcon(depCode), interactive: true }).addTo(state.routeGroup);
    state.arrMarker = L.marker([arr.lat, arr.lon], { icon: makeAirportIcon(arrCode), interactive: true }).addTo(state.routeGroup);

    // Tooltips / popups (mobile friendly)
    try {
      const depTitle = `${depCode}${dep.name ? ` — ${dep.name}` : ""}`;
      const arrTitle = `${arrCode}${arr.name ? ` — ${arr.name}` : ""}`;
      state.depMarker.bindTooltip(depTitle, { direction: "top", offset: [0, -8] });
      state.arrMarker.bindTooltip(arrTitle, { direction: "top", offset: [0, -8] });
      state.depMarker.bindPopup(`<strong>${depTitle}</strong>`);
      state.arrMarker.bindPopup(`<strong>${arrTitle}</strong>`);
    } catch {}


    // Route polyline (animated draw)
    state.routeLine = L.polyline([], { weight: 4, opacity: 0.95, className: "route-line" }).addTo(state.routeGroup);

    // Plane marker
    const firstBearing = bearingDeg(points[0][0], points[0][1], points[1][0], points[1][1]);
    state.planeMarker = L.marker(points[0], { icon: makePlaneIcon(firstBearing), interactive: false }).addTo(state.routeGroup);

    // Fit bounds nicely
    state.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 8 });

    // If endpoints are very close (geocode sometimes returns same city centre), zoom in a bit.
    const dKm = haversineKm(dep.lat, dep.lon, arr.lat, arr.lon);
    // Cache route meta for KPIs (distance etc.)
    state.lastRouteMeta = { dep, arr, distanceKm: dKm };

    if (Number.isFinite(dKm) && dKm < 80) {
      state.map.setView([(dep.lat + arr.lat) / 2, (dep.lon + arr.lon) / 2], 8, { animate: false });
    }

    // Animate the path + plane
    const durationMs = 1300;
    const total = points.length;

    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const idx = Math.max(1, Math.floor(t * (total - 1)));

      state.routeLine.setLatLngs(points.slice(0, idx + 1));

      const cur = points[idx];
      const next = points[Math.min(idx + 1, total - 1)];
      const brg = bearingDeg(cur[0], cur[1], next[0], next[1]);
      state.planeMarker.setLatLng(cur);
      state.planeMarker.setIcon(makePlaneIcon(brg));

      if (t < 1) state.animRaf = requestAnimationFrame(step);
      else state.animRaf = null;
    };

    state.animRaf = requestAnimationFrame(step);

    // Ensure Leaflet sizes correctly after animation + layout settles
    setTimeout(() => { try { state.map.invalidateSize(); } catch {} }, 120);
  }

