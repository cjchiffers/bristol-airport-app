"use strict";
/* flight-details.js
   Flight details page. The URL (?type=arrival&flight=U2 2806&date=2026-10-02) identifies the flight,
   so the page can be reloaded and shared. Data comes from the Cloudflare worker (AeroDataBox).
   Route map (Leaflet basemap + animated route + dark/light) + Weather (Open‑Meteo)
   Notes:
   - Uses Leaflet tiles (no API key) when available; falls back to your SVG route if Leaflet isn't loaded.
   - Weather remains Open‑Meteo (free) via geocoding -> forecast.
*/

  // ---------- Airport names + coordinates (shared/airports.js, from airports.min.json) ----------
  // ~9k airports with city, name, lat/lon — so no network geocoding is needed for known airports.
  function ensureAirportIndex() {
    return window.BrsAirports ? window.BrsAirports.loadAirportIndexBestEffort().catch(() => null) : Promise.resolve(null);
  }
  function coordsFor(iata) {
    const A = window.BrsAirports;
    return A && A.getAirportLatLon ? A.getAirportLatLon(iata) : null;
  }
  function airportNameFor(iata) {
    const A = window.BrsAirports;
    const rec = A && A.getAirportRecord ? A.getAirportRecord(iata) : null;
    return rec ? (rec.name || rec.city || "") : "";
  }

  // ---------- Airport geocoding (robust pin placement) ----------
  // Only for airports missing from the index: geocode using Open‑Meteo and *prefer airport features* (feature_code=AIRP).
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
    const c = normIata(code);
    const A = window.BrsAirports;
    const rec = A && A.getAirportRecord ? A.getAirportRecord(c) : null;
    return (rec && (rec.city || rec.name)) || c;
  }

  // ---------- DOM ----------
  const els = {
    headline: document.getElementById("headline"),
    subhead: document.getElementById("subhead"),
    netBanner: document.getElementById("netBanner"),
    updatedLine: document.getElementById("updatedLine"),
    toast: document.getElementById("toast"),

    notFound: document.getElementById("notFound"),
    notFoundTitle: document.getElementById("notFoundTitle"),
    notFoundMsg: document.getElementById("notFoundMsg"),
    notFoundRetry: document.getElementById("notFoundRetry"),

    depKv: document.getElementById("depKv"),
    arrKv: document.getElementById("arrKv"),
    kpis: document.getElementById("kpis"),
    opsBar: document.getElementById("opsBar"),

    backBtn: document.getElementById("backBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    autoBtn: document.getElementById("autoBtn"),
    shareBtn: document.getElementById("shareBtn"),
    calendarBtn: document.getElementById("calendarBtn"),
    shareIconBtn: document.getElementById("shareIconBtn"),

    overflowBtn: document.getElementById("overflowDetailsBtn"),
    menu: document.getElementById("detailsMenu"),

    // Airline / aircraft
    airlineLogo: document.getElementById("airlineLogo"),
    airlineName: document.getElementById("airlineName"),
    airlineCodeLine: document.getElementById("airlineCodeLine"),
    aircraftArt: document.getElementById("aircraftArt"),
    historyCard: document.getElementById("historyCard"),
    historyBody: document.getElementById("historyBody"),
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

    // Hero card
    heroCard: document.getElementById("heroCard"),
    heroAirline: document.getElementById("heroAirline"),
    heroAirlineLogo: document.getElementById("heroAirlineLogo"),
    heroAirlineInitials: document.getElementById("heroAirlineInitials"),
    heroAirlineName: document.getElementById("heroAirlineName"),
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
    heroGateItem: document.getElementById("heroGateItem"),
    heroBeltItem: document.getElementById("heroBeltItem"),
    heroGate: document.getElementById("heroGate"),
    heroBaggage: document.getElementById("heroBaggage"),
    heroCountdown: document.getElementById("heroCountdown"),
    heroCountdownText: document.getElementById("heroCountdownText"),
  };

  // ---------- State ----------
  const state = {
    storageKey: null,
    route: null,        // { type: "arrival"|"departure", flight: "U2 2806", date: "YYYY-MM-DD" } from the URL
    context: null,
    current: null,
    auto: true,
    intervalMs: 60000,
    timer: null,
    countdownTimer: null,
    aircraftKind: null,
    history: { loaded: false, loading: false },
    lastOkAt: 0,
    updatedText: "",

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

  // ---------- Shared helpers (shared/utils.js) ----------
  const { escapeHtml, safeGetLocal, safeSetLocal, safeGetSession, safeSetSession, flattenObject, pickAny } = window.BrsUtils;


  // OPS_HELPERS_TOP_LEVEL
  // Track per-flight operational fields so we can highlight changes (e.g. gate change)
  function getOpsKey(suffix) {
    const k = state?.storageKey || "unknown";
    return `fd_${k}_${suffix}`;
  }
  function opsChanged(suffix, nextVal) {
    const key = getOpsKey(suffix);
    const prev = safeGetSession(key);
    const next = (nextVal == null) ? "" : String(nextVal);
    // Only count as "changed" if we had a previous non-empty value and it differs.
    const changed = (prev != null && prev !== "" && next !== "" && prev !== next);
    safeSetSession(key, next);
    return changed;
  }

  function opsChangedSticky(suffix, nextVal) {
    const key = getOpsKey(suffix);
    const prev = safeGetSession(key) || "";
    const next = (nextVal == null) ? "" : String(nextVal).trim();

    // If next is empty, keep the previous non-empty value (don't "forget" the last known gate).
    if (!next) return false;

    const changed = (prev !== "" && prev !== next);
    safeSetSession(key, next);
    return changed;
  }


  // ---------- Utilities ----------
  // All time parsing/formatting goes through shared/time.js (Safari-safe, Europe/London).
  function toDate(v) { return window.BrsTime.parse(v); }

  function fmtTime(v) { return window.BrsTime.fmtTime(v); }

  function setText(el, text) { if (el) el.textContent = text; }


// ---------- Hero airline (logo + initials fallback) ----------
// Airline code / initials / logo URLs come from shared/airlines.js.
const likelyAirlineCode = (airlineIata, flightNo) => window.BrsAirlines.likelyAirlineCode(airlineIata, flightNo);
const airlineInitialsFrom = (code, flightNo) => window.BrsAirlines.airlineInitialsFrom(code, flightNo);

function setHeroAirline(airlineName, airlineIata, flightNo) {
  if (!els.heroAirline) return;

  const name = String(airlineName || "").trim();
  const code = likelyAirlineCode(airlineIata, flightNo);
  const initials = airlineInitialsFrom(code, flightNo);

  if (!name && (!initials || initials === "—")) {
    els.heroAirline.style.display = "none";
    return;
  }
  els.heroAirline.style.display = "";

  if (els.heroAirlineName) els.heroAirlineName.textContent = name || "—";

  // Reset reveal state
  if (els.heroAirlineLogo) els.heroAirlineLogo.style.opacity = "0";
  if (els.heroAirlineInitials) els.heroAirlineInitials.style.opacity = "0";

  // Show initials immediately while logo loads
  if (els.heroAirlineInitials) {
    els.heroAirlineInitials.textContent = initials || "—";
    els.heroAirlineInitials.style.opacity = "1";
  }

  if (!els.heroAirlineLogo || !code) return;

  const img = els.heroAirlineLogo;
  img.alt = name ? `${name} logo` : "Airline logo";

  // Use shared logo helper if available; otherwise best-effort single URL.
  if (window.BrsAirlines && window.BrsAirlines.getLogoUrls && window.BrsAirlines.setImgWithFallback) {
    const urls = window.BrsAirlines.getLogoUrls(code);
    window.BrsAirlines.setImgWithFallback(img, urls, () => {
      img.style.opacity = "1";
      if (els.heroAirlineInitials) els.heroAirlineInitials.style.opacity = "0";
    });
    return;
  }

  // Fallback single-source (Kiwi)
  img.onload = () => {
    img.style.opacity = "1";
    if (els.heroAirlineInitials) els.heroAirlineInitials.style.opacity = "0";
  };
  img.onerror = () => { /* initials remain */ };
  img.src = `https://images.kiwi.com/airlines/64/${encodeURIComponent(code)}.png`;
  if (img.complete && img.naturalWidth > 0) img.onload();
}


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
  let toastT = null;
  function showToast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => els.toast.classList.remove("show"), 2000);
  }

  // Someone who opened a shared link has no history to go back to: go to the list instead.
  function goBack() {
    let sameOrigin = false;
    try { sameOrigin = !!document.referrer && new URL(document.referrer).origin === window.location.origin; } catch { /* ignore */ }
    if (sameOrigin && window.history.length > 1) window.history.back();
    else window.location.href = "index.html";
  }

  function shareCurrent() {
    if (!state.current || !state.route) return;
    // Share exactly the URL being viewed (type/flight/date) so the link always resolves.
    window.BrsFlights.shareFlight(state.current, state.route.type, showToast, window.BrsFlights.urlFor(state.route));
  }

  if (els.backBtn) els.backBtn.addEventListener("click", goBack);
  if (els.refreshBtn) els.refreshBtn.addEventListener("click", () => refreshNow(true));
  if (els.notFoundRetry) els.notFoundRetry.addEventListener("click", () => refreshNow(true));
  if (els.shareBtn) els.shareBtn.addEventListener("click", shareCurrent);
  if (els.calendarBtn) els.calendarBtn.addEventListener("click", () => {
    if (!state.current || !state.route) return;
    const ok = window.BrsFlights.downloadIcs(state.current, state.route.type, window.BrsFlights.urlFor(state.route));
    showToast(ok ? "Calendar event downloaded" : "No time available for this flight");
  });
  if (els.shareIconBtn) els.shareIconBtn.addEventListener("click", shareCurrent);
  if (els.autoBtn) {
    els.autoBtn.addEventListener("click", () => {
      state.auto = !state.auto;
      els.autoBtn.setAttribute("aria-checked", state.auto ? "true" : "false");
      els.autoBtn.textContent = `Auto-refresh: ${state.auto ? "On" : "Off"}`;
      if (state.auto) startAuto(); else stopAuto();
    });
  }

  // ---------- Not-found / error state ----------
  function showNotFound(kind) {
    document.body.classList.add("is-notfound");
    if (els.notFound) els.notFound.hidden = false;
    const r = state.route;
    const label = r ? `${r.flight} on ${window.BrsTime.fmtDay(`${r.date}T12:00:00Z`)}` : "that flight";
    let title = "Flight not found";
    let msg = `We couldn’t find ${label}. It may have been removed from the timetable, or the link may be wrong.`;
    if (kind === "network") {
      title = "Couldn’t load this flight";
      msg = "Check your connection and try again.";
    } else if (kind === "invalid") {
      title = "Flight link incomplete";
      msg = "This link doesn’t say which flight to show. Pick a flight from the list instead.";
    }
    setText(els.notFoundTitle, title);
    setText(els.notFoundMsg, msg);
    if (els.notFoundRetry) els.notFoundRetry.style.display = kind === "invalid" ? "none" : "";
    setText(els.headline, r ? r.flight : "Flight details");
    setText(els.subhead, "—");
    setText(els.updatedLine, "");
    document.title = `${r ? r.flight : "Flight"} not found · BRS Flights`;
  }
  function hideNotFound() {
    document.body.classList.remove("is-notfound");
    if (els.notFound) els.notFound.hidden = true;
  }

  // ---------- Init ----------
  // The URL identifies the flight: ?type=arrival&flight=U2%202806&date=2026-10-02
  // (older links used ?key=… with the flight stored in sessionStorage — still understood).
  function readRoute(params) {
    const flight = String(params.get("flight") || "").trim();
    const type = String(params.get("type") || "").trim();
    if (!flight || !type) return null;
    const dateParam = String(params.get("date") || "");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : window.BrsTime.londonDateKey(new Date());
    return { type: window.BrsFlights.normMode(type), flight: window.BrsFlights.normFlightNo(flight), date };
  }

  function routeFromLegacyKey(params) {
    const key = params.get("key");
    if (!key) return null;
    const raw = safeGetSession(key);
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw);
      if (!payload || !payload.flight) return null;
      const mode = (payload.context && payload.context.mode) || payload.flight.type;
      const route = window.BrsFlights.routeOf(payload.flight, mode);
      if (!route.flight) return null;
      window.BrsFlights.saveCached(route, payload.flight);
      return route;
    } catch { return null; }
  }

  function init() {
    const params = new URLSearchParams(window.location.search);
    const route = readRoute(params) || routeFromLegacyKey(params);

    if (!route) {
      showNotFound("invalid");
      stopAuto();
      return;
    }

    state.route = route;
    state.context = { mode: route.type, airport: window.BrsConfig.AIRPORT };
    state.storageKey = window.BrsFlights.cacheKey(route);

    // Keep the address bar canonical (fills in a missing date, replaces legacy ?key= links).
    try {
      const canon = window.BrsFlights.urlFor(route);
      if (canon !== window.location.href) window.history.replaceState(null, "", canon);
    } catch { /* ignore */ }

    document.title = `${route.flight} · BRS Flights`;

    // Airport names (offline-first index) — used for city names in the hero and in share text.
    if (window.BrsAirports) {
      ensureAirportIndex().then(() => { if (state.current) repaintHero(); });
    }

    // Paint instantly from the last known copy of this flight, then refresh from the network.
    const cached = window.BrsFlights.loadCached(route);
    if (cached) {
      state.current = cached.flight;
      render(state.current, null);
      setUpdated(cached.ts, true);
    } else {
      setText(els.headline, route.flight);
      setText(els.subhead, "Loading…");
    }

    refreshNow(false);
    startAuto();
  }

  function repaintHero() {
    if (!state.current) return;
    const flat = flattenObject(state.current);
    const id = deriveIdentity(state.current);
    renderHeroCard(state.current, flat, id);
    renderKpis(flat, id);
  }

  function setUpdated(ts, fromCache) {
    const t = window.BrsTime.fmtTime(ts);
    state.updatedText = t ? (fromCache ? `Showing saved data from ${t}` : `Updated ${t}`) : "";
    setText(els.updatedLine, state.updatedText);
  }

  // Poll only while the page is visible; refresh straight away when coming back to it.
  function startAuto() {
    stopAuto();
    if (!state.auto || document.visibilityState !== "visible") return;
    state.timer = setInterval(() => refreshNow(false), state.intervalMs);
  }
  function stopAuto() { if (state.timer) clearInterval(state.timer); state.timer = null; }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (state.route && Date.now() - state.lastOkAt > 30000) refreshNow(false);
      startAuto();
      startCountdownTimer();
    } else {
      stopAuto();
      stopCountdownTimer();
    }
  });

  // Keep the "Lands in 23 min" countdown ticking between refreshes.
  function startCountdownTimer() {
    stopCountdownTimer();
    if (document.visibilityState !== "visible") return;
    state.countdownTimer = setInterval(renderCountdown, 30000);
  }
  function stopCountdownTimer() { if (state.countdownTimer) clearInterval(state.countdownTimer); state.countdownTimer = null; }

  // ---------- Refresh ----------
  async function refreshNow(forceFeedback) {
    if (!state.route || state.fetching) return;
    setFetching(true);
    try {
      const updated = await fetchBestEffortUpdate(state.route, state.current);

      if (!updated) {
        // The worker answered but the flight isn't in it.
        setNetBanner(false);
        if (!state.current) showNotFound("missing");
        else if (forceFeedback) showToast("No newer data for this flight");
        return;
      }

      hideNotFound();
      const prev = state.current;
      state.current = mergeKnown(prev, updated);
      window.BrsFlights.saveCached(state.route, state.current);
      state.lastOkAt = Date.now();
      render(state.current, prev);
      setNetBanner(false);
      setUpdated(Date.now(), false);
      if (forceFeedback) showToast("Updated");
    } catch (e) {
      console.error(e);
      if (!state.current) showNotFound("network");
      else setNetBanner(true);
      if (forceFeedback) showToast("Refresh failed");
    } finally {
      setFetching(false);
    }
  }

  function setFetching(isFetching) {
    state.fetching = !!isFetching;
    if (isFetching && state.current) setText(els.updatedLine, "Updating…");
    else setText(els.updatedLine, state.updatedText);
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

  // If the newer record lacks something we already knew (e.g. registration), keep it.
  function mergeKnown(prev, next) {
    if (!prev) return next;
    const out = { ...next, aircraft: { ...(next.aircraft || {}) } };
    for (const k of ["regNumber", "modelText"]) {
      if (!out.aircraft[k] && prev.aircraft && prev.aircraft[k]) out.aircraft[k] = prev.aircraft[k];
    }
    return out;
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
    const m = window.BrsTime.minutesBetween(t1, t2);
    return m === null ? null : Math.abs(m);
  }

  /** Ask the worker for this flight; returns the best matching record, null if not listed. Throws on network/HTTP errors. */
  async function fetchBestEffortUpdate(route, current) {
    const F = window.BrsFlights;
    const home = window.BrsConfig.AIRPORT;

    const url = new URL(`${window.BrsConfig.API_BASE}/flights`);
    url.searchParams.set("flight_iata", route.flight);
    url.searchParams.set(route.type === "departure" ? "dep_iata" : "arr_iata", home);
    url.searchParams.set("date", route.date);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Flight HTTP ${res.status}`);

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);

    const curId = current ? deriveIdentity(current) : null;
    let best = null;
    let bestScore = -1;
    for (const f of list) {
      // Must be the same flight number, with Bristol on the right side of it.
      if (!F.sameFlightNo(F.flightNo(f), route.flight)) continue;
      const homeCode = normIata(F.seg(f, route.type).iataCode);
      if (homeCode && homeCode !== home) continue;

      let score = 1;
      if (F.dateKey(f, route.type) === route.date) score += 4;
      if (curId) score += scoreMatch(curId, deriveIdentity(f));
      if (score > bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  // ---------- Render ----------
  function render(flight, prev) {
    if (!flight) return;

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

    // Hero card (app-style flight overview) + operational info
    renderHeroCard(flight, flat, id);
    renderOpsBar(flight);

    if (state.route) document.title = `${displayNo} ${route.replace(" → ", "→")} · BRS Flights`;

    // Airline basics
    const airlineNameVal = pickAny(flat, ["airline.name", "flight.airline.name", "airlineName", "airline"]) || "—";
    const airlineIata = pickAny(flat, ["airline.iata", "airline.iataCode", "flight.airline.code.iata", "airline_iata", "airlineCode"]) || "";
    if (els.airlineName) els.airlineName.textContent = airlineNameVal;
    if (els.airlineCodeLine) els.airlineCodeLine.textContent = airlineIata ? `Airline code: ${airlineIata}` : "Airline code: —";

    // Hero airline (logo + name above flight number)
    setHeroAirline(airlineNameVal, airlineIata, displayNo);

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
    // Only a real ICAO/IATA type code (2–4 chars, e.g. A20N, E175). Older worker builds sent the 6-char transponder hex here.
    let acCode = String(pickAny(flat, ["aircraft.icaoCode", "aircraft.model.code", "aircraft.modelCode", "flight.aircraft.model.code", "aircraftCode", "aircraft.code"]) || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{2,4}$/.test(acCode)) acCode = "";
    const acText = pickAny(flat, ["aircraft.model.text", "aircraft.modelText", "flight.aircraft.model.text", "aircraftType", "aircraft.text", "aircraft.model"]) || "";
    if (els.aircraftType) {
      els.aircraftType.textContent = acText ? `${acText}${acCode ? ` (${acCode})` : ""}` : acCode ? `Aircraft ${acCode}` : "Aircraft —";
    }
    // Generic side-view illustration chosen from the model name (not a photo of the actual aircraft)
    if (els.aircraftArt && window.BrsAircraft) {
      const kind = window.BrsAircraft.kindFor(acText);
      if (kind !== state.aircraftKind) {
        state.aircraftKind = kind;
        els.aircraftArt.innerHTML = window.BrsAircraft.svg(kind);
        els.aircraftArt.setAttribute("aria-label", `Illustration of a ${window.BrsAircraft.label(kind)}${acText ? ` (${acText})` : ""}`);
        els.aircraftArt.hidden = false;
      }
    }

    const reg = pickAny(flat, ["aircraft.regNumber", "flight.aircraft.registration", "aircraft.registration", "registration"]) || "";
    if (els.aircraftReg) {
  els.aircraftReg.textContent = reg
    ? `Tail Number: ${reg}`
    : "Tail Number: —";
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


function kvLine(label, val, showEmpty, cls) {
  if (!val && !showEmpty) return "";
  const v = val || "—";
  const divCls = cls ? `kv-line kv-line--${escapeHtml(cls)}` : "kv-line";
  return `<div class="${divCls}"><span class="kv-k">${escapeHtml(label)}</span><span class="kv-v">${escapeHtml(v)}</span></div>`;
}

// Terminal / gate / belt only mean something at Bristol; the other airport's values are hidden.
const atDeparture = currentMode(flight) === "departure";

if (els.depKv) {
  els.depKv.innerHTML = `
    <div class="kv-stack">
      ${kvLine("Scheduled", depInfo.sched || "—")}
      ${kvLine("Estimated", depInfo.est)}
      ${kvLine("Actual", depInfo.act)}
      ${atDeparture ? kvLine("Terminal", depInfo.term) : ""}
      ${atDeparture ? kvLine(depInfo.gateChanged ? "New gate" : "Gate", depInfo.gate, true, depInfo.gateChanged ? "newgate" : "gate") : ""}
      ${atDeparture ? kvLine("Stand", depInfo.stand) : ""}
    </div>
  `;
}

if (els.arrKv) {
  els.arrKv.innerHTML = `
    <div class="kv-stack">
      ${kvLine("Scheduled", arrInfo.sched || "—")}
      ${kvLine("Estimated", arrInfo.est)}
      ${kvLine("Actual", arrInfo.act)}
      ${!atDeparture ? kvLine("Terminal", arrInfo.term) : ""}
      ${!atDeparture ? kvLine("Belt", arrInfo.belt, true, "belt") : ""}
    </div>
  `;
}


    // KPIs (duration, distance, carbon, delay)
    renderKpis(flat, id);
// Weather
    renderWeatherByCityName(flat).catch((e) => console.warn("Weather render failed:", e));
  }

  // Which side of the flight is at Bristol: departures -> departure, arrivals -> arrival.
  function currentMode(flight) {
    if (state.route) return state.route.type;
    const t = String((flight && flight.type) || (state.context && state.context.mode) || "").toLowerCase();
    return t.includes("dep") ? "departure" : "arrival";
  }

  // Terminal and check-in desk at Bristol (gate / belt are the hero pills). Hidden when unknown.
  function renderOpsBar(flight) {
    if (!els.opsBar) return;
    const atDeparture = currentMode(flight) === "departure";
    const seg = (atDeparture ? flight.departure : flight.arrival) || {};

    const items = [];
    if (seg.terminal) items.push(["🏢 Terminal", String(seg.terminal)]);
    if (atDeparture && seg.checkInDesk) items.push(["🛄 Check-in desk", String(seg.checkInDesk)]);

    if (!items.length) {
      els.opsBar.style.display = "none";
      els.opsBar.innerHTML = "";
      return;
    }
    els.opsBar.style.display = "";
    els.opsBar.innerHTML = items.map(([k, v]) => `
      <div class="ops-item">
        <div class="ops-k">${escapeHtml(k)}</div>
        <div class="ops-v">${escapeHtml(v)}</div>
      </div>`).join("");
  }

  // ---------- Hero card ----------
  function setShown(el, shown) {
    if (!el) return;
    el.hidden = !shown;
    el.style.display = shown ? "" : "none";
  }

  function fmtCountdown(mins) {
    const m = Math.abs(Math.round(mins));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h}h ${String(mm).padStart(2, "0")}m` : `${h}h`;
  }

  function paintHeroSide(seg, code, dateEl, cityEl, timeEl, oldEl) {
    const T = window.BrsTime;
    if (dateEl) dateEl.textContent = T.fmtDay(seg.scheduledTime || seg.estimatedTime) || "—";
    if (cityEl) cityEl.textContent = getCityName(code) || "—";

    const sched = T.fmtTime(seg.scheduledTime);
    const live = T.fmtTime(seg.actualTime || seg.estimatedTime);
    if (timeEl) timeEl.textContent = live || sched || "—";
    if (oldEl) {
      const moved = !!(sched && live && sched !== live);
      oldEl.textContent = moved ? sched : "";
      oldEl.style.display = moved ? "" : "none";
    }
  }

  function paintHeroStatus(el, info) {
    if (!el) return;
    if (!info) { setShown(el, false); return; }
    el.classList.remove("hero-delay-good", "hero-delay-warn", "hero-delay-bad", "hero-delay-neutral");
    el.classList.add(`hero-delay-${info.tone}`);
    el.textContent = info.text;
    setShown(el, true);
  }

  // "Lands in 23 min" / "Landed 14:52" (arrivals) — "Departs in 1h 05m" / "Departed" (departures).
  function renderCountdown() {
    if (!els.heroCountdownText || !state.current) return;
    const F = window.BrsFlights;
    const T = window.BrsTime;
    const flight = state.current;
    const mode = currentMode(flight);
    const info = F.statusInfo(flight, mode);
    const target = F.keyTime(flight, mode);
    const mins = target ? Math.round((target.getTime() - Date.now()) / 60000) : null;
    const when = T.fmtTime(target);

    let text = "—";
    if (info.key === "cancelled" || info.key === "diverted") text = info.text;
    else if (mode === "arrival") {
      if (info.key === "landed") text = info.text;
      else if (mins === null) text = "—";
      else if (mins > 0) text = `Lands in ${fmtCountdown(mins)}`;
      else text = when ? `Due ${when}` : "—";
    } else {
      if (info.key === "departed") text = "Departed";
      else if (mins === null) text = "—";
      else if (mins > 0) text = `Departs in ${fmtCountdown(mins)}`;
      else text = when ? `Due to depart ${when}` : "—";
    }
    els.heroCountdownText.textContent = text;
  }

  function renderHeroCard(flight, flat, id) {
    if (!flight || !els.heroCard) return;
    const F = window.BrsFlights;

    const mode = currentMode(flight);
    const atDeparture = mode === "departure";
    const dep = flight.departure || {};
    const arr = flight.arrival || {};

    if (els.heroFlightNumber) els.heroFlightNumber.textContent = F.flightNo(flight) || id?.flightNo || "—";

    paintHeroSide(dep, dep.iataCode || id?.dep, els.heroDepDate, els.heroDepCity, els.heroDepTime, els.heroDepTimeOld);
    paintHeroSide(arr, arr.iataCode || id?.arr, els.heroArrDate, els.heroArrCity, els.heroArrTime, els.heroArrTimeOld);

    // Status only on the Bristol side — the other airport's status isn't what you're here for.
    const info = F.statusInfo(flight, mode);
    paintHeroStatus(els.heroDepDelay, atDeparture ? info : null);
    paintHeroStatus(els.heroArrDelay, atDeparture ? null : info);

    // Gate for departures, belt for arrivals (the other side's gate/belt is irrelevant at Bristol).
    setShown(els.heroGateItem, atDeparture);
    setShown(els.heroBeltItem, !atDeparture);

    if (els.heroGate) {
      const gate = String(dep.gate || "").trim();
      els.heroGate.textContent = gate || "TBC";
      // Yellow by default; red if the gate changes (sticky across refreshes).
      els.heroGate.classList.toggle("is-changed", atDeparture && opsChangedSticky("hero_gate", gate));
    }
    if (els.heroBaggage) {
      const belt = String(arr.baggage || "").trim();
      els.heroBaggage.textContent = belt || "TBC";
    }

    // Pickup tip: passengers need time to get through the terminal after landing.
    const hint = document.getElementById("heroHint");
    if (hint) {
      const show = !atDeparture && info.key !== "cancelled" && info.key !== "diverted";
      hint.textContent = show ? "Passengers usually reach the arrivals hall 20–30 minutes after landing." : "";
      setShown(hint, show);
    }

    renderCountdown();
  }

  // ---------- Flight metrics (duration, distance, carbon, delay) ----------
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

  function renderKpis(flat, id) {
    if (!els.kpis) return;

    const delays = getDelays(flat);

    // Duration: scheduled (fallback to actual/estimated when needed)
    const dur = minutesBetween(delays.schedDep || delays.actualDep, delays.schedArr || delays.actualArr);

    // Distance: from the airport index; else from endpoints the map resolved (geocoded airports)
    const depCode = normIata(id?.dep);
    const arrCode = normIata(id?.arr);
    let km = null;

    const depC = depCode ? coordsFor(depCode) : null;
    const arrC = arrCode ? coordsFor(arrCode) : null;

    if (depC && arrC) {
      km = haversineKm(depC.lat, depC.lon, arrC.lat, arrC.lon);
    } else if (state.lastRouteMeta && state.lastRouteMeta.distanceKm) {
      km = state.lastRouteMeta.distanceKm;
    }

    const co2 = estimateCarbonKg(km);

    // Delay at Bristol: departure delay for departures, arrival delay for arrivals.
    const brsDelay = state.route && state.route.type === "arrival" ? delays.arrDelay : delays.depDelay;
    const delayLabel = brsDelay === null ? "—" : `${brsDelay >= 0 ? "+" : ""}${Math.round(brsDelay)}m`;

    els.kpis.innerHTML = `
      <div class="kpi-chip"><span class="kpi-k">Duration</span><span class="kpi-v">${escapeHtml(fmtDuration(dur))}</span></div>
      <div class="kpi-chip"><span class="kpi-k">Distance</span><span class="kpi-v">${escapeHtml(fmtKm(km))}</span></div>
      <div class="kpi-chip"><span class="kpi-k">CO₂e</span><span class="kpi-v" title="Rough estimate per passenger">${escapeHtml(fmtKg(co2))}</span></div>
      <div class="kpi-chip"><span class="kpi-k">Delay</span><span class="kpi-v">${escapeHtml(delayLabel)}</span></div>
    `;
  }

// ---------- Recent history (last 7 days of this flight at Bristol) ----------
  // Loaded only when the section is opened: the worker uses a pricier upstream endpoint and caches it.
  function fmtDelta(delay, status) {
    if (status === "cancelled") return { text: "Cancelled", tone: "bad" };
    const n = Number(delay);
    if (delay === "" || delay == null || !Number.isFinite(n)) return { text: "—", tone: "neutral" };
    if (n === 0) return { text: "On time", tone: "good" };
    if (n < 0) return { text: `${Math.abs(n)} min early`, tone: "good" };
    return { text: `+${n} min`, tone: n > 15 ? "warn" : (n <= 5 ? "good" : "neutral") };
  }

  function renderHistory(data) {
    const T = window.BrsTime;
    const body = els.historyBody;
    const rows = (data && Array.isArray(data.rows)) ? data.rows : [];
    const arrival = state.route && state.route.type === "arrival";

    if (!rows.length) {
      body.innerHTML = `<p class="small">No recent history found for this flight.</p>`;
      return;
    }

    const st = data.stats || {};
    const parts = [];
    if (st.avgDelay !== null && st.avgDelay !== undefined) {
      const a = st.avgDelay;
      parts.push(`Average ${a === 0 ? "on time" : a > 0 ? `${a} min late` : `${Math.abs(a)} min early`}`);
      parts.push(`${st.onTime} of ${st.measured} within 15 min`);
    }
    if (st.cancelled) parts.push(`${st.cancelled} cancelled`);

    const trs = rows.map((r) => {
      const d = fmtDelta(r.delay, r.status);
      const sched = T.fmtTime(r.scheduled) || "—";
      const actual = r.status === "cancelled" ? "—" : (T.fmtTime(r.actual) || "—");
      return `<tr>
        <td>${escapeHtml(T.fmtDay(r.scheduled) || r.date || "—")}</td>
        <td>${escapeHtml(sched)}</td>
        <td>${escapeHtml(actual)}</td>
        <td class="num"><span class="hist-chip ${d.tone}">${escapeHtml(d.text)}</span></td>
      </tr>`;
    }).join("");

    body.innerHTML = `
      ${parts.length ? `<p class="history-summary">${escapeHtml(parts.join(" · "))}</p>` : ""}
      <table class="history-table">
        <caption class="sr-only">Scheduled and actual ${arrival ? "arrival" : "departure"} times at Bristol, most recent first</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Scheduled</th><th scope="col">${arrival ? "Landed" : "Departed"}</th><th scope="col" class="num">Difference</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
      <p class="small history-note">UK times. Differences within 15 minutes count as on time.</p>`;
  }

  async function loadHistory() {
    const h = state.history;
    if (!state.route || h.loading || h.loaded || !els.historyBody) return;
    h.loading = true;
    els.historyBody.textContent = "Loading…";
    try {
      const url = new URL(`${window.BrsConfig.API_BASE}/history`);
      url.searchParams.set("flight_iata", state.route.flight);
      url.searchParams.set(state.route.type === "departure" ? "dep_iata" : "arr_iata", window.BrsConfig.AIRPORT);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`History HTTP ${res.status}`);
      renderHistory(await res.json());
      h.loaded = true;
    } catch (e) {
      console.warn("History unavailable:", e);
      els.historyBody.innerHTML = `
        <p class="small">Flight history isn’t available right now.</p>
        <button class="btn history-retry" id="historyRetry" type="button">Try again</button>`;
      document.getElementById("historyRetry")?.addEventListener("click", loadHistory);
    } finally {
      h.loading = false;
    }
  }

  if (els.historyCard) {
    els.historyCard.addEventListener("toggle", () => { if (els.historyCard.open) loadHistory(); });
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

  function fmtSun(timeStr) {
    // Open-Meteo (timezone=auto) returns local ISO time, e.g. "2026-10-02T07:12": just take HH:MM.
    const m = /T(\d{2}:\d{2})/.exec(String(timeStr || ""));
    return m ? m[1] : "—";
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

    await ensureAirportIndex();
    const placeLabel = getCityName(destCode) || destCode || "";
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

    // Coords: airport index first, else geocode by name
    let lat = null, lon = null;
    const known = destCode ? coordsFor(destCode) : null;
    if (known) {
      lat = known.lat;
      lon = known.lon;
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
    const wxTitle = document.getElementById("wxTitle");
    if (wxTitle) wxTitle.textContent = `Weather in ${placeLabel || "destination"}`;
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
      const sr = sunrise[i] ? fmtSun(sunrise[i]) : "—";
      const ss = sunset[i] ? fmtSun(sunset[i]) : "—";

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

    // Known airport: use the index (no network).
    await ensureAirportIndex();
    const known = coordsFor(iata);
    if (known) return { lat: known.lat, lon: known.lon, label: normIata(iata) || "—", name: airportNameFor(iata) };

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

    // Map tiles come from our worker (/api/tiles/...), which adds the CARTO API key server-side so the
    // key never reaches the browser. If the worker can't serve tiles (not deployed yet, secret missing,
    // CARTO down) we fall back to plain OpenStreetMap tiles so the map never goes blank.
    const tileBase = `${window.BrsConfig.API_BASE}/tiles`;
    const cartoAttr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
    const osmAttr = '&copy; OpenStreetMap contributors';

    state.tileLight = L.tileLayer(`${tileBase}/rastertiles/voyager/{z}/{x}/{y}{r}.png`, {
      maxZoom: 19,
      attribution: cartoAttr,
    });
    state.tileDark = L.tileLayer(`${tileBase}/dark_all/{z}/{x}/{y}{r}.png`, {
      maxZoom: 19,
      attribution: cartoAttr,
      className: "tiles-dark",
    });

    const osmLight = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      subdomains: "abc",
      maxZoom: 19,
      attribution: osmAttr,
    });
    // OSM with a CSS dark filter (see .tiles-dark-fallback)
    const osmDark = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      subdomains: "abc",
      maxZoom: 19,
      attribution: osmAttr,
      className: "tiles-dark-fallback",
    });

    // After a few failed tiles (one stray failure is normal), swap that theme's layer for its fallback.
    const guardTiles = (which, theme, fallback) => {
      let failures = 0;
      state[which].on("tileerror", () => {
        if (++failures < 3 || state[which] === fallback) return;
        try { state.map.removeLayer(state[which]); } catch {}
        state[which] = fallback;
        if (state.mapTheme === theme) {
          state.mapTheme = null;   // so applyTheme doesn't short-circuit
          applyTheme(theme);
        }
      });
    };
    guardTiles("tileLight", "light", osmLight);
    guardTiles("tileDark", "dark", osmDark);

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

    await ensureAirportIndex();
    const [depGeo, arrGeo] = await Promise.all([
      Promise.resolve(coordsFor(depCode)).then((c) => c || geocodeCachedQuery(depCity)),
      Promise.resolve(coordsFor(arrCode)).then((c) => c || geocodeCachedQuery(arrCity)),
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

    // Animate the path + plane (skipped for people who prefer reduced motion)
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.routeLine.setLatLngs(points);
      const last = points[points.length - 1];
      const prev = points[points.length - 2] || last;
      state.planeMarker.setLatLng(last);
      state.planeMarker.setIcon(makePlaneIcon(bearingDeg(prev[0], prev[1], last[0], last[1])));
      setTimeout(() => { try { state.map.invalidateSize(); } catch {} }, 120);
      return;
    }
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

  // ---------- Start ----------
  // (Called last so every const above is initialised before the first render.)
  init();
  startCountdownTimer();
