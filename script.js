// Bristol Airport — redesigned mobile UI (stable build)
// - Aviation Edge timetable (departures/arrivals)
// - Saved (starred) flights stored in localStorage
// - Install button (optional) + security wait samples
"use strict";

// =======================
// Configuration
// =======================
// Override key via 'aviationEdgeApiKey','YOUR_KEY')
const apiKey =
  (new URLSearchParams(location.search).get("key")) ||
  (safeGetLocal("aviationEdgeApiKey")) ||
  "26071f-14ef94"; 

// ---------- Airport coordinate prefetch (for accurate map pins on details page) ----------
const AIRPORT_GEO_CACHE_KEY = "brs_airport_geo_cache_v1";
const AIRPORT_GEO_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function normIata(code){ return String(code||"").trim().toUpperCase(); }

function loadAirportGeoCache(){
  try{
    const raw = localStorage.getItem(AIRPORT_GEO_CACHE_KEY);
    if(!raw) return { ts:0, data:{} };
    const parsed = JSON.parse(raw);
    const ts = Number(parsed && parsed.ts) || 0;
    const data = (parsed && parsed.data && typeof parsed.data==="object") ? parsed.data : {};
    return { ts, data };
  }catch{ return { ts:0, data:{} }; }
}
function saveAirportGeoCache(cache){
  try{ localStorage.setItem(AIRPORT_GEO_CACHE_KEY, JSON.stringify(cache)); }catch{}
}
function isValidLatLon(lat, lon){
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
    !(Math.abs(lat) < 0.001 && Math.abs(lon) < 0.001);
}

async function geocodeAirportOpenMeteo(query){
  const q = String(query||"").trim();
  if(!q) return null;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), { cache:"no-store" });
  if(!res.ok) return null;
  const data = await res.json();
  const results = (data && Array.isArray(data.results)) ? data.results : [];
  if(!results.length) return null;

  const best = results.find(r => String(r.feature_code||"").toUpperCase()==="AIRP") || results[0];
  const lat = Number(best.latitude);
  const lon = Number(best.longitude);
  if(!isValidLatLon(lat, lon)) return null;
  return { lat, lon, name: best.name || q };
}

function airportQueryFromParts(iata, name){
  const n = String(name||"").trim();
  if(n){
    return /airport/i.test(n) ? n : `${n} Airport`;
  }
  const c = normIata(iata);
  return c ? `${c} Airport` : "";
}

async function ensureAirportCached(iata, name){
  const code = normIata(iata);
  if(!code) return;
  const now = Date.now();
  const cache = loadAirportGeoCache();
  const fresh = (now - (cache.ts||0)) < AIRPORT_GEO_TTL_MS;
  if(fresh && cache.data && cache.data[code]) return;

  const query = airportQueryFromParts(code, name);
  const geo = await geocodeAirportOpenMeteo(query);
  if(!geo) return;

  const entry = { lat: geo.lat, lon: geo.lon, name: geo.name, q: query, t: now };
  cache.ts = now;
  cache.data = cache.data || {};
  cache.data[code] = entry;
  saveAirportGeoCache(cache);
}

