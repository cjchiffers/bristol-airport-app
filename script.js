// Bristol Airport — flights list page.
// - Timetable comes from the Cloudflare worker (AeroDataBox): departures / arrivals
// - Saved (starred) flights stored in localStorage
"use strict";

const T = window.BrsTime;
const F = window.BrsFlights;

// =======================
// Configuration
// =======================
// Airport IATA code (Bristol Airport = BRS)
const airportIata = window.BrsConfig.AIRPORT;

// =======================
// Small utilities
// =======================
const { escapeHtml, safeGetLocal, safeSetLocal } = window.BrsUtils;

// =======================
// Airport name lookup (offline-first)
// =======================
// Airport index file is shipped with the app shell and cached by the service worker.
// Shape: { "BRS": { iata, name, city, country, lat, lon }, ... }
// Airport lookups are shared across pages (see shared/airports.js)
async function loadAirportIndexBestEffort(){
  return window.BrsAirports ? window.BrsAirports.loadAirportIndexBestEffort() : null;
}
function normIata(code){ return String(code || "").trim().toUpperCase(); }
function getAirportDisplayName(iata, prefer){
  if(window.BrsAirports) return window.BrsAirports.getAirportDisplayName(iata, prefer);
  const code = normIata(iata);
  return code || "—";
}
function getCityName(code){
  return getAirportDisplayName(code, "city");
}

// =======================
// Time helpers (London) — see shared/time.js
// =======================
// Hide flights that are well past: departures after 30 min, arrivals after 60 min
// (people collecting may still be waiting). Uses the best-known time at Bristol.
function filterFlightsByTime(flights, mode){
  const grace = (F.isDep(mode) ? 30 : 60) * 60 * 1000;
  const cutoff = Date.now() - grace;
  return (flights || []).filter(f => {
    const d = F.keyTime(f, mode);
    // If time missing, keep (don’t hide everything)
    return !d || d.getTime() >= cutoff;
  });
}

// =======================
// Airline logo + status
// =======================
function getAirlineLogoUrl(iataCode){
  if (!iataCode) return null;
  return `https://www.gstatic.com/flights/airline_logos/70px/${iataCode}.png`;
}

function renderLoadingList(mode){
  const isDep = mode === "departures";
  const listEl = document.getElementById(isDep ? "departureList" : "arrivalList");
  const emptyEl = document.getElementById(isDep ? "depEmpty" : "arrEmpty");
  if (!listEl || !emptyEl) return;

  emptyEl.style.display = "none";
  listEl.innerHTML = Array.from({ length: 5 }, () => `
    <article class="flight-card skeleton" aria-hidden="true">
      <div class="fc-top">
        <div class="skeleton-line short" style="width:92px"></div>
        <div class="skeleton-line short" style="width:56px"></div>
      </div>
      <div class="skeleton-line" style="width:70%"></div>
      <div class="fc-bottom">
        <div class="airline">
          <div class="skeleton-circle"></div>
          <div class="skeleton-line short" style="width:130px"></div>
        </div>
        <div class="skeleton-line short" style="width:78px"></div>
      </div>
    </article>
  `).join("");
}

// =======================
// UI state
// =======================
let depFlights = [];
let arrFlights = [];
let currentTab = "departures";
let quickFilter = "all";
let searchQuery = "";
let hasLoadedOnce = false;   // true once we have any timetable data (cache or network)

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
  let list;
  try { const x = JSON.parse(raw); list = Array.isArray(x) ? x : []; } catch { return []; }

  // Earlier versions stored an empty identity for every saved flight (so any star looked "saved").
  // Rebuild it from the stored flight.
  let fixed = false;
  for (const item of list){
    if (item && item.flight && !item.id?.flightNo){ item.id = deriveIdentity(item.flight); fixed = true; }
  }
  if (fixed) setSavedFlights(list.filter(it => it && it.flight && it.id?.flightNo));
  return list.filter(it => it && it.flight && it.id?.flightNo);
}
function setSavedFlights(list){
  safeSetLocal(STAR_KEY, JSON.stringify(Array.isArray(list) ? list : []));
}

