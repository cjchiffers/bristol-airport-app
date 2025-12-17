// Bristol Airport — redesigned mobile UI (uses existing data sources)
// Keeps your existing flight-details flow + saved flights + security samples.

// Stores current airport coordinates from the last schedule response (FlightAPI schedule wrapper)
window.__brsAirportPos = window.__brsAirportPos || null;
function extractAirportPosFromScheduleResponse(data){
  try{
    const pos = data?.airport?.pluginData?.details?.position;
    if (pos && typeof pos.latitude === "number" && typeof pos.longitude === "number") {
      return { lat: pos.latitude, lng: pos.longitude };
    }
  } catch {}
  return null;
}

// Mapping of airport codes to city names (fallback to code)
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

function getCityName(code){ return airportCodeToCityName[code] || code || "—"; }

function safeSetSession(key, value){ try { sessionStorage.setItem(key, value); return true; } catch { return false; } }
function safeGetLocal(key){ try { return localStorage.getItem(key);} catch { return null; } }
function safeSetLocal(key, value){ try { localStorage.setItem(key,value); return true;} catch { return false; } }
function escapeHtml(s){ return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

function openFlightDetailsWithStorage(flight, context) {
  const key = `flight_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  safeSetSession(key, JSON.stringify({ flight, context }));
  window.location.href = `flight-details.html?key=${encodeURIComponent(key)}`;
}

// ---- time helpers ----
function convertToLondonTime(utcTime) {
  const options = { timeZone: "Europe/London", hour12: false, hour: "2-digit", minute: "2-digit" };
  return utcTime ? new Date(utcTime).toLocaleString('en-GB', options) : "—";
}
function getCurrentTimeMinusOneHour() {
  const now = new Date();
  now.setHours(now.getHours() - 1);
  return now.getTime();
}
function filterFlightsByTime(flights) {
  const currentTimeMinusOneHour = getCurrentTimeMinusOneHour();
  return (flights || []).filter(f => {
    const t = new Date(f?.departure?.scheduledTime || f?.arrival?.scheduledTime);
    return Number.isFinite(t.getTime()) && t.getTime() >= currentTimeMinusOneHour;
  });
}
function scheduledMs(f){ return new Date(f?.departure?.scheduledTime || f?.arrival?.scheduledTime).getTime(); }

// ---- airline logo ----
function getAirlineLogoUrl(iataCode){
  if (!iataCode) return null;
  return `https://www.gstatic.com/flights/airline_logos/70px/${iataCode}.png`;
}

// ---- status ----
function getFlightStatusString(flightSegment) {
  if (!flightSegment) return "—";
  if (flightSegment.cancelled) return "Cancelled";
  if (flightSegment.boarding) return "Boarding";
  if (flightSegment.gate) return `Gate ${flightSegment.gate}`;
  if (flightSegment.delay) return `Delayed ${flightSegment.delay} min`;
  if (flightSegment.scheduledTime && new Date(flightSegment.scheduledTime) > new Date()) return "On time";
  return "Active";
}
function statusTone(statusText){
  const s = String(statusText || "").toLowerCase();
  if (s.includes("cancel")) return "bad";
  if (s.includes("delayed") || s.includes("delay")) return "warn";
  if (s.includes("boarding") || s.includes("gate")) return "good";
  if (s.includes("on time")) return "good";
  return "neutral";
}

// ---- UI state ----
let depFlights = [];
let arrFlights = [];
let currentTab = "departures";
let quickFilter = "all";
let searchQuery = "";

// ---- toast ----
let toastT = null;
function toast(msg){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 1800);
}