function pickAny(obj, paths){
  for(const p of paths){
    const parts = p.split(".");
    let v = obj;
    for(const k of parts){
      if(!v || typeof v !== "object") { v = undefined; break; }
      v = v[k];
    }
    if(v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

async function prefetchAirportsFromFlights(depList, arrList){
  const flights = [...(depList||[]), ...(arrList||[])];
  const seen = new Set();
  const jobs = [];
  for(const f of flights){
    const flat = flattenObject(f || {});
    const depIata = pickAny(flat, ["departure.iataCode","departure.iata","departure.airport.iataCode","departure.airport.iata","depIata","dep.iataCode"]);
    const depName = pickAny(flat, ["departure.airport.name","departure.airportName","departure.airport","departure.name","departure.city","departure.cityName"]);
    const arrIata = pickAny(flat, ["arrival.iataCode","arrival.iata","arrival.airport.iataCode","arrival.airport.iata","arrIata","arr.iataCode"]);
    const arrName = pickAny(flat, ["arrival.airport.name","arrival.airportName","arrival.airport","arrival.name","arrival.city","arrival.cityName"]);

    const pairs = [[depIata, depName],[arrIata, arrName]];
    for(const [iata, name] of pairs){
      const code = normIata(iata);
      if(!code || seen.has(code)) continue;
      seen.add(code);
      jobs.push(()=>ensureAirportCached(code, name));
    }
  }

  // Concurrency limit (gentle to free API)
  const limit = 3;
  let i = 0;
  const workers = new Array(limit).fill(0).map(async ()=>{
    while(i < jobs.length){
      const j = jobs[i++];
      try{ await j(); }catch{}
    }
  });
  await Promise.all(workers);
}
// replace with your own key

// Airport IATA code (Bristol Airport = BRS)
const airportIata = "BRS";

// Stores current airport coordinates (for details page map fallback)
window.__brsAirportPos = window.__brsAirportPos || null;

// =======================
// Small utilities
// =======================
function safeSetSession(key, value){ try { sessionStorage.setItem(key, value); return true; } catch { return false; } }
function safeGetLocal(key){ try { return localStorage.getItem(key);} catch { return null; } }
function safeSetLocal(key, value){ try { localStorage.setItem(key,value); return true;} catch { return false; } }
function escapeHtml(s){ return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

function pickAny(obj, keys){
  for (const k of (keys || [])){
    if (!k) continue;
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

/** Flatten nested objects into dot-key map (safe for API heterogeneity). */
function flattenObject(obj, prefix = ""){
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k,v] of Object.entries(obj)){
    const nk = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)){
      Object.assign(out, flattenObject(v, nk));
    } else {
      out[nk] = v;
    }
  }
  return out;
}

function toDate(value){
  const d = parseAviationEdgeTime(value);
  return d;
}

// =======================
// City name mapping (fallback to code)
// =======================
const airportCodeToCityName = {
  "ABZ":"Aberdeen","AGP":"Malaga","ADA":"Izmir","ALC":"Alicante","AMS":"Amsterdam","ATA":"Antalya","AYT":"Dalaman",
  "BCN":"Barcelona","BLQ":"Bologna","BHD":"Belfast City","BFS":"Belfast International","CDG":"Paris Charles de Gaulle",
  "CFU":"Corfu","CUN":"Cancun","DAA":"Sharm el Sheikh","DLM":"Dalaman","EDI":"Edinburgh","FAO":"Faro","FCO":"Rome",
  "FNC":"Madeira","GLA":"Glasgow","HRG":"Hurghada","INV":"Inverness","IOM":"Isle of Man","JER":"Jersey","KRK":"Krakow",
  "LIN":"Milan","LIS":"Lisbon","LPA":"Gran Canaria","MAN":"Manchester","MME":"Teesside","MUC":"Munich","NAP":"Naples",
  "NCL":"Newcastle","OLB":"Olbia","ORY":"Paris Orly","PMI":"Palma de Mallorca","PSA":"Pisa","RHO":"Rhodes","SKG":"Thessaloniki",
  "SSH":"Sharm el Sheikh","TFS":"Tenerife South","VIE":"Vienna","ZRH":"Zurich"
};
function getCityName(code){ return airportCodeToCityName[code] || code || "—"; }

// =======================
// Time helpers (London)
// =======================
const LONDON_TZ = "Europe/London";
const LONDON_TIME_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON_TZ, hour12:false, hour:"2-digit", minute:"2-digit" });
const LONDON_DATE_KEY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: LONDON_TZ, year:"numeric", month:"2-digit", day:"2-digit" });