function deriveIdentity(f){
  return {
    flightNo: F.flightNo(f),
    dep: f?.departure?.iataCode || "",
    arr: f?.arrival?.iataCode || "",
    schedDep: f?.departure?.scheduledTime || "",
    schedArr: f?.arrival?.scheduledTime || "",
  };
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
    cur.unshift({
      id,
      updatedAt: Date.now(),
      context: context || null,
      airline: flight?.airline?.name || "",
      flight
    });
    if (cur.length > 200) cur.length = 200;
  }
  setSavedFlights(cur);
  renderMyFlights();
}

// ---- "My flights": saved flights shown as live cards at the top of the list ----
const SAVED_MAX_AGE_MS = 12 * 60 * 60 * 1000;   // drop a saved flight 12 h after its time at Bristol

function savedMode(item){ return F.normMode(item?.context?.mode || item?.flight?.type); }

/** Saved flights with expired ones removed (persisted). */
function activeSavedFlights(){
  const all = getSavedFlights();
  const cutoff = Date.now() - SAVED_MAX_AGE_MS;
  const keep = all.filter(item => {
    if (!item || !item.flight) return false;
    const d = F.keyTime(item.flight, savedMode(item));
    return !d || d.getTime() >= cutoff;
  });
  if (keep.length !== all.length) setSavedFlights(keep);
  return keep;
}

/** The current timetable record for a saved flight (matched by number + scheduled time), or null. */
function findLiveFor(item){
  const mode = savedMode(item);
  const list = F.isDep(mode) ? depFlights : arrFlights;
  const sched = F.seg(item.flight, mode).scheduledTime;
  const no = F.flightNo(item.flight);
  return list.find(f =>
    F.seg(f, mode).scheduledTime === sched &&
    (F.sameFlightNo(F.flightNo(f), no) || (f.codeshares || []).some(n => F.sameFlightNo(n, no)))
  ) || null;
}

/** After a refresh, keep the stored copy of each saved flight current (it is what shows offline). */
function syncSavedFromLive(){
  const list = activeSavedFlights();
  let changed = false;
  for (const item of list){
    const live = findLiveFor(item);
    if (live && JSON.stringify(live) !== JSON.stringify(item.flight)){ item.flight = live; item.updatedAt = Date.now(); changed = true; }
  }
  if (changed) setSavedFlights(list);
}

function renderMyFlights(){
  const section = document.getElementById("myFlights");
  const listEl = document.getElementById("myFlightsList");
  if (!section || !listEl) return;

  const items = activeSavedFlights()
    .map(item => ({ item, mode: savedMode(item), live: findLiveFor(item) }))
    .sort((a, b) => (F.keyTime(a.live || a.item.flight, a.mode)?.getTime() || 0) - (F.keyTime(b.live || b.item.flight, b.mode)?.getTime() || 0));

  section.hidden = items.length === 0;
  listEl.innerHTML = items.map((x, i) => flightCardHtml(
    x.live || x.item.flight,
    x.mode + "s",
    i,
    { share: true, note: (!x.live && hasLoadedOnce) ? "Not in the current timetable" : "" }
  )).join("");

  wireCards(listEl, (i) => items[i] && (items[i].live || items[i].item.flight), (card) => items[Number(card.getAttribute("data-idx"))].mode);
  listEl.querySelectorAll("[data-share]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const x = items[Number(btn.getAttribute("data-idx"))];
      if (x) F.shareFlight(x.live || x.item.flight, x.mode, toast);
    });
  });
  listEl.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const x = items[Number(btn.getAttribute("data-idx"))];
      if (!x) return;
      saveFlight(x.live || x.item.flight, x.item.context || { mode: x.mode, airport: airportIata });  // already saved -> removes it
      renderLists();
      toast("Removed");
    });
  });
}

function initSavedUI(){
  renderMyFlights();
}

