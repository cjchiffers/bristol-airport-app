/* flight-details.js
   Route map upgrade (Leaflet basemap + animated route + dark/light) + Weather (Open-Meteo)
   Notes:
   - Uses Leaflet tiles (no API key) when available; falls back to your SVG route if Leaflet isn't loaded.
   - Weather remains Open-Meteo (free) via geocoding -> forecast.
*/

(() => {
  "use strict";

// --- Bristol (BRS) non-stop destinations (city/place names for geocoding)
const airportCodeToCityName = {
  // UK / near
  "BRS": "Bristol",
  "ABZ": "Aberdeen",
  "EDI": "Edinburgh",
  "GLA": "Glasgow",
  "NCL": "Newcastle",
  "INV": "Inverness",
  "EXT": "Exeter",
  "BHD": "Belfast",
  "BFS": "Belfast",
  "JER": "Jersey",
  "GCI": "Guernsey",
  "IOM": "Isle of Man",

  // Ireland
  "DUB": "Dublin",
  "ORK": "Cork",
  "NOC": "Knock",

  // Netherlands / Belgium / Switzerland / Austria / Germany
  "AMS": "Amsterdam",
  "BSL": "Basel",
  "ZRH": "Zurich",
  "GVA": "Geneva",
  "VIE": "Vienna",
  "SZG": "Salzburg",
  "INN": "Innsbruck",
  "BER": "Berlin",
  "MUC": "Munich",

  // France
  "CDG": "Paris",
  "BOD": "Bordeaux",
  "TLS": "Toulouse",
  "LYS": "Lyon",
  "GNB": "Grenoble",
  "CMF": "Chambery",
  "BZR": "Beziers",
  "LRH": "La Rochelle",
  "LIG": "Limoges",
  "NCE": "Nice",
  "MRS": "Marseille",

  // Spain (mainland)
  "ALC": "Alicante",
  "AGP": "Malaga",
  "FAO": "Faro",          // (Portugal but often grouped by users; keeping exact below too)
  "MAD": "Madrid",
  "BIO": "Bilbao",
  "LEI": "Almeria",
  "SVQ": "Seville",
  "VLC": "Valencia",
  "REU": "Reus",
  "RMU": "Murcia",
  "GRO": "Girona",

  // Portugal (keep separate + correct)
  "LIS": "Lisbon",
  "OPO": "Porto",
  "FAO": "Faro",
  "FNC": "Funchal",

  // Canary Islands / Balearics / Atlantic
  "TFS": "Tenerife",
  "LPA": "Gran Canaria",
  "ACE": "Lanzarote",
  "FUE": "Fuerteventura",
  "PMI": "Palma de Mallorca",
  "IBZ": "Ibiza",
  "MAH": "Menorca",
  "SID": "Sal",

  // Italy
  "FCO": "Rome",
  "NAP": "Naples",
  "PSA": "Pisa",
  "CTA": "Catania",
  "PMO": "Palermo",
  "VCE": "Venice",
  "TRN": "Turin",
  "VRN": "Verona",
  "BGY": "Milan",
  "MXP": "Milan",
  "OLB": "Olbia",
  "BRI": "Bari",

  // Poland / Czech / Hungary / Romania / Bulgaria / Lithuania
  "KRK": "Krakow",
  "GDN": "Gdansk",
  "WRO": "Wroclaw",
  "POZ": "Poznan",
  "RZE": "Rzeszow",
  "BZG": "Bydgoszcz",
  "PRG": "Prague",
  "BUD": "Budapest",
  "OTP": "Bucharest",
  "SOF": "Sofia",
  "KUN": "Kaunas",

  // Greece / Cyprus / Balkans
  "ATH": "Athens",
  "SKG": "Thessaloniki",
  "CFU": "Corfu",
  "CHQ": "Chania",
  "HER": "Heraklion",
  "RHO": "Rhodes",
  "KGS": "Kos",
  "ZTH": "Zakynthos",
  "PVK": "Preveza",
  "JTR": "Santorini",
  "JSI": "Skiathos",
  "EFL": "Kefalonia",
  "LCA": "Larnaca",
  "DBV": "Dubrovnik",
  "SPU": "Split",
  "TIV": "Tivat",
  "PUY": "Pula",
  "KLX": "Kalamata",

  // Turkey
  "AYT": "Antalya",
  "DLM": "Dalaman",
  "ADB": "Izmir",
  "BJV": "Bodrum",
  "IST": "Istanbul",
  "SAW": "Istanbul",

  // North Africa / Middle East
  "AGA": "Agadir",
  "RAK": "Marrakech",
  "NBE": "Enfidha",
  "HRG": "Hurghada",
  "SSH": "Sharm el Sheikh",
  "PFO": "Paphos",

  // Iceland / Norway
  "KEF": "Reykjavik",
  "TOS": "Tromso",
  "BGO": "Bergen",

  // Gibraltar / Malta
  "GIB": "Gibraltar",
  "MLA": "Malta",

  // Spain (city airports already included)
  "BCN": "Barcelona",
};


  // --- Airport code -> coordinates (accurate markers).
  // Add airports you care about; this can stay small.
  // (These are standard published airport coordinates; tweak/extend as needed.)
  // Accurate airport coordinates (lat/lon).
// Add/remove as needed. These are used to place markers correctly on the Leaflet map.
// --- Airport coordinates (lat/lon) for Bristol destinations
// --- Airport coordinates (lat/lon) for your BRS destination list
// Format matches OurAirports columns latitude_deg / longitude_deg.
const airportCoords = {
  // UK / near
  BRS: { lat: 51.382669, lon: -2.719089 }, // Bristol
  ABZ: { lat: 57.201944, lon: -2.197778 }, // Aberdeen
  EDI: { lat: 55.950000, lon: -3.372500 }, // Edinburgh
  GLA: { lat: 55.871944, lon: -4.433056 }, // Glasgow
  NCL: { lat: 55.037500, lon: -1.691667 }, // Newcastle
  INV: { lat: 57.542500, lon: -4.047500 }, // Inverness
  EXT: { lat: 50.734444, lon: -3.413889 }, // Exeter
  BHD: { lat: 54.618056, lon: -5.872500 }, // Belfast City
  BFS: { lat: 54.657500, lon: -6.215833 }, // Belfast Intl
  JER: { lat: 49.207944, lon: -2.195500 }, // Jersey
  GCI: { lat: 49.434956, lon: -2.601969 }, // Guernsey
  IOM: { lat: 54.083333, lon: -4.623889 }, // Isle of Man

  // Ireland
  DUB: { lat: 53.421333, lon: -6.270075 }, // Dublin
  ORK: { lat: 51.841269, lon: -8.491111 }, // Cork
  NOC: { lat: 53.910297, lon: -8.818492 }, // Knock (Ireland West)

  // Netherlands / Switzerland / Austria / Germany
  AMS: { lat: 52.310539, lon: 4.768274 }, // Amsterdam Schiphol
  BSL: { lat: 47.589583, lon: 7.529914 }, // Basel (EuroAirport)
  ZRH: { lat: 47.464722, lon: 8.549167 }, // Zurich
  GVA: { lat: 46.238056, lon: 6.108056 }, // Geneva
  VIE: { lat: 48.110278, lon: 16.569722 }, // Vienna
  SZG: { lat: 47.793056, lon: 13.004444 }, // Salzburg
  INN: { lat: 47.260278, lon: 11.343889 }, // Innsbruck
  BER: { lat: 52.366667, lon: 13.503333 }, // Berlin Brandenburg
  MUC: { lat: 48.353783, lon: 11.786086 }, // Munich

  // France
  CDG: { lat: 49.009722, lon: 2.547778 }, // Paris CDG
  BOD: { lat: 44.828333, lon: -0.715556 }, // Bordeaux
  TLS: { lat: 43.629444, lon: 1.363889 }, // Toulouse
  LYS: { lat: 45.725556, lon: 5.081111 }, // Lyon
  GNB: { lat: 45.362944, lon: 5.329375 }, // Grenoble
  CMF: { lat: 45.638056, lon: 5.880556 }, // Chambery
  BZR: { lat: 43.323611, lon: 3.353889 }, // Beziers
  LRH: { lat: 46.179167, lon: -1.195278 }, // La Rochelle
  LIG: { lat: 45.862778, lon: 1.179444 }, // Limoges
  NCE: { lat: 43.658411, lon: 7.215872 }, // Nice
  MRS: { lat: 43.436667, lon: 5.215000 }, // Marseille

  // Spain (mainland)
  ALC: { lat: 38.282222, lon: -0.558056 }, // Alicante
  AGP: { lat: 36.674900, lon: -4.499106 }, // Malaga
  MAD: { lat: 40.471926, lon: -3.562640 }, // Madrid
  BIO: { lat: 43.301111, lon: -2.910556 }, // Bilbao
  LEI: { lat: 36.843889, lon: -2.370000 }, // Almeria
  SVQ: { lat: 37.418000, lon: -5.893106 }, // Seville
  VLC: { lat: 39.489314, lon: -0.481625 }, // Valencia
  REU: { lat: 41.147392, lon: 1.167172 }, // Reus
  RMU: { lat: 37.803000, lon: -1.125000 }, // Murcia (RMU approx)
  GRO: { lat: 41.901000, lon: 2.760000 }, // Girona

  // Portugal / Madeira
  LIS: { lat: 38.774167, lon: -9.134167 }, // Lisbon
  OPO: { lat: 41.248055, lon: -8.681389 }, // Porto
  FAO: { lat: 37.014425, lon: -7.965911 }, // Faro
  FNC: { lat: 32.697889, lon: -16.774453 }, // Funchal

  // Canary / Balearics / Cape Verde
  TFS: { lat: 28.044475, lon: -16.572489 }, // Tenerife South
  LPA: { lat: 27.931886, lon: -15.386586 }, // Gran Canaria
  ACE: { lat: 28.945464, lon: -13.605225 }, // Lanzarote
  FUE: { lat: 28.452717, lon: -13.863761 }, // Fuerteventura
  PMI: { lat: 39.551741, lon: 2.738810 }, // Palma de Mallorca
  IBZ: { lat: 38.872858, lon: 1.373117 }, // Ibiza
  MAH: { lat: 39.862598, lon: 4.218647 }, // Menorca
  SID: { lat: 16.741389, lon: -22.949444 }, // Sal, Cape Verde

  // Italy
  FCO: { lat: 41.800278, lon: 12.238889 }, // Rome Fiumicino
  NAP: { lat: 40.886033, lon: 14.290781 }, // Naples
  PSA: { lat: 43.683917, lon: 10.392750 }, // Pisa
  CTA: { lat: 37.466781, lon: 15.066400 }, // Catania
  PMO: { lat: 38.175958, lon: 13.091019 }, // Palermo
  VCE: { lat: 45.505278, lon: 12.351944 }, // Venice
  TRN: { lat: 45.200761, lon: 7.649631 }, // Turin
  VRN: { lat: 45.395706, lon: 10.888533 }, // Verona
  BGY: { lat: 45.673889, lon: 9.704167 }, // Milan Bergamo
  MXP: { lat: 45.630000, lon: 8.723056 }, // Milan Malpensa
  OLB: { lat: 40.898611, lon: 9.517222 }, // Olbia
  BRI: { lat: 41.138889, lon: 16.760556 }, // Bari

  // Poland / Central & Eastern Europe
  KRK: { lat: 50.077731, lon: 19.784836 }, // Krakow
  GDN: { lat: 54.377569, lon: 18.466222 }, // Gdansk
  WRO: { lat: 51.102683, lon: 16.885836 }, // Wroclaw
  POZ: { lat: 52.421031, lon: 16.826325 }, // Poznan
  RZE: { lat: 50.110000, lon: 22.019000 }, // Rzeszow approx
  BZG: { lat: 53.096667, lon: 17.977778 }, // Bydgoszcz
  PRG: { lat: 50.100833, lon: 14.260000 }, // Prague
  BUD: { lat: 47.436933, lon: 19.255592 }, // Budapest
  OTP: { lat: 44.571111, lon: 26.085000 }, // Bucharest Otopeni
  SOF: { lat: 42.696693, lon: 23.411436 }, // Sofia
  KUN: { lat: 54.963919, lon: 24.084778 }, // Kaunas

  // Greece / Cyprus / Balkans
  ATH: { lat: 37.936358, lon: 23.947472 }, // Athens
  SKG: { lat: 40.519725, lon: 22.970950 }, // Thessaloniki
  CFU: { lat: 39.601944, lon: 19.911667 }, // Corfu
  CHQ: { lat: 35.531747, lon: 24.149656 }, // Chania
  HER: { lat: 35.339722, lon: 25.180278 }, // Heraklion
  RHO: { lat: 36.405419, lon: 28.086192 }, // Rhodes
  KGS: { lat: 36.793335, lon: 27.091667 }, // Kos
  ZTH: { lat: 37.750853, lon: 20.884251 }, // Zakynthos
  PVK: { lat: 38.925467, lon: 20.765311 }, // Preveza (Aktio)
  JTR: { lat: 36.399169, lon: 25.479333 }, // Santorini
  JSI: { lat: 39.177100, lon: 23.503700 }, // Skiathos
  EFL: { lat: 38.120000, lon: 20.500000 }, // Kefalonia approx
  LCA: { lat: 34.875117, lon: 33.624850 }, // Larnaca
  DBV: { lat: 42.561353, lon: 18.268244 }, // Dubrovnik
  SPU: { lat: 43.538944, lon: 16.297964 }, // Split
  TIV: { lat: 42.404944, lon: 18.723333 }, // Tivat
  PUY: { lat: 44.893533, lon: 13.922192 }, // Pula
  KLX: { lat: 37.068319, lon: 22.025526 }, // Kalamata

  // Turkey
  AYT: { lat: 36.898731, lon: 30.800461 }, // Antalya
  DLM: { lat: 36.713100, lon: 28.792500 }, // Dalaman
  ADB: { lat: 38.292392, lon: 27.156953 }, // Izmir
  BJV: { lat: 37.250556, lon: 27.664167 }, // Bodrum
  IST: { lat: 41.275278, lon: 28.751944 }, // Istanbul
  SAW: { lat: 40.898553, lon: 29.309219 }, // Istanbul Sabiha

  // North Africa / Middle East
  AGA: { lat: 30.325000, lon: -9.413056 }, // Agadir
  RAK: { lat: 31.606886, lon: -8.036300 }, // Marrakech
  NBE: { lat: 36.075833, lon: 10.438611 }, // Enfidha
  HRG: { lat: 27.178317, lon: 33.799436 }, // Hurghada
  SSH: { lat: 27.977222, lon: 34.395000 }, // Sharm el Sheikh
  PFO: { lat: 34.718040, lon: 32.485731 }, // Paphos

  // Iceland / Norway
  KEF: { lat: 63.985000, lon: -22.605556 }, // Keflavik
  TOS: { lat: 69.681389, lon: 18.918919 }, // Tromso
  BGO: { lat: 60.293386, lon: 5.218140 }, // Bergen

  // Gibraltar / Malta
  GIB: { lat: 36.151111, lon: -5.349444 }, // Gibraltar
  MLA: { lat: 35.857497, lon: 14.477497 }, // Malta

  // Spain city airport
  BCN: { lat: 41.297078, lon: 2.078464 }, // Barcelona
};


  function getCityName(code) {
    const c = normIata(code);
    return airportCodeToCityName[c] || (code || "");
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
    routeMap: document.getElementById("routeMap"),
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

    // Leaflet
    map: null,
    mapTheme: "light",
    tileLight: null,
    tileDark: null,
    routeGroup: null,
    routeLine: null,
    planeMarker: null,
    depMarker: null,
    arrMarker: null,
    animRaf: null,
    lastRouteKey: "",
  };

  // ---------- Utilities ----------
  function safeGetLocal(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function safeSetLocal(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
  function safeGetSession(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
  function safeSetSession(key, value) { try { sessionStorage.setItem(key, value); return true; } catch { return false; } }

  function normIata(code) { return String(code || "").trim().toUpperCase(); }

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

  function deriveIdentity(f) {
    const flat = flattenObject(f || {});
    const flightNo =
      pickAny(flat, [
        "flight.iataNumber", "flight_iata", "flightNumber", "number", "flight_no", "flight.iata"
      ]) || null;

    const dep =
      pickAny(flat, ["departure.iataCode", "departure.iata", "dep_iata", "origin", "from", "flight.airport.origin.code.iata"]) || null;

    const arr =
      pickAny(flat, ["arrival.iataCode", "arrival.iata", "arr_iata", "destination", "to", "flight.airport.destination.code.iata"]) || null;

    const schedDep =
      pickAny(flat, [
        "departure.scheduledTime", "departure.scheduled", "departure_time", "scheduled_departure", "scheduledDeparture",
        "flight.time.scheduled.departure"
      ]) || null;

    const schedArr =
      pickAny(flat, [
        "arrival.scheduledTime", "arrival.scheduled", "arrival_time", "scheduled_arrival", "scheduledArrival",
        "flight.time.scheduled.arrival"
      ]) || null;

    return { flightNo, dep, arr, schedDep, schedArr };
  }

  function setText(el, text) { if (el) el.textContent = text; }

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
  const apiKey = "YOUR_API_KEY_HERE"; // Aviation Edge key

  async function refreshNow(forceFeedback) {
    if (!state.context || !state.current) return;
    try {
      const updated = await fetchBestEffortUpdate(apiKey, state.context, state.current);
      if (!updated) return;

      const prev = state.current;
      state.current = updated;

      if (state.storageKey) safeSetSession(state.storageKey, JSON.stringify({ flight: state.current, context: state.context }));
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

  async function fetchBestEffortUpdate(apiKey_, context, current) {
    const mode = context.mode || "departure";
    const airport = context.airport || "BRS";

    const curId = deriveIdentity(current);
    const flightNo = curId.flightNo || "";

    const url = new URL("https://aviation-edge.com/v2/public/timetable");
    url.searchParams.set("key", apiKey_ || "");
    url.searchParams.set("type", mode);
    if (flightNo) url.searchParams.set("flight_Iata", flightNo);
    url.searchParams.set("iataCode", airport);

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

    // Basic panels
    if (els.depKv) els.depKv.innerHTML = `<div class="small">Scheduled: ${escapeHtml(depTime || "—")}</div>`;
    if (els.arrKv) els.arrKv.innerHTML = `<div class="small">Scheduled: ${escapeHtml(arrTime || "—")}</div>`;

    // Raw JSON
    if (els.rawJson) els.rawJson.textContent = JSON.stringify(flight, null, 2);

    // Weather
    renderWeatherByCityName(flat).catch((e) => console.warn("Weather render failed:", e));
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

  // ---------- Weather (Open-Meteo) ----------
  async function geocodeCity(name) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", name);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results?.[0];
    if (!r) return null;
    return { lat: r.latitude, lon: r.longitude, name: r.name || name };
  }

  async function geocodeCachedQuery(query) {
    const key = `geo_q_${String(query).toLowerCase()}`;
    const cachedRaw = safeGetLocal(key);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (cached && typeof cached.lat === "number" && typeof cached.lon === "number") return cached;
      } catch {}
    }
    const r = await geocodeCity(query);
    if (r && typeof r.lat === "number" && typeof r.lon === "number") {
      safeSetLocal(key, JSON.stringify(r));
      return r;
    }
    return null;
  }

  async function fetchWeather(lat, lon) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode");
    url.searchParams.set("timezone", "Europe/London");
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
    const data = await res.json();
    return data?.daily || null;
  }

  async function renderWeatherByCityName(flat) {
    if (!els.weatherBox) return;

    const destinationAirportCode = normIata(
      pickAny(flat, [
        "arrival.iataCode",
        "flight.arrival.iataCode",
        "flight.destination.iataCode",
        "arrival.iata",
        "arr_iata",
        "destination",
        "to",
      ]) || ""
    );

    const cityName = getCityName(destinationAirportCode);
    if (!cityName) {
      if (els.wxHint) els.wxHint.textContent = "Destination not found.";
      return;
    }

    try {
      if (els.wxHint) els.wxHint.textContent = `Weather: ${cityName} (next 3 days)`;

      const geo = await geocodeCachedQuery(cityName);
      if (!geo) {
        if (els.wxHint) els.wxHint.textContent = "Weather data unavailable.";
        return;
      }

      const daily = await fetchWeather(geo.lat, geo.lon);
      if (!daily?.time?.length) {
        if (els.wxHint) els.wxHint.textContent = "No forecast returned.";
        return;
      }

      const days = Math.min(3, daily.time.length);
      let html = "";
      for (let i = 0; i < days; i++) {
        html += `
          <div class="wx-card">
            <div class="wx-title">${escapeHtml(daily.time[i])}</div>
            <div class="wx-sub">Max ${escapeHtml(daily.temperature_2m_max[i])}°C • Min ${escapeHtml(daily.temperature_2m_min[i])}°C</div>
          </div>
        `;
      }
      els.weatherBox.innerHTML = html;
    } catch (e) {
      console.error("Weather fetch error:", e);
      if (els.wxHint) els.wxHint.textContent = "Error fetching weather data.";
    }
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

  function resolvePlaceQuery(flat, kind, iata) {
    const i = normIata(iata);
    if (i && airportCoords[i]) return null; // coords provided; don't geocode

    const directCodeName = getCityName(i);
    if (directCodeName) return directCodeName;

    const city = (kind === "dep")
      ? pickAny(flat, ["departure.city", "departure.cityName", "departure.airport.city", "flight.departure.city"])
      : pickAny(flat, ["arrival.city", "arrival.cityName", "arrival.airport.city", "flight.arrival.city"]);
    if (city) return city;

    const airport = (kind === "dep")
      ? pickAny(flat, ["departure.airport", "departure.name", "flight.departure.airport", "flight.departure.name"])
      : pickAny(flat, ["arrival.airport", "arrival.name", "flight.arrival.airport", "flight.arrival.name"]);
    if (airport) return airport;

    return directCodeName || i || "";
  }

  async function resolveEndpoint(flat, kind, iata) {
    const code = normIata(iata);

    // 1) Prefer our hard-coded airport coords if present (most accurate and stable)
    if (code && airportCoords[code]) {
      const c = airportCoords[code];
      return { lat: c.lat, lon: c.lon, label: code };
    }

    // 2) Try coords from payload (if API provides)
    const latPaths = (kind === "dep")
      ? ["departure.latitude", "departure.lat", "flight.departure.latitude", "flight.departure.lat", "departure.geo.lat"]
      : ["arrival.latitude", "arrival.lat", "flight.arrival.latitude", "flight.arrival.lat", "arrival.geo.lat"];
    const lonPaths = (kind === "dep")
      ? ["departure.longitude", "departure.lon", "flight.departure.longitude", "flight.departure.lon", "departure.geo.lon"]
      : ["arrival.longitude", "arrival.lon", "flight.arrival.longitude", "flight.arrival.lon", "arrival.geo.lon"];

    const lat = Number(pickAny(flat, latPaths));
    const lon = Number(pickAny(flat, lonPaths));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon, label: code || "—" };
    }

    // 3) Geocode a place query
    const query = resolvePlaceQuery(flat, kind, code);
    const geo = query ? await geocodeCachedQuery(query) : null;
    if (!geo) return null;
    return { lat: geo.lat, lon: geo.lon, label: code || "—" };
  }

  function greatCirclePoints(lat1, lon1, lat2, lon2, steps = 72) {
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

    // Inline-styled HTML so marker placement can't be thrown off by external CSS transforms.
    // The "tip" circle is the true anchor point.
    const safe = escapeHtml(code || "—");
    return L.divIcon({
      className: "",
      html: `
        <div style="
          width:46px;height:56px;position:relative;
          display:flex;align-items:flex-start;justify-content:center;
          ">
          <div style="
            width:46px;height:46px;border-radius:16px;
            border:1px solid rgba(255,255,255,.18);
            background:rgba(16,20,34,.85);
            backdrop-filter:blur(10px);
            box-shadow: 0 8px 22px rgba(0,0,0,.32);
            display:flex;align-items:center;justify-content:center;
            font-weight:950;letter-spacing:.3px;font-size:12px;color:#fff;
          ">${safe}</div>
          <div style="
            position:absolute;left:50%;bottom:2px;
            width:10px;height:10px;border-radius:999px;
            background:#fff;transform:translateX(-50%);
            box-shadow:0 6px 14px rgba(0,0,0,.35);
          "></div>
        </div>
      `,
      iconSize: [46, 56],
      iconAnchor: [23, 54], // anchor near the center of the tip circle
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

    if (state.mapTheme === "dark" && state.tileDark) state.map.removeLayer(state.tileDark);
    if (state.mapTheme === "light" && state.tileLight) state.map.removeLayer(state.tileLight);

    if (want === "dark" && state.tileDark) state.tileDark.addTo(state.map);
    if (want === "light" && state.tileLight) state.tileLight.addTo(state.map);

    state.mapTheme = want;
  }

  function ensureLeafletMap() {
    if (!els.routeMap || !window.L) return false;
    if (state.map) return true;

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

    const tileDarkFallback = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      subdomains: "abc",
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      className: "tiles-dark-fallback",
    });

    state.tileLight.addTo(state.map);
    state.mapTheme = "light";

    const Toggle = L.Control.extend({
      options: { position: "topright" },
      onAdd: function () {
        const btn = L.DomUtil.create("button", "map-toggle-btn");
        btn.type = "button";
        btn.title = "Toggle map theme";
        btn.textContent = "Theme";
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, "click", () => {
          const next = state.mapTheme === "light" ? "dark" : "light";
          if (next === "dark") {
            try {
              state.tileDark.addTo(state.map);
              state.map.removeLayer(state.tileLight);
              state.mapTheme = "dark";
            } catch {
              tileDarkFallback.addTo(state.map);
              state.map.removeLayer(state.tileLight);
              state.mapTheme = "dark";
            }
          } else {
            try { state.map.removeLayer(state.tileDark); } catch {}
            try { state.map.removeLayer(tileDarkFallback); } catch {}
            state.tileLight.addTo(state.map);
            state.mapTheme = "light";
          }
        });
        return btn;
      }
    });
    state.map.addControl(new Toggle());

    return true;
  }

  async function renderRouteMapFromFlight(flight, id, flat) {
    const depCode = normIata(id?.dep);
    const arrCode = normIata(id?.arr);

    if (els.mapHint) els.mapHint.textContent = depCode && arrCode ? `${depCode} → ${arrCode}` : "—";

    const routeKey = `${depCode}|${arrCode}`;
    const useLeaflet = ensureLeafletMap();

    if (useLeaflet) {
      if (routeKey && routeKey === state.lastRouteKey && state.routeLine) {
        setTimeout(() => { try { state.map.invalidateSize(); } catch {} }, 0);
        return;
      }
      state.lastRouteKey = routeKey;
      await renderLeafletRoute(flat, depCode, arrCode);
      return;
    }

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

    if (state.animRaf) { cancelAnimationFrame(state.animRaf); state.animRaf = null; }

    const [dep, arr] = await Promise.all([
      resolveEndpoint(flat, "dep", depCode),
      resolveEndpoint(flat, "arr", arrCode),
    ]);

    if (!dep || !arr) return;

    const points = greatCirclePoints(dep.lat, dep.lon, arr.lat, arr.lon, 84);
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));

    if (state.routeGroup) state.routeGroup.remove();
    state.routeGroup = L.layerGroup().addTo(state.map);

    state.depMarker = L.marker([dep.lat, dep.lon], { icon: makeAirportIcon(depCode), interactive: false }).addTo(state.routeGroup);
    state.arrMarker = L.marker([arr.lat, arr.lon], { icon: makeAirportIcon(arrCode), interactive: false }).addTo(state.routeGroup);

    state.routeLine = L.polyline([], { weight: 4, opacity: 0.95, className: "route-line" }).addTo(state.routeGroup);

    const firstBearing = bearingDeg(points[0][0], points[0][1], points[1][0], points[1][1]);
    state.planeMarker = L.marker(points[0], { icon: makePlaneIcon(firstBearing), interactive: false }).addTo(state.routeGroup);

    // ✅ slightly closer than before
    state.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 10 });

    const dKm = haversineKm(dep.lat, dep.lon, arr.lat, arr.lon);
    if (Number.isFinite(dKm) && dKm < 80) {
      state.map.setView([(dep.lat + arr.lat) / 2, (dep.lon + arr.lon) / 2], 8, { animate: false });
    }

    const durationMs = 1300;
    const total = points.length;

    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const idx = Math.max(1, Math.floor(t * (total - 1)));

      state.routeLine.setLatLngs(points.slice(0, idx + 1));

      const cur = points[idx];
      state.planeMarker.setLatLng(cur);

      if (idx + 1 < total) {
        const next = points[Math.min(total - 1, idx + 1)];
        const brg = bearingDeg(cur[0], cur[1], next[0], next[1]);
        state.planeMarker.setIcon(makePlaneIcon(brg));
      }

      if (t < 1) state.animRaf = requestAnimationFrame(step);
      else state.animRaf = null;
    };
    state.animRaf = requestAnimationFrame(step);

    setTimeout(() => { try { state.map.invalidateSize(); } catch {} }, 120);
  }

})();