function parseAviationEdgeTime(value){
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "number"){
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  if (/[zZ]$/.test(s) || /[+-]\d\d:\d\d$/.test(s)){
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)){
    const d = new Date(s.replace(" ","T") + "Z");
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function convertToLondonTime(v){
  const d = parseAviationEdgeTime(v);
  return d ? LONDON_TIME_FMT.format(d) : "—";
}

function scheduledMs(f){
  const d = parseAviationEdgeTime(f?.departure?.scheduledTime || f?.arrival?.scheduledTime);
  return d ? d.getTime() : 0;
}

function getCurrentTimeMinusOneHour(){
  const now = new Date();
  now.setHours(now.getHours() - 1);
  return now.getTime();
}

function filterFlightsByTime(flights){
  const cutoff = getCurrentTimeMinusOneHour();
  return (flights || []).filter(f => {
    const d = parseAviationEdgeTime(f?.departure?.scheduledTime || f?.arrival?.scheduledTime);
    // If time missing, keep (don’t hide everything)
    if (!d) return true;
    return d.getTime() >= cutoff;
  });
}

// =======================
// Airline logo + status
// =======================
function getAirlineLogoUrl(iataCode){
  if (!iataCode) return null;
  return `https://www.gstatic.com/flights/airline_logos/70px/${iataCode}.png`;
}

function getFlightStatusString(seg){
  if (!seg) return "—";
  if (seg.cancelled) return "Cancelled";
  if (seg.boarding) return "Boarding";
  if (seg.gate) return `Gate ${seg.gate}`;
  if (seg.delay) return `Delayed ${seg.delay} min`;
  return "—";
}
function statusTone(statusText){
  const s = String(statusText||"").toLowerCase();
  if (s.includes("cancel")) return "bad";
  if (s.includes("delay")) return "warn";
  if (s.includes("gate") || s.includes("boarding")) return "good";
  return "neutral";
}

// =======================
// UI state
// =======================
let depFlights = [];
let arrFlights = [];
let currentTab = "departures";
let quickFilter = "all";
let searchQuery = "";

// =======================
// Toast
// =======================
let toastT = null;
function toast(msg){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 1800);
}

// =======================
// Saved flights
// =======================
const STAR_KEY = "starredFlights_v1";

function getSavedFlights(){
  const raw = safeGetLocal(STAR_KEY);
  if (!raw) return [];
  try { const x = JSON.parse(raw); return Array.isArray(x) ? x : []; } catch { return []; }
}
function setSavedFlights(list){
  safeSetLocal(STAR_KEY, JSON.stringify(Array.isArray(list) ? list : []));
}

function deriveIdentity(f){
  const flat = flattenObject(f || {});
  const flightNo = pickAny(flat, ["flight.iataNumber","flight_iata","flightNumber","flight.iata","flight.number"]) || "";
  const dep = pickAny(flat, ["departure.iataCode","departure.iata","dep_iata","origin","from"]) || "";
  const arr = pickAny(flat, ["arrival.iataCode","arrival.iata","arr_iata","destination","to"]) || "";
  const schedDep = pickAny(flat, ["departure.scheduledTime","departure.scheduled","scheduled_departure","departure_time"]) || "";
  const schedArr = pickAny(flat, ["arrival.scheduledTime","arrival.scheduled","scheduled_arrival","arrival_time"]) || "";
  return { flightNo, dep, arr, schedDep, schedArr };
}

function isFlightSaved(flight){
  const id = deriveIdentity(flight);
  const list = getSavedFlights();
  return list.some(it => {
    const fid = it?.id;
    if (!fid) return false;
    return String(fid.flightNo||"").toUpperCase() === String(id.flightNo||"").toUpperCase()
      && String(fid.dep||"").toUpperCase() === String(id.dep||"").toUpperCase()
      && String(fid.arr||"").toUpperCase() === String(id.arr||"").toUpperCase()
      && String(fid.schedDep||"") === String(id.schedDep||"");
  });
}