/**
 * Whole-card click opens the flight. The flight is cached first so the details page paints instantly;
 * the <a> inside the card keeps keyboard, middle-click and "copy link" working.
 */
function wireCards(root, flightAt, modeAt){
  root.querySelectorAll("[data-open]").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-save],[data-share]")) return;
      const flight = flightAt(Number(card.getAttribute("data-idx")));
      if (!flight) return;
      const mode = modeAt(card);
      const viaLink = !!e.target.closest("a");
      if (viaLink && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return;   // new tab/window: plain link
      e.preventDefault();
      openFlightDetails(flight, mode);
    });
  });
}

/** Open the details page. The flight is cached locally and the URL carries type/flight/date, so it can be shared and reloaded. */
function openFlightDetails(flight, mode){
  window.location.href = F.prepareDetails(flight, mode);
}

/** Render a flight card for the list (departures/arrivals tabs). */
function flightCardHtml(flight, mode, idx, opts = {}){
  const isDep = mode === "departures";
  const flightNo = F.flightNo(flight) || "—";
  const city = getCityName(F.otherSeg(flight, mode).iataCode);
  const airlineName = flight?.airline?.name || flight?.airline?.iataCode || "—";
  const logo = getAirlineLogoUrl(flight?.airline?.iataCode || "");
  const route = isDep ? `Bristol → ${city}` : `${city} → Bristol`;
  const saved = isFlightSaved(flight);

  // Show the live time big, with the scheduled time struck through when it has moved.
  const s = F.seg(flight, mode);
  const sched = T.fmtTime(s.scheduledTime);
  const live = T.fmtTime(s.actualTime || s.estimatedTime);
  const moved = !!(live && sched && live !== sched);
  const delay = F.delayMin(flight, mode);
  const timeCls = moved ? (delay != null && delay < 0 ? " is-early" : " is-late") : "";
  const main = moved ? live : (sched || live || "—");

  const info = F.statusInfo(flight, mode);

  return `
    <article class="flight-card" data-open="1" data-idx="${idx}">
      <a class="fc-link" href="${escapeHtml(F.detailsUrl(flight, mode))}">
        <div class="fc-top">
          <div class="flight-no">${escapeHtml(flightNo)}</div>
          <div class="time-wrap">
            <span class="time${timeCls}">${escapeHtml(main)}</span>${moved ? `<span class="time-old"><span class="sr-only">scheduled </span>${escapeHtml(sched)}</span>` : ""}
          </div>
        </div>
        <div class="route">${escapeHtml(route)}</div>
      </a>
      ${opts.note ? `<div class="fc-note">${escapeHtml(opts.note)}</div>` : ""}
      <div class="fc-bottom">
        <div class="airline">
          ${logo ? `<img class="airline-logo" src="${logo}" alt="" onerror="this.style.display='none';" />` : ``}
          <div class="airline-name">${escapeHtml(airlineName)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="status ${info.tone}">${escapeHtml(info.text)}</span>
          ${opts.share ? `<button class="share-btn" data-share="1" data-idx="${idx}" aria-label="Share ${escapeHtml(flightNo)}">↗</button>` : ""}
          <button class="save-btn ${saved ? "saved" : ""}" data-save="1" data-idx="${idx}" aria-pressed="${saved ? "true" : "false"}" aria-label="${saved ? "Remove" : "Save"} ${escapeHtml(flightNo)}${saved ? " from saved flights" : ""}">${saved ? "★" : "☆"}</button>
        </div>
      </div>
    </article>
  `.trim();
}

const listCounts = { departures: { shown: 0, total: 0 }, arrivals: { shown: 0, total: 0 } };
const desktopMQ = window.matchMedia("(min-width: 1024px)");

/** Render both lists: on wide screens they sit side by side; on phones one is hidden behind the tab. */
function renderLists(){
  renderList("departures");
  renderList("arrivals");
}