// ---- render ----
function renderList(mode){
  const isDep = mode === "departures";
  const listEl = document.getElementById(isDep ? "departureList" : "arrivalList");
  const emptyEl = document.getElementById(isDep ? "depEmpty" : "arrEmpty");
  if (!listEl) return;

  const flights = (isDep ? depFlights : arrFlights).slice().sort((a,b)=>scheduledMs(a)-scheduledMs(b));
  const qn = (searchQuery || "").trim().toLowerCase();
  const now = Date.now();
  const fourH = now + 4*60*60*1000;

  const filtered = flights.filter(f => {
    const seg = isDep ? f?.departure : f?.arrival;
    const status = getFlightStatusString(seg);
    const textBlob = `${f?.flight?.iataNumber || f?.flight_iata || f?.flightNumber || ""} ${f?.airline?.name || ""} ${f?.airline?.iataCode || ""} ${getCityName(isDep ? f?.arrival?.iataCode : f?.departure?.iataCode)} ${status}`.toLowerCase();

    if (qn && !textBlob.includes(qn)) return false;

    if (quickFilter === "next"){
      const ms = scheduledMs(f);
      if (!Number.isFinite(ms) || ms < now || ms > fourH) return false;
    }
    if (quickFilter === "delayed"){
      const s = status.toLowerCase();
      if (!(s.includes("delayed") || s.includes("delay"))) return false;
    }
    if (quickFilter === "gate"){
      const s = status.toLowerCase();
      if (!s.includes("gate")) return false;
    }
    return true;
  });

  listEl.innerHTML = filtered.map((f,i) => flightCardHtml(f, mode, i)).join("");
  emptyEl.style.display = filtered.length ? "none" : "";

  // Wire up events
  listEl.querySelectorAll("[data-open]").forEach(card => {
    card.addEventListener("click", (e) => {
      // if save button was pressed, ignore
      if (e.target && (e.target.closest && e.target.closest("[data-save]"))) return;
      const idx = Number(card.getAttribute("data-idx"));
      const flight = filtered[idx];
      if (!flight) return;
      openFlightDetailsWithStorage(flight, { mode, airport:"BRS", day:1, airportPos: window.__brsAirportPos });
    });
  });

  listEl.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(btn.getAttribute("data-idx"));
      const flight = filtered[idx];
      if (!flight) return;
      saveFlight(flight, { mode, airport:"BRS", day:1, airportPos: window.__brsAirportPos });
      btn.classList.add("saved");
      btn.textContent = "★";
      toast("Saved");
    });
  });

  // meta
  const meta = document.getElementById("searchMeta");
  if (meta){
    const total = flights.length;
    meta.textContent = (qn || quickFilter !== "all") ? `${filtered.length} of ${total} flights` : "";
  }
}