function saveFlight(flight, context){
  const cur = getSavedFlights();
  const id = deriveIdentity(flight);
  const idx = cur.findIndex(x =>
    String(x?.id?.flightNo||"").toUpperCase() === String(id.flightNo||"").toUpperCase() &&
    String(x?.id?.schedDep||"") === String(id.schedDep||"") &&
    String(x?.id?.dep||"").toUpperCase() === String(id.dep||"").toUpperCase() &&
    String(x?.id?.arr||"").toUpperCase() === String(id.arr||"").toUpperCase()
  );

  if (idx >= 0){
    cur.splice(idx, 1);
  } else {
    const flat = flattenObject(flight || {});
    cur.unshift({
      id,
      updatedAt: Date.now(),
      context: context || null,
      airline: pickAny(flat, ["airline.name","airlineName","airline"]) || "",
      flight
    });
    if (cur.length > 200) cur.length = 200;
  }
  setSavedFlights(cur);
  renderSavedDrawer(false);
}

function renderSavedDrawer(forceOpen){
  const drawer = document.getElementById("savedDrawer");
  const bar = document.getElementById("savedBar");
  if (!drawer || !bar) return;

  const list = getSavedFlights();
  bar.innerHTML = list.map((item, i) => {
    const id = item?.id || {};
    const label = `${escapeHtml(id.flightNo || "Flight")} · ${escapeHtml(id.dep||"")}→${escapeHtml(id.arr||"")}`;
    return `<div class="chip" data-idx="${i}">
      <span>${label}</span><span class="x" title="Remove" aria-label="Remove">×</span>
    </div>`;
  }).join("");

  bar.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", (e) => {
      const idx = Number(ch.getAttribute("data-idx"));
      if (Number.isNaN(idx)) return;
      const list2 = getSavedFlights();
      const item = list2[idx];
      if (!item) return;

      if (e.target && e.target.classList && e.target.classList.contains("x")){
        list2.splice(idx,1);
        setSavedFlights(list2);
        renderSavedDrawer(true);
        return;
      }
      openFlightDetailsWithStorage(item.flight, item.context || { mode:"departure", airport: airportIata, day:1, airportPos: window.__brsAirportPos });
    });
  });

  drawer.style.display = (forceOpen || list.length) ? "" : "none";
}

function initSavedUI(){
  document.getElementById("savedBtn")?.addEventListener("click", () => renderSavedDrawer(true));
  document.getElementById("savedCloseBtn")?.addEventListener("click", () => {
    const drawer = document.getElementById("savedDrawer");
    if (drawer) drawer.style.display = "none";
  });
  renderSavedDrawer(false);
}

function openFlightDetailsWithStorage(flight, context){
  const key = `flight_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  safeSetSession(key, JSON.stringify({ flight, context }));
  window.location.href = `flight-details.html"departures";
  const flightNo = (flight?.flight?.iataNumber) ? flight.flight.iataNumber : (flight?.flight_iata || flight?.flightNumber || "—");
  const city = getCityName(isDep ? flight?.arrival?.iataCode : flight?.departure?.iataCode);
  const airlineName = flight?.airline?.name || flight?.airline?.iataCode || "—";
  const airlineCode = flight?.airline?.iataCode || "";
  const logo = getAirlineLogoUrl(airlineCode);
  const time = convertToLondonTime(isDep ? flight?.departure?.scheduledTime : flight?.arrival?.scheduledTime);
  const statusText = getFlightStatusString(isDep ? flight?.departure : flight?.arrival);
  const tone = statusTone(statusText);
  const route = isDep ? `Bristol → ${city}` : `${city} → Bristol`;
  const saved = isFlightSaved(flight);

  return `
    <article class="flight-card" data-open="1" data-idx="${idx}" role="button" tabindex="0">
      <div class="fc-top">
        <div class="flight-no">${escapeHtml(flightNo)}</div>
        <div class="time">${escapeHtml(time)}</div>
      </div>
      <div class="route">${escapeHtml(route)}</div>
      <div class="fc-bottom">
        <div class="airline">
          ${logo ? `<img class="airline-logo" src="${logo}" alt="" onerror="this.style.display='none';" />` : ``}
          <div class="airline-name">${escapeHtml(airlineName)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="status ${tone}">${escapeHtml(statusText)}</span>
          <button class="save-btn ${saved ? "saved" : ""}" data-save="1" data-idx="${idx}" aria-label="Save flight">${saved ? "★" : "☆"}</button>
        </div>
      </div>
    </article>
  `.trim();
}

