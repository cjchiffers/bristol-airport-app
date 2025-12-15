
(function(){
  const els = {
    headline: document.getElementById("headline"),
    lastUpdated: document.getElementById("lastUpdated"),
    sourceLine: document.getElementById("sourceLine"),
    statusBadge: document.getElementById("statusBadge"),
    kpis: document.getElementById("kpis"),
    depKv: document.getElementById("depKv"),
    arrKv: document.getElementById("arrKv"),
    subhead: document.getElementById("subhead"),
    airlineLogo: document.getElementById("airlineLogo"),
    airlineName: document.getElementById("airlineName"),
    airlineCodeLine: document.getElementById("airlineCodeLine"),
    aircraftType: document.getElementById("aircraftType"),
    aircraftReg: document.getElementById("aircraftReg"),
    aircraftImageWrap: document.getElementById("aircraftImageWrap"),
    aircraftImage: document.getElementById("aircraftImage"),
    aircraftImageCredit: document.getElementById("aircraftImageCredit"),
    mapHint: document.getElementById("mapHint"),
    mapEl: document.getElementById("map"),
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
    map: null,
    mapLayer: null,
    markers: null,
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
      const raw = safeGetSession(key);
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
      els.subhead.textContent = "Open this page from the list to see full details.";
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


  function safeGetLocal(key){
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeSetLocal(key, value){
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
  function safeGetSession(key){
    try { return sessionStorage.getItem(key); } catch { return null; }
  }
  function safeSetSession(key, value){
    try { sessionStorage.setItem(key, value); return true; } catch { return false; }
  }

  function getFlightApiKey(){
    let k = safeGetLocal("flightapi_key");
    if (!k) {
      k = prompt("Enter your FlightAPI.io API key:");
      if (k) safeSetLocal("flightapi_key", k);
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
        safeSetSession(state.storageKey, JSON.stringify({ flight: state.current, context: state.context }));
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
    els.sourceLine.textContent = state.context
      ? `Source: FlightAPI schedule (${state.context.airport || "BRS"} • ${state.context.mode || "departures"})`
      : "Source: stored flight";

    const flat = flattenObject(flight);
    const prevFlat = prev ? flattenObject(prev) : null;
    const changed = prevFlat ? diffKeys(prevFlat, flat) : new Set();
    state.flattened = flat;

    const id = deriveIdentity(flight);
    const route = `${id.dep || "—"} → ${id.arr || "—"}`;
    const displayNo = id.flightNo || "—";
    els.headline.textContent = `${displayNo} • ${route}`;

    // Subhead: local scheduled times summary
    const depTime = fmtTime(pickAny(flat, [
      "flight.time.scheduled.departure",
      "time.scheduled.departure",
      "departure.scheduledTime",
      "departure.scheduled",
      "scheduled_departure",
      "departure_time",
      "scheduledDeparture"
    ]));
    const arrTime = fmtTime(pickAny(flat, [
      "flight.time.scheduled.arrival",
      "time.scheduled.arrival",
      "arrival.scheduledTime",
      "arrival.scheduled",
      "scheduled_arrival",
      "arrival_time",
      "scheduledArrival"
    ]));
    els.subhead.textContent = depTime && arrTime ? `${depTime} → ${arrTime}` : (depTime ? `Departs ${depTime}` : "—");

    // Airline logo + name
    const airlineNameVal = pickAny(flat, ["flight.airline.name","airline.name","airlineName","airline"]) || "—";
    const airlineIata = pickAny(flat, ["flight.airline.code.iata","airline.iata","airline_iata","airlineCode","airline.iataCode"]) || "";
    els.airlineName.textContent = airlineNameVal;
    els.airlineCodeLine.textContent = airlineIata ? `Airline code: ${airlineIata}` : "Airline code: —";

    const logoIata = airlineIata || (displayNo !== "—" ? String(displayNo).slice(0,2) : "");
    if (logoIata) {
      els.airlineLogo.src = `https://www.gstatic.com/flights/airline_logos/70px/${encodeURIComponent(logoIata)}.png`;
      els.airlineLogo.alt = `${airlineNameVal} logo`;
      els.airlineLogo.onerror = () => { els.airlineLogo.style.display = "none"; };
      els.airlineLogo.style.display = "";
    } else {
      els.airlineLogo.style.display = "none";
    }

    // Aircraft type + image if provided by API
    const acCode = pickAny(flat, ["flight.aircraft.model.code","aircraft.model.code","aircraftCode","aircraft.code"]) || "";
    const acText = pickAny(flat, ["flight.aircraft.model.text","aircraft.model.text","aircraftType","aircraft.text","aircraft.model"]) || "";
    els.aircraftType.textContent = acText ? `${acText}${acCode ? ` (${acCode})` : ""}` : (acCode ? `Aircraft ${acCode}` : "Aircraft —");

    const reg = pickAny(flat, ["flight.aircraft.registration","aircraft.registration","registration"]) || "";
    els.aircraftReg.textContent = reg ? `Registration: ${reg}` : "Registration: —";

    // aircraft image: FlightAPI may return flight.aircraft.images (array or object)
    const imgSrc =
      pickAny(flat, [
        "flight.aircraft.images.large[0].src",
        "flight.aircraft.images.medium[0].src",
        "flight.aircraft.images.thumbnails[0].src",
        "aircraft.images.large[0].src",
        "aircraft.images.medium[0].src",
        "aircraft.images.thumbnails[0].src"
      ]);
    const imgCredit =
      pickAny(flat, [
        "flight.aircraft.images.large[0].copyright",
        "flight.aircraft.images.large[0].source",
        "aircraft.images.large[0].copyright",
        "aircraft.images.large[0].source"
      ]) || "";
    if (imgSrc) {
      els.aircraftImage.src = imgSrc;
      els.aircraftImageWrap.style.display = "";
      els.aircraftImageCredit.textContent = imgCredit ? `Image: ${imgCredit}` : "";
    } else {
      els.aircraftImageWrap.style.display = "none";
    }

    // Map: plot origin/destination and route line (if coords exist)
    const oLat = pickNumber(flat, [
      "flight.airport.origin.info.position.latitude",
      "flight.airport.origin.position.latitude",
      "airport.origin.position.latitude",
      "origin.position.latitude",
      "departure.position.latitude"
    ]);
    const oLng = pickNumber(flat, [
      "flight.airport.origin.info.position.longitude",
      "flight.airport.origin.position.longitude",
      "airport.origin.position.longitude",
      "origin.position.longitude",
      "departure.position.longitude"
    ]);
    const dLat = pickNumber(flat, [
      "flight.airport.destination.position.latitude",
      "airport.destination.position.latitude",
      "destination.position.latitude",
      "arrival.position.latitude"
    ]);
    const dLng = pickNumber(flat, [
      "flight.airport.destination.position.longitude",
      "airport.destination.position.longitude",
      "destination.position.longitude",
      "arrival.position.longitude"
    ]);

    const originCode = pickAny(flat, ["flight.airport.origin.code.iata","departure.iataCode","departure.iata","dep_iata","origin","from"]) || "—";
    const destCode = pickAny(flat, ["flight.airport.destination.code.iata","arrival.iataCode","arrival.iata","arr_iata","destination","to"]) || "—";
    els.mapHint.textContent = `${originCode} → ${destCode}`;
    renderMap(oLat, oLng, dLat, dLng, originCode, destCode);

    renderStatusBadge(flight, flat);
    renderKpis(flight, flat, changed);
    renderKvPanels(flight, flat, changed);
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
      { label: "Terminal",
        value: bristolTerminal(), keyHint: ["departure.terminal","depTerminal","terminal","departure_terminal"] },
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

  
  function pickNumber(flat, paths){
    for (const p of paths){
      if (flat[p] !== undefined && flat[p] !== null && String(flat[p]).trim() !== "") {
        const n = Number(flat[p]);
        if (!Number.isNaN(n)) return n;
      }
    }
    return null;
  }

  function renderMap(oLat, oLng, dLat, dLng, originCode, destCode){
    if (!els.mapEl) return;

    // If we don't have coordinates, show a friendly message and skip map init.
    if (oLat === null || oLng === null || dLat === null || dLng === null) {
      els.mapEl.innerHTML = `<div class="small" style="padding:12px">Map unavailable (missing coordinates in API response).</div>`;
      return;
    }

    // Initialize map once
    if (!state.map) {
      state.map = L.map(els.mapEl, {
        zoomControl: true,
        attributionControl: true,
      });
      // OSM tiles (light). Leaflet has no built-in dark tiles without extra providers.
      state.mapLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(state.map);
      state.markers = {
        origin: L.marker([oLat, oLng]).addTo(state.map),
        dest: L.marker([dLat, dLng]).addTo(state.map),
        line: L.polyline([[oLat, oLng],[dLat, dLng]]).addTo(state.map),
      };
    } else {
      // Update positions
      state.markers.origin.setLatLng([oLat, oLng]);
      state.markers.dest.setLatLng([dLat, dLng]);
      state.markers.line.setLatLngs([[oLat, oLng],[dLat, dLng]]);
    }

    state.markers.origin.bindPopup(`<b>${escapeHtml(originCode)}</b>`);
    state.markers.dest.bindPopup(`<b>${escapeHtml(destCode)}</b>`);

    const bounds = L.latLngBounds([[oLat, oLng],[dLat, dLng]]);
    state.map.fitBounds(bounds.pad(0.25));
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