function flightCardHtml(flight, mode, idx){
  const isDep = mode === "departures";
  const flightNo = (flight.flight && flight.flight.iataNumber) ? flight.flight.iataNumber : (flight.flight_iata || flight.flightNumber || "—");
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
    <article class="flight-card" data-open="1" data-idx="${idx}" role="button" tabindex="0" aria-label="${escapeHtml(flightNo)} ${escapeHtml(route)} ${escapeHtml(time)} ${escapeHtml(statusText)}">
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

// ---- Tabs ----
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

// ---- Quick filters ----
function setQuickFilter(name){
  quickFilter = name;
  document.querySelectorAll(".chip-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === name));
  renderList(currentTab);
}

// ---- Menu / panels ----
function initOverflowMenu(){
  const btn = document.getElementById("overflowBtn");
  const menu = document.getElementById("overflowMenu");
  if (!btn || !menu) return;

  function close(){
    menu.classList.remove("open");
    btn.setAttribute("aria-expanded","false");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("click", close);
  window.addEventListener("resize", close);
}

// ---- Search ----
function initSearch(){
  const input = document.getElementById("searchInput");
  const clear = document.getElementById("clearSearchBtn");
  if (!input) return;

  input.addEventListener("input", () => {
    searchQuery = input.value || "";
    renderList(currentTab);
    });

  if (clear){
    clear.addEventListener("click", () => {
      input.value = "";
      searchQuery = "";
      renderList(currentTab);
          input.focus();
    });
  }
}

// =======================
// Saved flights (localStorage)
// =======================
function getSavedFlights(){
  const raw = safeGetLocal("brs_saved_flights");
  if (!raw) return [];
  try { const x = JSON.parse(raw); return Array.isArray(x) ? x : []; } catch { return []; }
}
function setSavedFlights(list){ safeSetLocal("brs_saved_flights", JSON.stringify(list.slice(0, 30))); }

function flightIdentity(f){
  const flightNo = (f?.flight?.iataNumber) ? f.flight.iataNumber : (f?.flight_iata || f?.flightNumber || "");
  const dep = f?.departure?.iataCode || f?.departure?.iata || "";
  const arr = f?.arrival?.iataCode || f?.arrival?.iata || "";
  const t = f?.departure?.scheduledTime || f?.arrival?.scheduledTime || "";
  return `${flightNo}|${dep}|${arr}|${t}`;
}

function isFlightSaved(flight){
  const id = flightIdentity(flight);
  return getSavedFlights().some(x => x?.identity === id);
}

function saveFlight(flight, context){
  const tripLabel = prompt('Trip label (optional) — e.g. “Client meeting” or “Family holiday”') || '';
  const id = flightIdentity(flight);
  const flightNo = (flight?.flight?.iataNumber) ? flight.flight.iataNumber : (flight?.flight_iata || flight?.flightNumber || "—");
  const dep = flight?.departure?.iataCode || flight?.departure?.iata || "—";
  const arr = flight?.arrival?.iataCode || flight?.arrival?.iata || "—";
  const label = `${flightNo} • ${dep}→${arr}` + (tripLabel.trim() ? ` • ${tripLabel.trim()}` : '');
  const key = `saved_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const list = getSavedFlights();
  const next = [{ id:key, identity: id, label, tripLabel: tripLabel.trim(), context, flight }, ...list.filter(x => x.identity !== id)];
  setSavedFlights(next);
  renderSavedDrawer(true);
}

function removeSaved(id){
  setSavedFlights(getSavedFlights().filter(x => x.id !== id));
  renderSavedDrawer(true);
}

function renderSavedDrawer(forceOpen){
  const drawer = document.getElementById("savedDrawer");
  const bar = document.getElementById("savedBar");
  if (!drawer || !bar) return;

  const list = getSavedFlights();
  bar.innerHTML = list.map(item => `
    <div class="chip" data-id="${escapeHtml(item.id)}">
      <span>${escapeHtml(item.label)}</span>
      <span class="x" title="Remove" aria-label="Remove">×</span>
    </div>
  `).join("");

  bar.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", (e) => {
      const id = ch.getAttribute("data-id");
      if (e.target && e.target.classList && e.target.classList.contains("x")) return removeSaved(id);
      const item = getSavedFlights().find(x => x.id === id);
      if (item) openFlightDetailsWithStorage(item.flight, item.context || {mode:"departures", airport:"BRS", day:1, airportPos: window.__brsAirportPos});
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

// =======================
// Install prompt
// =======================
function initInstall(){
  const btn = document.getElementById("installBtn");
  if (!btn) return;
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.style.display = "";
  });
  btn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch {}
    deferredPrompt = null;
    btn.style.display = "none";
  });
}

// =======================
// Security wait time (local samples)
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
          <input id="secMinutes" type="number" min="0" max="120" placeholder="Minutes" style="flex:1; border-radius:14px; border:1px solid var(--stroke); background: transparent; color: var(--text); padding: 12px; font-size: 15px;" />
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
// Data fetching
// =======================
async function fetchTimetable(type){
  const url = `https://aviation-edge.com/v2/public/timetable?key=26071f-14ef94&iataCode=BRS&type=${type}`;
  const r = await fetch(url, { cache: "no-store" });
  return await r.json();
}

async function refreshAll(){
  try{
    const [dep, arr] = await Promise.all([fetchTimetable("departure"), fetchTimetable("arrival")]);
    depFlights = Array.isArray(dep) ? filterFlightsByTime(dep) : [];
    arrFlights = Array.isArray(arr) ? filterFlightsByTime(arr) : [];

    renderList(currentTab);
  
    const lr = document.getElementById("lastRefreshed");
    if (lr) lr.textContent = `Updated ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  }catch(err){
    console.error(err);
    toast("Couldn’t refresh — check connection");
  }
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

  document.getElementById("refreshBtn")?.addEventListener("click", refreshAll);

  document.querySelectorAll(".seg-btn").forEach(b => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
  });

  document.querySelectorAll(".chip-btn").forEach(b => {
    b.addEventListener("click", () => setQuickFilter(b.dataset.filter));
  });

  // Keyboard / accessibility: open focused card with Enter/Space
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (!active) return;
    if (active.classList && active.classList.contains("flight-card")){
      if (e.key === "Enter" || e.key === " "){
        e.preventDefault();
        active.click();
      }
    }
  });

  refreshAll();
})();