function updateMeta(){
  const meta = document.getElementById("searchMeta");
  if (!meta) return;
  const filtering = !!(searchQuery || "").trim() || quickFilter !== "all";
  if (!filtering) { meta.textContent = ""; return; }
  const c = listCounts;
  meta.textContent = desktopMQ.matches
    ? `Departures ${c.departures.shown} of ${c.departures.total} · Arrivals ${c.arrivals.shown} of ${c.arrivals.total}`
    : `${c[currentTab].shown} of ${c[currentTab].total} flights`;
}
desktopMQ.addEventListener?.("change", updateMeta);

function renderList(mode){
  const isDep = mode === "departures";
  const listEl = document.getElementById(isDep ? "departureList" : "arrivalList");
  const emptyEl = document.getElementById(isDep ? "depEmpty" : "arrEmpty");
  if (!listEl || !emptyEl) return;

  // Until we have data (cache or network), leave the loading skeleton / error banner alone.
  if (!hasLoadedOnce) return;

  // Sort / filter / group by the time that matters at Bristol (arrivals: landing time, not take-off).
  const keyMs = (f) => { const d = F.keyTime(f, mode); return d ? d.getTime() : 0; };
  const visible = filterFlightsByTime(isDep ? depFlights : arrFlights, mode)
    .slice()
    .sort((a,b)=>keyMs(a)-keyMs(b));
  const qn = (searchQuery || "").trim().toLowerCase();
  const nowMs = Date.now();
  const fourH = nowMs + 4*60*60*1000;

  const filtered = visible.filter(f => {
    const other = F.otherSeg(f, mode).iataCode || "";
    const info = F.statusInfo(f, mode);
    const textBlob = `${F.flightNo(f)} ${(f.codeshares || []).join(" ")} ${f?.airline?.name || ""} ${f?.airline?.iataCode || ""} ${other} ${getCityName(other)} ${info.text}`.toLowerCase();
    if (qn && !textBlob.includes(qn)) return false;

    if (quickFilter === "next"){
      const ms = keyMs(f);
      if (ms && (ms < nowMs || ms > fourH)) return false;
    }
    if (quickFilter === "delayed"){
      if (info.key !== "delayed") return false;
    }
    if (quickFilter === "cancelled"){
      if (info.key !== "cancelled" && info.key !== "diverted") return false;
    }
    return true;
  });

  // Group by London date
  const groups = new Map();
  const todayKey = T.londonDateKey(new Date());
  const tomorrowKey = T.londonDateKey(new Date(Date.now() + 24*60*60*1000));

  filtered.forEach(f => {
    const k = T.londonDateKey(F.keyTime(f, mode)) || "unknown";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  });

  const labelForKey = (k) => {
    if (k === todayKey) return "Today";
    if (k === tomorrowKey) return "Tomorrow";
    if (k === "unknown") return "Other";
    try {
      const d = new Date(`${k}T12:00:00Z`);
      return d.toLocaleDateString("en-GB", { weekday:"long", day:"2-digit", month:"short", timeZone:"UTC" });
    } catch { return k; }
  };

  const orderedKeys = Array.from(groups.keys()).sort((a,b)=>String(a).localeCompare(String(b)));
  let html = "";
  let idx = 0;
  const ordered = [];
  orderedKeys.forEach(k => {
    html += `<div class="day-sep">${escapeHtml(labelForKey(k))}</div>`;
    for (const f of groups.get(k)) { html += flightCardHtml(f, mode, idx++); ordered.push(f); }
  });

  listEl.innerHTML = html;
  emptyEl.style.display = filtered.length ? "none" : "";

  // Events (indexes follow display order, which is grouped by day)
  wireCards(listEl, (i) => ordered[i], () => mode);
  listEl.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const flight = ordered[Number(btn.getAttribute("data-idx"))];
      if (!flight) return;
      saveFlight(flight, { mode: F.normMode(mode), airport: airportIata });
      const on = isFlightSaved(flight);
      const no = F.flightNo(flight);
      btn.classList.toggle("saved", on);
      btn.textContent = on ? "★" : "☆";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? `Remove ${no} from saved flights` : `Save ${no}`);
      toast(on ? "Saved" : "Removed");
    });
  });

  listCounts[mode] = { shown: filtered.length, total: visible.length };
  updateMeta();
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
    b.tabIndex = on ? 0 : -1;
  });
  document.getElementById("tab-departures")?.classList.toggle("active", name === "departures");
  document.getElementById("tab-arrivals")?.classList.toggle("active", name === "arrivals");
  renderList(name);
  updateMeta();
}
function setQuickFilter(name){
  quickFilter = name;
  document.querySelectorAll(".chip-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === name));
  renderLists();
}
function initSearch(){
  const input = document.getElementById("searchInput");
  const clear = document.getElementById("clearSearchBtn");
  if (!input) return;
  
  // Debounce search for better performance
  let searchTimeout;
  input.addEventListener("input", () => { 
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = input.value || ""; 
      renderLists();
    }, 250); // Wait 250ms after user stops typing
  });
  
  clear?.addEventListener("click", () => { input.value=""; searchQuery=""; renderLists(); input.focus(); });
}
function initOverflowMenu(){
  const btn = document.getElementById("overflowBtn");
  const menu = document.getElementById("overflowMenu");
  if (!btn || !menu) return;
  function close(returnFocus){
    const wasOpen = menu.classList.contains("open");
    menu.classList.remove("open");
    btn.setAttribute("aria-expanded","false");
    if (returnFocus && wasOpen) btn.focus();
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) menu.querySelector(".menu-item")?.focus();
  });
  // Close after choosing an item, on outside click, on resize and on Escape.
  menu.addEventListener("click", (e) => { if (e.target.closest(".menu-item")) close(false); });
  document.addEventListener("click", () => close(false));
  window.addEventListener("resize", () => close(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(true); });
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
    el.setAttribute("role", "alert");
    el.innerHTML = `<div class="banner__msg" id="errorBannerMsg"></div>
                    <button class="banner__btn" id="errorBannerRetry" type="button">Retry</button>`;
    document.body.insertBefore(el, document.body.firstChild);
    // Attach once, when the banner is created (not on every call).
    el.querySelector("#errorBannerRetry")?.addEventListener("click", () => refreshAll({force:true}));
  }
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
// The last good timetable is kept in localStorage so the app still shows something when opened
// offline (or while the first request is in flight). It is replaced on every successful fetch.
function cacheKey(type){ return `brs_timetable_v2_${type}`; }