function renderList(mode){
  const isDep = mode === "departures";
  const listEl = document.getElementById(isDep ? "departureList" : "arrivalList");
  const emptyEl = document.getElementById(isDep ? "depEmpty" : "arrEmpty");
  if (!listEl || !emptyEl) return;

  const flights = (isDep ? depFlights : arrFlights).slice().sort((a,b)=>scheduledMs(a)-scheduledMs(b));
  const qn = (searchQuery || "").trim().toLowerCase();
  const nowMs = Date.now();
  const fourH = nowMs + 4*60*60*1000;

  const filtered = flights.filter(f => {
    const seg = isDep ? f?.departure : f?.arrival;
    const status = getFlightStatusString(seg);
    const textBlob = `${f?.flight?.iataNumber || f?.flight_iata || f?.flightNumber || ""} ${f?.airline?.name || ""} ${f?.airline?.iataCode || ""} ${getCityName(isDep ? f?.arrival?.iataCode : f?.departure?.iataCode)} ${status}`.toLowerCase();
    if (qn && !textBlob.includes(qn)) return false;

    if (quickFilter === "next"){
      const ms = scheduledMs(f);
      if (ms && (ms < nowMs || ms > fourH)) return false;
    }
    if (quickFilter === "delayed"){
      const s = status.toLowerCase();
      if (!s.includes("delay")) return false;
    }
    if (quickFilter === "gate"){
      const s = status.toLowerCase();
      if (!s.includes("gate")) return false;
    }
    return true;
  });

  // Group by London date
  const groups = new Map();
  const todayKey = LONDON_DATE_KEY_FMT.format(new Date());
  const tomorrowKey = LONDON_DATE_KEY_FMT.format(new Date(Date.now() + 24*60*60*1000));

  const dayKeyOf = (f) => {
    const t = f?.departure?.scheduledTime || f?.arrival?.scheduledTime;
    const d = toDate(t);
    if (!d) return "unknown";
    return LONDON_DATE_KEY_FMT.format(d);
  };

  filtered.forEach(f => {
    const k = dayKeyOf(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  });

  const labelForKey = (k) => {
    if (k === todayKey) return "Today";
    if (k === tomorrowKey) return "Tomorrow";
    if (k === "unknown") return "Other";
    try {
      const d = new Date(`${k}T12:00:00Z`);
      return d.toLocaleDateString("en-GB", { weekday:"long", day:"2-digit", month:"short" });
    } catch { return k; }
  };

  const orderedKeys = Array.from(groups.keys()).sort((a,b)=>String(a).localeCompare(String(b)));
  let html = "";
  let idx = 0;
  orderedKeys.forEach(k => {
    html += `<div class="day-sep">${escapeHtml(labelForKey(k))}</div>`;
    for (const f of groups.get(k)) html += flightCardHtml(f, mode, idx++);
  });

  listEl.innerHTML = html;
  emptyEl.style.display = filtered.length ? "none" : "";

  // Events
  listEl.querySelectorAll("[data-open]").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target && e.target.closest && e.target.closest("[data-save]")) return;
      const i = Number(card.getAttribute("data-idx"));
      const flight = filtered[i];
      if (!flight) return;
      const apiMode = (mode === "departures") ? "departure" : (mode === "arrivals") ? "arrival" : mode;
      openFlightDetailsWithStorage(flight, { mode: apiMode, airport: airportIata, day:1, airportPos: window.__brsAirportPos });
});
  });
  listEl.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const i = Number(btn.getAttribute("data-idx"));
      const flight = filtered[i];
      if (!flight) return;
      const apiMode = (mode === "departures") ? "departure" : (mode === "arrivals") ? "arrival" : mode;
      saveFlight(flight, { mode: apiMode, airport: airportIata, day:1, airportPos: window.__brsAirportPos });
