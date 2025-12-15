
(function(){
  const els = {
    headline: document.getElementById("headline"),
    lastUpdated: document.getElementById("lastUpdated"),
    sourceLine: document.getElementById("sourceLine"),
    statusBadge: document.getElementById("statusBadge"),
    kpis: document.getElementById("kpis"),
    depKv: document.getElementById("depKv"),
    arrKv: document.getElementById("arrKv"),
    allFields: document.getElementById("allFields"),
    rawJson: document.getElementById("rawJson"),
    backBtn: document.getElementById("backBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    autoBtn: document.getElementById("autoBtn"),
  };

  const state = {
    storageKey: null,
    context: null,
    current: null,
    flattened: null,
    auto: true,
    timer: null,
    intervalMs: 30000,
  };

  els.backBtn.addEventListener("click", () => window.history.back());
  els.refreshBtn.addEventListener("click", () => refreshNow(true));
  els.autoBtn.addEventListener("click", () => {
    state.auto = !state.auto;
    els.autoBtn.setAttribute("aria-pressed", state.auto ? "true" : "false");
    els.autoBtn.textContent = `Auto-refresh: ${state.auto ? "On" : "Off"}`;
    if (state.auto) startAuto(); else stopAuto();
  });

  init();

  function init(){
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    state.storageKey = key;

    let payload = null;
    if (key) {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        try { payload = JSON.parse(raw); } catch {}
      }
    }

    if (!payload) {
      // Backward compatibility: old links used ?flight=...
      const flightParam = params.get("flight");
      els.headline.textContent = flightParam ? `Flight ${flightParam}` : "Flight details";
      els.statusBadge.textContent = "Unavailable";
      els.sourceLine.textContent = "No stored flight context";
      els.allFields.innerHTML = `<div class="small">Open this page from the list to see full details.</div>`;
      stopAuto();
      return;
    }

    state.context = payload.context || null;
    state.current = payload.flight;
    render(state.current, null);
    startAuto();
  }

  function startAuto(){
    stopAuto();
    if (!state.auto) return;
    state.timer = setInterval(() => refreshNow(false), state.intervalMs);
  }
  function stopAuto(){
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function getFlightApiKey(){
    let k = localStorage.getItem("flightapi_key");
    if (!k) {
      k = prompt("Enter your FlightAPI.io API key:");
      if (k) localStorage.setItem("flightapi_key", k);
    }
    return k;
  }

  async function refreshNow(forceShowToast){
    if (!state.context) return;
    // Try FlightAPI schedule refresh if possible
    const apiKey = getFlightApiKey();
    if (!apiKey) return;

    try{
      const updated = await fetchBestEffortUpdate(apiKey, state.context, state.current);
      if (!updated) {
        if (forceShowToast) flashStatus("warn", "Could not find updated flight data");
        return;
      }

      const prev = state.current;
      state.current = updated;

      // Persist back to sessionStorage so back/forward keeps latest
      try{
        sessionStorage.setItem(state.storageKey, JSON.stringify({ flight: state.current, context: state.context }));
      } catch {}

      render(state.current, prev);

      if (forceShowToast) flashStatus("good", "Updated");
    }catch(e){
      console.error(e);
      if (forceShowToast) flashStatus("bad", "Refresh failed");
    }
  }

  function flashStatus(kind, text){
    els.statusBadge.className = `badge ${kind}`;
    els.statusBadge.textContent = text;
    setTimeout(() => renderStatusBadge(state.current, null), 1600);
  }

  async function fetchBestEffortUpdate(apiKey, context, current){
    // context: {mode:"departures"|"arrivals", airport:"BRS", day:1}
    const mode = context.mode || "departures";
    const airport = context.airport || "BRS";
    const day = context.day || 1;

    // Try FlightAPI schedule endpoint
    const url = new URL(`https://api.flightapi.io/schedule/${encodeURIComponent(apiKey)}`);
    url.searchParams.set("mode", mode);
    url.searchParams.set("iata", airport);
    url.searchParams.set("day", String(day));

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();

    const list = Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : (data.result && Array.isArray(data.result) ? data.result : null));
    if (!list) return null;

    const curId = deriveIdentity(current);
    let best = null;
    let bestScore = -1;
    for (const f of list){
      const candId = deriveIdentity(f);
      const score = scoreMatch(curId, candId);
      if (score > bestScore){
        bestScore = score;
        best = f;
      }
    }
    // Require some minimum confidence
    if (bestScore < 3) return null;
    return best;
  }

  function deriveIdentity(f){
    // Works for Aviation Edge-ish or FlightAPI-ish structures
    const flightNo = (
      f?.flight?.iataNumber ||
      f?.flight?.icaoNumber ||
      f?.flight_iata ||
      f?.flight_icao ||
      f?.flightNumber ||
      f?.number ||
      f?.flight_no ||
      null
    );

    const dep = (
      f?.departure?.iataCode ||
      f?.departure?.iata ||
      f?.dep_iata ||
      f?.origin ||
      f?.from ||
      null
    );

    const arr = (
      f?.arrival?.iataCode ||
      f?.arrival?.iata ||
      f?.arr_iata ||
      f?.destination ||
      f?.to ||
      null
    );

    const schedDep = (
      f?.departure?.scheduledTime ||
      f?.departure?.scheduled ||
      f?.departure_time ||
      f?.scheduled_departure ||
      f?.scheduledDeparture ||
      null
    );

    const schedArr = (
      f?.arrival?.scheduledTime ||
      f?.arrival?.scheduled ||
      f?.arrival_time ||
      f?.scheduled_arrival ||
      f?.scheduledArrival ||
      null
    );

    return { flightNo, dep, arr, schedDep, schedArr };
  }

  function scoreMatch(a,b){
    let s = 0;
    if (a.flightNo && b.flightNo && normalize(a.flightNo) === normalize(b.flightNo)) s += 4;
    if (a.dep && b.dep && normalize(a.dep) === normalize(b.dep)) s += 2;
    if (a.arr && b.arr && normalize(a.arr) === normalize(b.arr)) s += 2;

    const td = timeDistanceMinutes(a.schedDep, b.schedDep);
    if (td !== null && td <= 10) s += 2;
    else if (td !== null && td <= 30) s += 1;

    const ta = timeDistanceMinutes(a.schedArr, b.schedArr);
    if (ta !== null && ta <= 10) s += 2;
    else if (ta !== null && ta <= 30) s += 1;

    return s;
  }

  function normalize(x){
    return String(x).trim().toUpperCase();
  }

  function timeDistanceMinutes(t1,t2){
    const a = toDate(t1);
    const b = toDate(t2);
    if (!a || !b) return null;
    return Math.abs(a.getTime() - b.getTime()) / 60000;
  }

  function toDate(v){
    if (!v) return null;
    if (v instanceof Date) return v;
    // supports ISO, epoch, or "YYYY-MM-DD HH:mm" style
    const n = Number(v);
    if (!Number.isNaN(n) && String(v).length >= 10) {
      // treat as epoch seconds or ms
      return new Date(n < 2e10 ? n * 1000 : n);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function render(flight, prev){
    const now = new Date();
    els.lastUpdated.textContent = `Last updated: ${now.toLocaleString()}`;
    els.sourceLine.textContent = state.context ? `Source: FlightAPI schedule (${state.context.airport || "BRS"} • ${state.context.mode || "departures"})` : "Source: stored flight";

    const id = deriveIdentity(flight);
    const route = `${id.dep || "—"} → ${id.arr || "—"}`;
    const displayNo = id.flightNo || "—";
    els.headline.textContent = `${displayNo} • ${route}`;

    const flat = flattenObject(flight);
    const prevFlat = prev ? flattenObject(prev) : null;
    const changed = prevFlat ? diffKeys(prevFlat, flat) : new Set();
    state.flattened = flat;

    renderStatusBadge(flight, flat);
    renderKpis(flight, flat, changed);
    renderKvPanels(flight, flat, changed);
    renderAllFields(flat, changed);
    els.rawJson.textContent = JSON.stringify(flight, null, 2);
  }

  function renderStatusBadge(flight, flat){
    const status = pickFirst(flat, [
      "status",
      "flight_status",
      "arrival.status",
      "departure.status",
      "flight.status",
      "info.status"
    ]) || "Unknown";

    const st = String(status).toLowerCase();
    let cls = "neutral";
    if (st.includes("cancel")) cls = "bad";
    else if (st.includes("delay")) cls = "warn";
    else if (st.includes("on time") || st.includes("scheduled") || st.includes("boarding") || st.includes("active") || st.includes("departed") || st.includes("landed")) cls = "good";

    els.statusBadge.className = `badge ${cls}`;
    els.statusBadge.textContent = status;
  }

  function renderKpis(flight, flat, changed){
    const kpis = [
      { label:"Scheduled", value: fmtTime(pickAny(flat, ["departure.scheduledTime","departure.scheduled","scheduled_departure","departure_time","scheduledDeparture"])) || "—" },
      { label:"Estimated", value: fmtTime(pickAny(flat, ["departure.estimatedTime","departure.estimated","estimated_departure","estimatedDeparture"])) || "—" },
      { label:"Gate", value: pickAny(flat, ["departure.gate","depGate","gate","departure_gate"]) || "—", keyHint: ["departure.gate","depGate","gate","departure_gate"] },
      { label:"Terminal", value: pickAny(flat, ["departure.terminal","depTerminal","terminal","departure_terminal"]) || "—", keyHint: ["departure.terminal","depTerminal","terminal","departure_terminal"] },
    ];

    els.kpis.innerHTML = kpis.map(k => {
      const isChanged = k.keyHint ? k.keyHint.some(p => changed.has(p)) : false;
      const vClass = `value ${/^\d{2}:\d{2}/.test(k.value) ? "mono" : ""} ${isChanged ? "changed" : ""}`;
      return `<div class="kpi"><div class="label">${escapeHtml(k.label)}</div><div class="${vClass}">${escapeHtml(String(k.value))}</div></div>`;
    }).join("");
  }

  function renderKvPanels(flight, flat, changed){
    const depPairs = [
      pair("Airport", pickAny(flat, ["departure.iataCode","departure.iata","dep_iata","origin","from"])),
      pair("Scheduled", fmtTime(pickAny(flat, ["departure.scheduledTime","departure.scheduled","scheduled_departure","departure_time"]))),
      pair("Estimated", fmtTime(pickAny(flat, ["departure.estimatedTime","departure.estimated","estimated_departure"]))),
      pair("Actual", fmtTime(pickAny(flat, ["departure.actualTime","departure.actual","actual_departure"]))),
      pair("Terminal", pickAny(flat, ["departure.terminal","depTerminal","departure_terminal","terminal"])),
      pair("Gate", pickAny(flat, ["departure.gate","depGate","departure_gate","gate"])),
      pair("Check-in", pickAny(flat, ["departure.checkin","checkin"])),
      pair("Stand", pickAny(flat, ["departure.stand","stand"])),
    ].filter(x => x.v);

    const arrPairs = [
      pair("Airport", pickAny(flat, ["arrival.iataCode","arrival.iata","arr_iata","destination","to"])),
      pair("Scheduled", fmtTime(pickAny(flat, ["arrival.scheduledTime","arrival.scheduled","scheduled_arrival","arrival_time"]))),
      pair("Estimated", fmtTime(pickAny(flat, ["arrival.estimatedTime","arrival.estimated","estimated_arrival"]))),
      pair("Actual", fmtTime(pickAny(flat, ["arrival.actualTime","arrival.actual","actual_arrival"]))),
      pair("Terminal", pickAny(flat, ["arrival.terminal","arrTerminal","arrival_terminal"])),
      pair("Gate", pickAny(flat, ["arrival.gate","arrGate","arrival_gate"])),
      pair("Baggage", pickAny(flat, ["arrival.baggage","baggage"])),
    ].filter(x => x.v);

    els.depKv.innerHTML = depPairs.map(p => kvRow(p, changed)).join("") || `<div class="small">No departure details available.</div>`;
    els.arrKv.innerHTML = arrPairs.map(p => kvRow(p, changed)).join("") || `<div class="small">No arrival details available.</div>`;
  }

  function kvRow(p, changed){
    const changedCls = p.paths.some(x => changed.has(x)) ? "changed" : "";
    return `<div class="k">${escapeHtml(p.k)}</div><div class="v ${changedCls}">${escapeHtml(String(p.v))}</div>`;
  }

  function renderAllFields(flat, changed){
    // Group by top-level prefix for readability
    const entries = Object.entries(flat);
    entries.sort((a,b)=>a[0].localeCompare(b[0]));

    const html = entries.map(([k,v]) => {
      const cls = changed.has(k) ? "changed" : "";
      return `
        <div class="kv">
          <div class="k mono">${escapeHtml(k)}</div>
          <div class="v ${cls}">${escapeHtml(formatValue(v))}</div>
        </div>
      `;
    }).join("");

    els.allFields.innerHTML = html || `<div class="small">No fields to display.</div>`;
  }

  function flattenObject(obj, prefix = "", out = {}){
    if (obj === null || obj === undefined) return out;
    if (typeof obj !== "object"){
      out[prefix || "value"] = obj;
      return out;
    }
    if (Array.isArray(obj)){
      obj.forEach((v,i)=>{
        const p = prefix ? `${prefix}[${i}]` : `[${i}]`;
        flattenObject(v, p, out);
      });
      return out;
    }
    for (const [k,v] of Object.entries(obj)){
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") flattenObject(v, p, out);
      else out[p] = v;
    }
    return out;
  }

  function diffKeys(prev, next){
    const changed = new Set();
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const k of keys){
      const a = prev[k];
      const b = next[k];
      if (!deepEqual(a,b)) changed.add(k);
    }
    return changed;
  }

  function deepEqual(a,b){
    if (a === b) return true;
    // Compare dates/strings/numbers loosely
    return String(a) === String(b);
  }

  function formatValue(v){
    if (v === null) return "null";
    if (v === undefined) return "—";
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    const d = toDate(v);
    if (d) return `${d.toLocaleString()}`;
    return String(v);
  }

  function fmtTime(v){
    const d = toDate(v);
    if (!d) return v ? String(v) : "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function pickAny(flat, paths){
    for (const p of paths){
      if (flat[p] !== undefined && flat[p] !== null && String(flat[p]).trim() !== "") return flat[p];
    }
    return "";
  }

  function pickFirst(flat, paths){
    return pickAny(flat, paths);
  }

  function pair(k,v){
    return { k, v, paths: [] };
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
})();