function loadCachedTimetable(type){
  try{
    const x = JSON.parse(localStorage.getItem(cacheKey(type)) || "null");
    return (x && Array.isArray(x.data)) ? { data: x.data, ts: Number(x.ts) || 0 } : null;
  } catch { return null; }
}
function saveCachedTimetable(type, list){
  try{ localStorage.setItem(cacheKey(type), JSON.stringify({ ts: Date.now(), data: list || [] })); } catch {}
}

async function fetchTimetable(type){
  const url = new URL(`${window.BrsConfig.API_BASE}/timetable`);
  url.searchParams.set("iataCode", airportIata);
  url.searchParams.set("type", type);

  const r = await fetch(url.toString(), { cache:"no-store" });
  if (!r.ok) throw new Error(`Timetable HTTP ${r.status}`);
  const j = await r.json();
  return (Array.isArray(j) && j) || (j && Array.isArray(j.data) && j.data) || (j && Array.isArray(j.result) && j.result) || [];
}

function clearLists(){
  for (const id of ["departureList","arrivalList"]) { const el = document.getElementById(id); if (el) el.innerHTML = ""; }
  for (const id of ["depEmpty","arrEmpty"]) { const el = document.getElementById(id); if (el) el.style.display = "none"; }
}

const AUTO_REFRESH_MS = 120 * 1000;  // matches the worker's edge cache
const STALE_MS = 60 * 1000;          // refresh straight away on return if data is older than this
let fetching = false;
let lastOkAt = 0;
let autoTimer = null;