btn.classList.toggle("saved");
      btn.textContent = btn.classList.contains("saved") ? "★" : "☆";
      toast(btn.classList.contains("saved") ? "Saved" : "Removed");
    });
  });

  const meta = document.getElementById("searchMeta");
  if (meta){
    const total = flights.length;
    meta.textContent = (qn || quickFilter !== "all") ? `${filtered.length} of ${total} flights` : "";
  }
}

// =======================
// Tabs + filters + search
// =======================
function setTab(name){
  currentTab = name;
  document.querySelectorAll(".seg-btn").forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.getElementById("tab-departures")?.classList.toggle("active", name === "departures");
  document.getElementById("tab-arrivals")?.classList.toggle("active", name === "arrivals");
  renderList(name);
}
function setQuickFilter(name){
  quickFilter = name;
  document.querySelectorAll(".chip-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === name));
  renderList(currentTab);
}
function initSearch(){
  const input = document.getElementById("searchInput");
  const clear = document.getElementById("clearSearchBtn");
  if (!input) return;
  input.addEventListener("input", () => { searchQuery = input.value || ""; renderList(currentTab); });
  clear?.addEventListener("click", () => { input.value=""; searchQuery=""; renderList(currentTab); input.focus(); });
}
function initOverflowMenu(){
  const btn = document.getElementById("overflowBtn");
  const menu = document.getElementById("overflowMenu");
  if (!btn || !menu) return;
  function close(){ menu.classList.remove("open"); btn.setAttribute("aria-expanded","false"); }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", close);
  window.addEventListener("resize", close);
}

// =======================
// Error banner
// =======================
function ensureErrorBanner(){
  let el = document.getElementById("errorBanner");
  if (!el){
    el = document.createElement("div");
    el.id="errorBanner";
    el.className="banner";
    el.hidden=true;
    el.innerHTML = `<div class="banner__msg" id="errorBannerMsg"></div>
                    <button class="banner__btn" id="errorBannerRetry" type="button">Retry</button>`;
    document.body.insertBefore(el, document.body.firstChild);
  }
  el.querySelector("#errorBannerRetry")?.addEventListener("click", () => refreshAll({force:true}));
  return el;
}
function showError(message, {retry=true}={}){
  const el = ensureErrorBanner();
  const msg = el.querySelector("#errorBannerMsg");
  const btn = el.querySelector("#errorBannerRetry");
  if (msg) msg.textContent = message || "Something went wrong.";
  if (btn) btn.style.display = retry ? "" : "none";
  el.hidden = false;
}
function hideError(){
  const el = document.getElementById("errorBanner");
  if (el) el.hidden = true;
}

// =======================
// Cache + fetching
// =======================
const CACHE_TTL_MS = 90 * 1000;
function cacheKey(type){ return `brs_timetable_${type}`; }
function cacheMetaKey(type){ return `brs_timetable_${type}_meta`; }

function hashFlights(list){
  const reduced = (list || []).map(f => ({
    iata: f?.flight?.iataNumber || "",
    airline: f?.airline?.iataCode || "",
    dep: f?.departure?.iataCode || "",
    arr: f?.arrival?.iataCode || "",
    sched: f?.departure?.scheduledTime || f?.arrival?.scheduledTime || ""
  }));
  const s = JSON.stringify(reduced);
  let h = 5381;
  for (let i=0;i<s.length;i++) h = ((h<<5)+h) + s.charCodeAt(i);
  return String(h|0);
}
function loadCachedTimetable(type){
  try{
    const meta = JSON.parse(sessionStorage.getItem(cacheMetaKey(type)) || "null");
    const data = JSON.parse(sessionStorage.getItem(cacheKey(type)) || "null");
    if (!meta || !Array.isArray(data)) return null;
    const age = Date.now() - (meta.ts || 0);
    return { data, ts: meta.ts||0, age, fresh: age < CACHE_TTL_MS, hash: meta.hash||"" };
  } catch { return null; }
}
function saveCachedTimetable(type, list){
  try{
    const hash = hashFlights(list);
    sessionStorage.setItem(cacheKey(type), JSON.stringify(list||[]));
    sessionStorage.setItem(cacheMetaKey(type), JSON.stringify({ ts: Date.now(), hash }));
    return hash;
  } catch { return ""; }
}

async function fetchTimetable(type, dateISO){
  const url = new URL("https://flightapp-workers.chiffers.com/api/timetable");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("iataCode", airportIata);
  url.searchParams.set("type", type);
  if (dateISO) url.searchParams.set("date", dateISO);

  const r = await fetch(url.toString(), { cache:"no-store" });
  if (!r.ok) throw new Error(`Timetable HTTP ${r.status}`);
  const j = await r.json();
  return (Array.isArray(j) && j) || (j && Array.isArray(j.data) && j.data) || (j && Array.isArray(j.result) && j.result) || [];
}

async function refreshAll({force=false} = {}){
  const lr = document.getElementById("lastRefreshed");
  const cachedDep = !force ? loadCachedTimetable("departure") : null;
  const cachedArr = !force ? loadCachedTimetable("arrival") : null;

  let renderedFromCache = false;
  if (cachedDep?.data && cachedArr?.data){
    depFlights = filterFlightsByTime(cachedDep.data);
    arrFlights = filterFlightsByTime(cachedArr.data);
    renderList(currentTab);
    renderedFromCache = true;
    if (lr) lr.textContent = `Updated ${new Date(cachedDep.ts).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})} (cached)`;
  }

  if (!navigator.onLine){
    if (!renderedFromCache) showError("You appear to be offline. Connect to the internet to load flights.", {retry:false});
    return;
  }

  try{
    hideError();
    const [dep, arr] = await Promise.all([fetchTimetable("departure"), fetchTimetable("arrival")]);
    const depList = Array.isArray(dep) ? dep : [];
    const arrList = Array.isArray(arr) ? arr : [];

    // Warm the airport geo cache for accurate pins on the details map.
    prefetchAirportsFromFlights(depList, arrList).catch(()=>{});

    const newDepHash = saveCachedTimetable("departure", depList);
    const newArrHash = saveCachedTimetable("arrival", arrList);

    const changed =
      !renderedFromCache ||
      (cachedDep && cachedDep.hash !== newDepHash) ||
      (cachedArr && cachedArr.hash !== newArrHash);

    if (changed){
      depFlights = filterFlightsByTime(depList);
      arrFlights = filterFlightsByTime(arrList);
      renderList(currentTab);
    }

    if (lr) lr.textContent = `Updated ${new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}`;
  } catch (err){
    console.error(err);
    showError("Couldn’t refresh flight data. Check your connection / API key, then retry.", {retry:true});
    if (!renderedFromCache) toast("Couldn’t load flight data");
  }
}

// =======================
// Install prompt (optional, no console warning)
// =======================
function initInstall(){
  const btn = document.getElementById("installBtn");
  if (!btn) return;

  // We intentionally do NOT call preventDefault() to avoid Chrome's console warning.
  // This means the browser controls when/if the native install prompt is shown.
  btn.style.display = "none";
}

// =======================
// Security wait samples (local-only)
// =======================
function getSecuritySamples(){
  const raw = safeGetLocal("brs_security_samples");
  if (!raw) return [];
  try { const x = JSON.parse(raw); return Array.isArray(x) ? x : []; } catch { return []; }
}
function addSecuritySample(minutes){
  const list = getSecuritySamples();
  list.unshift({ minutes: Number(minutes), when: new Date().toISOString() });
  safeSetLocal("brs_security_samples", JSON.stringify(list.slice(0, 60)));
}
function computeSecurityEstimate(){
  const list = getSecuritySamples();
  if (!list.length) return null;
  const cutoff = Date.now() - 14*24*60*60*1000;
  const recent = list.filter(s => Date.parse(s.when) >= cutoff);
  const use = recent.length >= 3 ? recent : list;
  const avg = use.reduce((a,b)=>a+b.minutes,0)/use.length;
  return Math.round(avg);
}
function renderSecurityPanel(forceOpen){
  const panel = document.getElementById("securityPanel");
  if (!panel) return;
  const est = computeSecurityEstimate();
  const last = getSecuritySamples()[0];

  panel.innerHTML = `
    <div class="panel-head">
      <div class="panel-title">Security wait (local samples)</div>
      <button class="icon-btn" id="secCloseBtn" aria-label="Close security">×</button>
    </div>
    <div style="height:10px"></div>
    <div style="display:grid; gap:10px;">
      <div style="padding:12px; border-radius:16px; border:1px solid var(--stroke); background: var(--surface2);">
        <div class="small">Typical</div>
        <div style="font-family: var(--mono); font-weight: 950; font-size: 22px; margin-top: 4px;">
          ${est !== null ? `${est} min` : "—"}
        </div>
        <div class="small" style="margin-top:4px;">
          ${last ? `Last report: ${new Date(last.when).toLocaleString()} (${last.minutes} min)` : "No reports yet — be the first."}
        </div>
      </div>

      <div style="padding:12px; border-radius:16px; border:1px solid var(--stroke); background: var(--surface2);">
        <div class="small">Report your wait</div>
        <div style="display:flex; gap:10px; margin-top:8px;">
          <input id="secMinutes" type="number" min="0" max="120" placeholder="Minutes"
            style="flex:1; border-radius:14px; border:1px solid var(--stroke); background: transparent; color: var(--text); padding: 12px; font-size: 15px;" />
          <button class="icon-btn" id="secSubmitBtn" type="button" aria-label="Submit wait">✓</button>
        </div>
        <div class="small" style="margin-top:6px;">Stored on your device only. No account.</div>
      </div>
    </div>
  `.trim();

  panel.style.display = forceOpen ? "" : panel.style.display;

  panel.querySelector("#secCloseBtn")?.addEventListener("click", () => panel.style.display = "none");
  panel.querySelector("#secSubmitBtn")?.addEventListener("click", () => {
    const v = Number(panel.querySelector("#secMinutes")?.value);
    if (Number.isFinite(v) && v >= 0 && v <= 120){
      addSecuritySample(v);
      toast("Thanks — updated");
      renderSecurityPanel(true);
    }
  });
}
function initSecurityUI(){
  document.getElementById("securityBtn")?.addEventListener("click", () => renderSecurityPanel(true));
}

// =======================
// Init
// =======================
(function init(){
  initOverflowMenu();
  initSearch();
  initSavedUI();
  initInstall();
  initSecurityUI();

  window.addEventListener("offline", () => showError("You appear to be offline. Showing cached results if available.", {retry:false}));
  window.addEventListener("online", () => { hideError(); refreshAll(); });

  document.getElementById("refreshBtn")?.addEventListener("click", () => refreshAll({force:true}));
  document.querySelectorAll(".seg-btn").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  document.querySelectorAll(".chip-btn").forEach(b => b.addEventListener("click", () => setQuickFilter(b.dataset.filter)));

  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains("flight-card")){
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); active.click(); }
    }
  });

  refreshAll();
})();