/**
 * force: skip showing cached data first (manual refresh / Retry).
 * Never blanks an existing list: a failed refresh keeps showing the last data.
 */
async function refreshAll({force=false} = {}){
  if (fetching) return;
  const lr = document.getElementById("lastRefreshed");

  if (!hasLoadedOnce && !force){
    const cachedDep = loadCachedTimetable("departure");
    const cachedArr = loadCachedTimetable("arrival");
    if (cachedDep && cachedArr){
      depFlights = cachedDep.data;
      arrFlights = cachedArr.data;
      hasLoadedOnce = true;
      renderLists();
      renderMyFlights();
      if (lr) lr.textContent = `Updated ${T.fmtTime(cachedDep.ts)} (cached)`;
    }
  }

  if (!navigator.onLine){
    showError(hasLoadedOnce
      ? "You appear to be offline. Showing the last data we have."
      : "You appear to be offline. Connect to the internet to load flights.", {retry:false});
    return;
  }

  fetching = true;
  try{
    hideError();
    if (!hasLoadedOnce) renderLoadingList(currentTab);
    // Fetch sequentially: the worker makes two upstream calls per timetable (two 12 h windows)
    // and AeroDataBox allows 1 request/second. The second call is normally served from the
    // worker's edge cache because departures and arrivals share the same upstream responses.
    const dep = await fetchTimetable("departure");
    const arr = await fetchTimetable("arrival");

    depFlights = F.dedupe(dep, "departure");
    arrFlights = F.dedupe(arr, "arrival");
    saveCachedTimetable("departure", depFlights);
    saveCachedTimetable("arrival", arrFlights);

    hasLoadedOnce = true;
    lastOkAt = Date.now();
    syncSavedFromLive();
    renderLists();
    renderMyFlights();
    if (lr) lr.textContent = `Updated ${T.fmtTime(new Date())}`;
    if (force) toast(`Updated ${T.fmtTime(new Date())}`);   // announced via the toast live region

  } catch (err){
    console.error(err);
    if (hasLoadedOnce){
      showError("Couldn’t update flights — showing the last data we have.", {retry:true});
    } else {
      clearLists();
      showError("Couldn’t load flights. Check your connection and try again.", {retry:true});
    }
  } finally {
    fetching = false;
  }
}

// Auto-refresh while the page is visible; nothing runs in a hidden tab.
function stopAutoRefresh(){ if (autoTimer) clearInterval(autoTimer); autoTimer = null; }
function startAutoRefresh(){
  stopAutoRefresh();
  if (document.visibilityState !== "visible") return;
  autoTimer = setInterval(() => refreshAll(), AUTO_REFRESH_MS);
}

// =======================
// Init
// =======================
(function init(){
  // Load airport index in the background (non-blocking). Once loaded, re-render so missing IATA names fill in.
  loadAirportIndexBestEffort().then(()=>{ try{ renderLists(); renderMyFlights(); }catch{} }).catch(()=>{});
  initOverflowMenu();
  initSearch();
  initSavedUI();

  window.addEventListener("offline", () => showError("You appear to be offline. Showing cached results if available.", {retry:false}));
  window.addEventListener("online", () => { hideError(); refreshAll(); });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible"){
      if (Date.now() - lastOkAt > STALE_MS) refreshAll();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });

  document.getElementById("refreshBtn")?.addEventListener("click", () => refreshAll({force:true}));
  document.querySelectorAll(".seg-btn").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  document.querySelector(".segmented")?.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = (e.key === "ArrowLeft" || e.key === "Home") ? "departures" : "arrivals";
    setTab(next);
    document.querySelector(`.seg-btn[data-tab="${next}"]`)?.focus();
  });
  document.querySelectorAll(".chip-btn").forEach(b => b.addEventListener("click", () => setQuickFilter(b.dataset.filter)));

  refreshAll();
  startAutoRefresh();
})();
