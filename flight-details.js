

  (function () {
  const els = {
    headline: document.getElementById("headline"),
    subhead: document.getElementById("subhead"),
    lastUpdated: document.getElementById("lastUpdated"),
    sourceLine: document.getElementById("sourceLine"),
    statusBadge: document.getElementById("statusBadge"),
    kpis: document.getElementById("kpis"),
    depKv: document.getElementById("depKv"),
    arrKv: document.getElementById("arrKv"),
    rawJson: document.getElementById("rawJson"),

    backBtn: document.getElementById("backBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    autoBtn: document.getElementById("autoBtn"),

    airlineLogo: document.getElementById("airlineLogo"),
    airlineName: document.getElementById("airlineName"),
    airlineCodeLine: document.getElementById("airlineCodeLine"),

    aircraftType: document.getElementById("aircraftType"),
    aircraftReg: document.getElementById("aircraftReg"),
    aircraftImageWrap: document.getElementById("aircraftImageWrap"),
    aircraftImage: document.getElementById("aircraftImage"),
    aircraftImageCredit: document.getElementById("aircraftImageCredit"),

    mapHint: document.getElementById("mapHint"),
    mapEl: document.getElementById("routeSvg"),

    notifyBtn: document.getElementById("notifyBtn"),
    shareBtn: document.getElementById("shareBtn"),
    calendarBtn: document.getElementById("calendarBtn"),
    compactBtn: document.getElementById("compactBtn"),
    leaveCard: document.getElementById("leaveCard"),
    inboundLinkLine: document.getElementById("inboundLinkLine"),

    groupBtn: document.getElementById("groupBtn"),
    groupModal: document.getElementById("groupModal"),
    groupCloseBtn: document.getElementById("groupCloseBtn"),
    groupShareBtn: document.getElementById("groupShareBtn"),
    groupTitle: document.getElementById("groupTitle"),
    groupSubtitle: document.getElementById("groupSubtitle"),
    groupCountdown: document.getElementById("groupCountdown"),
    groupNext: document.getElementById("groupNext"),
    groupPills: document.getElementById("groupPills"),
    weatherBox: document.getElementById("weatherBox"),
    wxHint: document.getElementById("wxHint"),
  };
  // Details overflow menu (mobile)
  const overflowBtn = document.getElementById("overflowDetailsBtn");
  const menu = document.getElementById("detailsMenu");
  const closeMenu = () => {
    if (!menu || !overflowBtn) return;
    menu.classList.remove("open");
    overflowBtn.setAttribute("aria-expanded", "false");
  };
  const openMenu = () => {
    if (!menu || !overflowBtn) return;
    menu.classList.add("open");
    overflowBtn.setAttribute("aria-expanded", "true");
  };
  const toggleMenu = (ev) => {
    if (!menu || !overflowBtn) return;
    ev && ev.stopPropagation();
    if (menu.classList.contains("open")) closeMenu();
    else openMenu();
  };

  if (overflowBtn && menu) {
    overflowBtn.addEventListener("click", toggleMenu);
    document.addEventListener("click", (e) => {
      if (!menu.classList.contains("open")) return;
      if (menu.contains(e.target) || overflowBtn.contains(e.target)) return;
      closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn) closeMenu();
    });
  }


  const state = {
    storageKey: null,
    context: null,
    current: null,
    auto: true,
    timer: null,
    intervalMs: 30000,
    notifyEnabled: false,
    lastNotifiedHash: null,
    map: null,
    mapLayer: null,
    markers: null,
    groupTimer: null,
  };

  // ---------- Safe storage wrappers (privacy / tracking prevention) ----------
  function safeGetLocal(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function safeSetLocal(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }

  // Airport coordinates fallback (IATA -> lat/lng). Used when API payload omits positions.
  var AIRPORT_COORDS = {
  "BRS": [
    51.3827,
    -2.7191
  ],
  "LGW": [
    51.1537,
    -0.1821
  ],
  "LHR": [
    51.47,
    -0.4543
  ],
  "STN": [
    51.885,
    0.235
  ],
  "MAN": [
    53.365,
    -2.272
  ],
  "BHX": [
    52.4539,
    -1.748
  ],
  "EDI": [
    55.95,
    -3.3725
  ],
  "GLA": [
    55.8719,
    -4.4331
  ],
  "DUB": [
    53.4213,
    -6.2701
  ],
  "AMS": [
    52.3086,
    4.7639
  ],
  "CDG": [
    49.0097,
    2.5479
  ],
  "ORY": [
    48.7262,
    2.3652
  ],
  "BCN": [
    41.2974,
    2.0833
  ],
  "MAD": [
    40.4983,
    -3.5676
  ],
  "LIS": [
    38.7742,
    -9.1342
  ],
  "OPO": [
    41.2481,
    -8.6814
  ],
  "AGP": [
    36.6749,
    -4.4991
  ],
  "ALC": [
    38.2822,
    -0.5582
  ],
  "PMI": [
    39.5517,
    2.7388
  ],
  "FAO": [
    37.0144,
    -7.9659
  ],
  "TFS": [
    28.0445,
    -16.5725
  ],
  "ACE": [
    28.9455,
    -13.6052
  ],
  "FUE": [
    28.4527,
    -13.8638
  ],
  "IBZ": [
    38.8729,
    1.3731
  ],
  "NCE": [
    43.6653,
    7.215
  ],
  "GVA": [
    46.2381,
    6.1089
  ],
  "ZRH": [
    47.4581,
    8.5555
  ],
  "VIE": [
    48.1103,
    16.5697
  ],
  "PRG": [
    50.1008,
    14.2632
  ],
  "BUD": [
    47.439,
    19.261
  ],
  "WAW": [
    52.1657,
    20.9671
  ],
  "KRK": [
    50.0777,
    19.7848
  ],
  "FCO": [
    41.8003,
    12.2389
  ],
  "NAP": [
    40.886,
    14.2908
  ],
  "VCE": [
    45.5053,
    12.3519
  ],
  "MXP": [
    45.6306,
    8.7281
  ],
  "BGY": [
    45.6699,
    9.7042
  ],
  "BER": [
    52.3667,
    13.5033
  ],
  "FRA": [
    50.0379,
    8.5622
  ],
  "MUC": [
    48.3538,
    11.7861
  ],
  "HAM": [
    53.6304,
    9.9882
  ],
  "DUS": [
    51.2895,
    6.7668
  ],
  "CPH": [
    55.618,
    12.6508
  ],
  "ARN": [
    59.6519,
    17.9186
  ],
  "OSL": [
    60.1976,
    11.1004
  ],
  "KEF": [
    63.985,
    -22.6056
  ],
  "JER": [
    49.2079,
    -2.1955
  ],
  "GCI": [
    49.435,
    -2.6019
  ]
};

  function getAirportCoords(iata){
    const code = String(iata || "").toUpperCase().trim();
    if (!code) return null;

    // Allow user overrides (local)
    try{
      const raw = safeGetLocal("brs_airport_coords_overrides");
      if (raw){
        const map = JSON.parse(raw);
        if (map && map[code] && Array.isArray(map[code]) && map[code].length === 2){
          return { lat: Number(map[code][0]), lng: Number(map[code][1]) };
        }
      }
    } catch {}

    const v = AIRPORT_COORDS && AIRPORT_COORDS[code];
    if (!v) return null;
    return { lat: Number(v[0]), lng: Number(v[1]) };
  }

  }
  function safeGetSession(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function safeSetSession(key, value) {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Controls ----------
  // Extra actions
  if (els.compactBtn) {
    els.compactBtn.addEventListener("click", () => {
      document.body.classList.toggle("compact");
      els.compactBtn.textContent = document.body.classList.contains("compact") ? "Full view" : "Focus mode";
    });
  }
  if (els.shareBtn) els.shareBtn.addEventListener("click", () => shareFlight());
  if (els.calendarBtn) els.calendarBtn.addEventListener("click", () => downloadICS());
  if (els.notifyBtn) els.notifyBtn.addEventListener("click", () => toggleNotify());
  // Group mode
  if (els.groupBtn) els.groupBtn.addEventListener("click", () => openGroupMode());
  if (els.groupCloseBtn) els.groupCloseBtn.addEventListener("click", () => closeGroupMode());
  if (els.groupModal) els.groupModal.addEventListener("click", (e) => { if (e.target === els.groupModal) closeGroupMode(); });
  if (els.groupShareBtn) els.groupShareBtn.addEventListener("click", () => shareFlight());

  if (els.backBtn) els.backBtn.addEventListener("click", () => window.history.back());
  if (els.refreshBtn) els.refreshBtn.addEventListener("click", () => refreshNow(true));
  if (els.autoBtn)
    els.autoBtn.addEventListener("click", () => {
      state.auto = !state.auto;
      els.autoBtn.setAttribute("aria-pressed", state.auto ? "true" : "false");
      els.autoBtn.textContent = `Auto-refresh: ${state.auto ? "On" : "Off"}`;
      if (state.auto) startAuto();
      else stopAuto();
    });

  init();

  function init() {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    state.storageKey = key;

    let payload = null;
    if (key) {
      const raw = safeGetSession(key);
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {}
      }
    }

    if (!payload) {
      const flightParam = params.get("flight");
      if (els.headline) els.headline.textContent = flightParam ? `Flight ${flightParam}` : "Flight details";
      if (els.subhead) els.subhead.textContent = "Open this page from the list to see full details.";
      if (els.statusBadge) {
        els.statusBadge.className = "badge neutral";
        els.statusBadge.textContent = "Unavailable";
      }
      if (els.sourceLine) els.sourceLine.textContent = "No stored flight context";
      stopAuto();
      return;
    }

    state.context = payload.context || null;
    state.current = payload.flight || null;

    render(state.current, null);
    loadNotifyState();
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
      if (!updated) {
        if (forceFeedback) flashStatus("warn", "No update found");
        return;
      }

      const prev = state.current;
      state.current = updated;

      // Persist latest to session storage (best effort)
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
    setTimeout(() => renderStatusBadge(state.current, flattenObject(state.current)), 1600);
  }


  function extractAirportPosFromScheduleResponse(data){
    try{
      const pos = data?.airport?.pluginData?.details?.position;
      if (pos && typeof pos.latitude === "number" && typeof pos.longitude === "number") {
        return { lat: pos.latitude, lng: pos.longitude };
      }
    } catch {}
    return null;
  }

  async function fetchBestEffortUpdate(apiKey, context, current) {
    // context: {mode:"departures"|"arrivals", airport:"BRS", day:1}
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
    
    const ap = extractAirportPosFromScheduleResponse(data);
    if (ap) { state.context = state.context || {}; state.context.airportPos = ap; }
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

    // Minimum confidence
    if (bestScore < 3) return null;
    return best;
  }

  // ---------- Rendering ----------
  function render(flight, prev) {
    if (!flight) return;

    const now = new Date();
    if (els.lastUpdated) els.lastUpdated.textContent = `Last updated: ${now.toLocaleString()}`;
    if (els.sourceLine)
      els.sourceLine.textContent = state.context
        ? `Source: FlightAPI schedule (${state.context.airport || "BRS"} • ${state.context.mode || "departures"})`
        : "Source: stored flight";

    const flat = flattenObject(flight);
    const prevFlat = prev ? flattenObject(prev) : null;
    const changed = prevFlat ? diffKeys(prevFlat, flat) : new Set();
    if (prevFlat) maybeNotify(prevFlat, flat);

    const id = deriveIdentity(flight);
    const route = `${id.dep || "—"} → ${id.arr || "—"}`;
    const displayNo = id.flightNo || "—";
    if (els.headline) els.headline.textContent = `${displayNo} • ${route}`;

    // Subhead: scheduled times
    const depTime = fmtTime(
      pickAny(flat, [
        "flight.time.scheduled.departure",
        "time.scheduled.departure",
        "departure.scheduledTime",
        "departure.scheduled",
        "scheduled_departure",
        "departure_time",
        "scheduledDeparture",
      ])
    );
    const arrTime = fmtTime(
      pickAny(flat, [
        "flight.time.scheduled.arrival",
        "time.scheduled.arrival",
        "arrival.scheduledTime",
        "arrival.scheduled",
        "scheduled_arrival",
        "arrival_time",
        "scheduledArrival",
      ])
    );
    if (els.subhead) els.subhead.textContent = depTime && arrTime ? `${depTime} → ${arrTime}` : depTime ? `Departs ${depTime}` : "—";

    // Status badge
    renderStatusBadge(flight, flat);

    // Airline logo + name
    const airlineNameVal = pickAny(flat, ["airline.name", "flight.airline.name", "airlineName", "airline"]) || "—";
    const airlineIata =
      pickAny(flat, ["airline.iata", "airline.iataCode", "flight.airline.code.iata", "airline_iata", "airlineCode"]) || "";
    if (els.airlineName) els.airlineName.textContent = airlineNameVal;
    if (els.airlineCodeLine) els.airlineCodeLine.textContent = airlineIata ? `Airline code: ${airlineIata}` : "Airline code: —";

    const logoIata = airlineIata || (displayNo !== "—" ? String(displayNo).slice(0, 2) : "");
    if (els.airlineLogo) {
      if (logoIata) {
        els.airlineLogo.src = `https://www.gstatic.com/flights/airline_logos/70px/${encodeURIComponent(logoIata)}.png`;
        els.airlineLogo.alt = `${airlineNameVal} logo`;
        els.airlineLogo.onerror = () => {
          els.airlineLogo.style.display = "none";
        };
        els.airlineLogo.style.display = "";
      } else {
        els.airlineLogo.style.display = "none";
      }
    }

    // ---------- Aircraft (YOUR JSON STRUCTURE) ----------
    // aircraft: { icao24, icaoCode, regNumber }
    const acCode =
      pickAny(flat, [
        "aircraft.icaoCode", // <-- your FlightAPI shape
        "aircraft.model.code",
        "flight.aircraft.model.code",
        "aircraftCode",
        "aircraft.code",
      ]) || "";

    const acText =
      pickAny(flat, ["aircraft.model.text", "flight.aircraft.model.text", "aircraftType", "aircraft.text", "aircraft.model"]) || "";

    if (els.aircraftType)
      els.aircraftType.textContent = acText ? `${acText}${acCode ? ` (${acCode})` : ""}` : acCode ? `Aircraft ${acCode}` : "Aircraft —";

    const reg =
      pickAny(flat, [
        "aircraft.regNumber", // <-- your FlightAPI shape
        "flight.aircraft.registration",
        "aircraft.registration",
        "registration",
      ]) || "";

    const icao24 =
      pickAny(flat, [
        "aircraft.icao24", // <-- your FlightAPI shape
      ]) || "";

    if (els.aircraftReg)
      els.aircraftReg.textContent = reg
        ? `Registration: ${reg}${icao24 ? ` • ICAO24: ${icao24}` : ""}`
        : icao24
        ? `ICAO24: ${icao24}`
        : "Registration: —";

    // Aircraft image (only if provided by the API payload)
    const imgSrc = pickAny(flat, [
      "flight.aircraft.images.large[0].src",
      "flight.aircraft.images.medium[0].src",
      "flight.aircraft.images.thumbnails[0].src",
      "aircraft.images.large[0].src",
      "aircraft.images.medium[0].src",
      "aircraft.images.thumbnails[0].src",
    ]);
    const imgCredit =
      pickAny(flat, [
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

    // KPIs + panels
    renderKpis(flight, flat, changed);
    renderKvPanels(flight, flat, changed);

    // Map (FlightAPI schedule wrapper provides home-airport position separately)
    const ctxPos = state.context && state.context.airportPos ? state.context.airportPos : null;

    // For departures at BRS: origin is BRS (from wrapper), destination position is usually in flight.airport.destination.position
    // For arrivals at BRS: destination is BRS (from wrapper), origin position is usually in flight.airport.origin.position
    const mode = (state.context && state.context.mode) ? state.context.mode : "departures";

    const otherLat = pickNumber(flat, [
      "flight.airport.destination.position.latitude",
      "flight.airport.destination.position.lat",
      "flight.airport.destination.positionLatitude",
      "airport.destination.position.latitude",
      "airport.destination.position.lat",
      "destination.position.latitude",
      "destination.position.lat",
      "arrival.position.latitude",
      "arrival.position.lat",
      "departure.position.latitude",
      "departure.position.lat",

      "flight.airport.origin.position.latitude",
      "flight.airport.origin.position.lat",
      "flight.airport.origin.positionLatitude",
      "airport.origin.position.latitude",
      "airport.origin.position.lat",
      "origin.position.latitude",
      "origin.position.lat"
    ]);

    const otherLng = pickNumber(flat, [
      "flight.airport.destination.position.longitude",
      "flight.airport.destination.position.lng",
      "flight.airport.destination.position.lon",
      "flight.airport.destination.positionLongitude",
      "airport.destination.position.longitude",
      "airport.destination.position.lng",
      "airport.destination.position.lon",
      "destination.position.longitude",
      "destination.position.lng",
      "destination.position.lon",
      "arrival.position.longitude",
      "arrival.position.lng",
      "arrival.position.lon",
      "departure.position.longitude",
      "departure.position.lng",
      "departure.position.lon",

      "flight.airport.origin.position.longitude",
      "flight.airport.origin.position.lng",
      "flight.airport.origin.position.lon",
      "flight.airport.origin.positionLongitude",
      "airport.origin.position.longitude",
      "airport.origin.position.lng",
      "airport.origin.position.lon",
      "origin.position.longitude",
      "origin.position.lng",
      "origin.position.lon"
    ]);
let oLat = null, oLng = null, dLat = null, dLng = null;

    if (mode === "departures") {
      oLat = ctxPos ? ctxPos.lat : null;
      oLng = ctxPos ? ctxPos.lng : null;
      dLat = otherLat;
      dLng = otherLng;
    } else {
      oLat = otherLat;
      oLng = otherLng;
      dLat = ctxPos ? ctxPos.lat : null;
      dLng = ctxPos ? ctxPos.lng : null;
    }

    const originCode =
      pickAny(flat, ["flight.airport.origin.code.iata", "departure.iataCode", "departure.iata", "dep_iata", "origin", "from"]) ||
      (mode === "departures" ? (state.context?.airport || "BRS") : "—") ||
      "—";
    const destCode =
      pickAny(flat, ["flight.airport.destination.code.iata", "arrival.iataCode", "arrival.iata", "arr_iata", "destination", "to"]) ||
      (mode === "arrivals" ? (state.context?.airport || "BRS") : "—") ||
      "—";


    if ((oLat == null || oLng == null) && originCode) {
      const c = getAirportCoords(originCode);
      if (c) { oLat = c.lat; oLng = c.lng; }
    }
    if ((dLat == null || dLng == null) && destCode) {
      const c = getAirportCoords(destCode);
      if (c) { dLat = c.lat; dLng = c.lng; }
    }

    const hasOrigin = Number.isFinite(oLat) && Number.isFinite(oLng);
    const hasDest = Number.isFinite(dLat) && Number.isFinite(dLng);
    if (els.mapHint) {
      els.mapHint.textContent = (hasOrigin && hasDest) ? `${originCode} → ${destCode}` : `${originCode} → ${destCode} (map unavailable)`;
    }
    renderMap(oLat, oLng, dLat, dLng, originCode ? String(originCode).toUpperCase() : originCode, destCode ? String(destCode).toUpperCase() : destCode);

    renderLeaveIndicator(flat);
    renderInboundLink(flat);
    renderWeather(flat);

    // Raw JSON
    if (els.rawJson) els.rawJson.textContent = JSON.stringify(flight, null, 2);
  }

  function renderStatusBadge(flight, flat) {
    if (!els.statusBadge) return;
    const rawStatus =
      pickAny(flat, ["status", "flight_status", "arrival.status", "departure.status", "flight.status", "info.status"]) || "Unknown";

    const friendlyStatus = (() => {
      const st = String(rawStatus).toLowerCase();
      if (st.includes("cancel")) return "Cancelled";
      if (st.includes("delay")) return "Delayed";
      if (st.includes("boarding")) return "Boarding";
      if (st.includes("depart")) return "Departed";
      if (st.includes("land")) return "Landed";
      if (st.includes("scheduled") || st.includes("on time")) return "On time";
      return rawStatus;
    })();

    const status = friendlyStatus;

    // original status value (kept via rawStatus)
    // const status =
      pickAny(flat, ["status", "flight_status", "arrival.status", "departure.status", "flight.status", "info.status"]) || "Unknown";

    const st = String(status).toLowerCase();
    let cls = "neutral";
    if (st.includes("cancel")) cls = "bad";
    else if (st.includes("delay")) cls = "warn";
    else if (st.includes("on time") || st.includes("scheduled") || st.includes("boarding") || st.includes("active") || st.includes("departed") || st.includes("landed"))
      cls = "good";

    els.statusBadge.className = `badge ${cls}`;
    els.statusBadge.textContent = status;
  }

  function renderKpis(flight, flat, changed) {
    const kpis = [
      {
        label: "Scheduled",
        value: fmtTime(pickAny(flat, ["departure.scheduledTime", "departure.scheduled", "scheduled_departure", "departure_time", "scheduledDeparture"])) || "—",
      },
      {
        label: "Estimated",
        value: fmtTime(pickAny(flat, ["departure.estimatedTime", "departure.estimated", "estimated_departure", "estimatedDeparture"])) || "—",
      },
      { label: "Gate", value: pickAny(flat, ["departure.gate", "depGate", "gate", "departure_gate"]) || "—", paths: ["departure.gate", "depGate", "gate", "departure_gate"] },
      {
        label: "Terminal",
        value: bristolTerminal(),
        paths: [],
      },
    ];

    if (!els.kpis) return;

    els.kpis.innerHTML = kpis
      .map((k) => {
        const isChanged = (k.paths || []).some((p) => changed.has(p));
        const vClass = `value ${/^\d{2}:\d{2}/.test(k.value) ? "mono" : ""} ${isChanged ? "changed" : ""}`;
        return `<div class="kpi"><div class="label">${escapeHtml(k.label)}</div><div class="${vClass}">${escapeHtml(String(k.value))}</div></div>`;
      })
      .join("");
  }

  function renderKvPanels(flight, flat, changed) {
    const depPairs = [
      kv("Airport", pickAny(flat, ["departure.iataCode", "departure.iata", "dep_iata", "origin", "from"]), ["departure.iataCode", "departure.iata", "dep_iata", "origin", "from"]),
      kv("Scheduled", fmtTime(pickAny(flat, ["departure.scheduledTime", "departure.scheduled", "scheduled_departure", "departure_time"])), [
        "departure.scheduledTime",
        "departure.scheduled",
        "scheduled_departure",
        "departure_time",
      ]),
      kv("Estimated", fmtTime(pickAny(flat, ["departure.estimatedTime", "departure.estimated", "estimated_departure"])), [
        "departure.estimatedTime",
        "departure.estimated",
        "estimated_departure",
      ]),
      kv("Actual", fmtTime(pickAny(flat, ["departure.actualTime", "departure.actual", "actual_departure"])), ["departure.actualTime", "departure.actual", "actual_departure"]),
      kv("Terminal", bristolTerminal(), []),
      kv("Gate", pickAny(flat, ["departure.gate", "depGate", "departure_gate", "gate"]), ["departure.gate", "depGate", "departure_gate", "gate"]),
      kv("Check-in", pickAny(flat, ["departure.checkin", "checkin"]), ["departure.checkin", "checkin"]),
      kv("Stand", pickAny(flat, ["departure.stand", "stand"]), ["departure.stand", "stand"]),
    ].filter((x) => x.v);

    const arrPairs = [
      kv("Airport", pickAny(flat, ["arrival.iataCode", "arrival.iata", "arr_iata", "destination", "to"]), ["arrival.iataCode", "arrival.iata", "arr_iata", "destination", "to"]),
      kv("Scheduled", fmtTime(pickAny(flat, ["arrival.scheduledTime", "arrival.scheduled", "scheduled_arrival", "arrival_time"])), [
        "arrival.scheduledTime",
        "arrival.scheduled",
        "scheduled_arrival",
        "arrival_time",
      ]),
      kv("Estimated", fmtTime(pickAny(flat, ["arrival.estimatedTime", "arrival.estimated", "estimated_arrival"])), ["arrival.estimatedTime", "arrival.estimated", "estimated_arrival"]),
      kv("Actual", fmtTime(pickAny(flat, ["arrival.actualTime", "arrival.actual", "actual_arrival"])), ["arrival.actualTime", "arrival.actual", "actual_arrival"]),
      kv("Terminal", bristolTerminal(), []),
      kv("Gate", pickAny(flat, ["arrival.gate", "arrGate", "arrival_gate"]), ["arrival.gate", "arrGate", "arrival_gate"]),
      kv("Baggage", pickAny(flat, ["arrival.baggage", "baggage"]), ["arrival.baggage", "baggage"]),
    ].filter((x) => x.v);

    if (els.depKv) els.depKv.innerHTML = depPairs.map((p) => kvRow(p, changed)).join("") || `<div class="small">No departure details available.</div>`;
    if (els.arrKv) els.arrKv.innerHTML = arrPairs.map((p) => kvRow(p, changed)).join("") || `<div class="small">No arrival details available.</div>`;
  }

  function kv(k, v, paths) {
    return { k, v, paths: paths || [] };
  }

  function bristolTerminal(){ return "1"; }

  function kvRow(p, changed) {
    const changedCls = p.paths.some((x) => changed.has(x)) ? "changed" : "";
    return `<div class="k">${escapeHtml(p.k)}</div><div class="v ${changedCls}">${escapeHtml(String(p.v))}</div>`;
  }

  // ---------- Map ----------
  function pickNumber(flat, paths) {
    for (const p of paths) {
      if (flat[p] !== undefined && flat[p] !== null && String(flat[p]).trim() !== "") {
        const n = Number(flat[p]);
        if (!Number.isNaN(n)) return n;
      }
    }
    return null;
  }

  
  function haversineKm(lat1, lon1, lat2, lon2){
    const R = 6371;
    const toRad = (d)=> (d*Math.PI)/180;
    const dLat = toRad(lat2-lat1);
    const dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.min(1, Math.sqrt(a)));
  }

function renderMap(oLat, oLng, dLat, dLng, originCode, destCode) {
    // Draw a simple SVG route map (equirectangular projection).
    const svg = els.mapEl;
    if (!svg) return;

    const w = 1000, h = 420; // viewBox units

    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // SVG helper
    const make = (name, attrs = {}) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", name);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      return el;
    };

    // Background
    svg.appendChild(make("rect", { x: 0, y: 0, width: w, height: h, fill: "rgba(15,26,46,0.35)" }));

    // Grid
    for (let i = 1; i < 6; i++) {
      svg.appendChild(make("line", { x1: (w / 6) * i, y1: 0, x2: (w / 6) * i, y2: h, stroke: "rgba(157,176,208,0.08)", "stroke-width": 1 }));
    }
    for (let i = 1; i < 4; i++) {
      svg.appendChild(make("line", { x1: 0, y1: (h / 4) * i, x2: w, y2: (h / 4) * i, stroke: "rgba(157,176,208,0.08)", "stroke-width": 1 }));
    }

    const isNum = (n) => typeof n === "number" && isFinite(n);
    if (!isNum(oLat) || !isNum(oLng) || !isNum(dLat) || !isNum(dLng)) {
      const t = make("text", { x: w / 2, y: h / 2, "text-anchor": "middle", "dominant-baseline": "middle", fill: "rgba(157,176,208,0.9)", "font-size": 20, "font-weight": 900 });
      t.textContent = `${originCode || "—"} → ${destCode || "—"}`;
      svg.appendChild(t);
      return;
    }

    const proj = (lat, lng) => {
      const x = ((lng + 180) / 360) * w;
      const y = ((90 - lat) / 180) * h;
      return { x, y };
    };

    const a = proj(oLat, oLng);
    const b = proj(dLat, dLng);

    // Line
    svg.appendChild(make("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "rgba(78,161,255,0.95)", "stroke-width": 4, "stroke-linecap": "round" }));

    // Endpoints
    const endpoint = (pt, label, side) => {
      svg.appendChild(make("circle", { cx: pt.x, cy: pt.y, r: 12, fill: "rgba(78,161,255,0.20)" }));
      svg.appendChild(make("circle", { cx: pt.x, cy: pt.y, r: 7, fill: "rgba(255,255,255,0.95)" }));
      const dx = side === "left" ? -14 : 14;
      const anchor = side === "left" ? "end" : "start";
      const t = make("text", { x: pt.x + dx, y: pt.y - 12, "text-anchor": anchor, fill: "rgba(235,245,255,0.95)", "font-size": 16, "font-weight": 950 });
      t.textContent = label || "—";
      svg.appendChild(t);
    };

    endpoint(a, originCode, "right");
    endpoint(b, destCode, "left");

    const km = haversineKm(oLat, oLng, dLat, dLng);
    if (Number.isFinite(km)) {
      const t2 = make("text", { x: w / 2, y: h - 16, "text-anchor": "middle", fill: "rgba(157,176,208,0.85)", "font-size": 13, "font-weight": 800 });
      t2.textContent = `${Math.round(km).toLocaleString()} km (great-circle)`;
      svg.appendChild(t2);
    }
  }

  // ---------- Identity & matching ----------
  function deriveIdentity(f) {
    const flightNo = f?.flight?.iataNumber || f?.flight_iata || f?.flightNumber || f?.number || f?.flight_no || null;
    const dep = f?.departure?.iataCode || f?.departure?.iata || f?.dep_iata || f?.origin || f?.from || null;
    const arr = f?.arrival?.iataCode || f?.arrival?.iata || f?.arr_iata || f?.destination || f?.to || null;

    const schedDep =
      f?.departure?.scheduledTime || f?.departure?.scheduled || f?.departure_time || f?.scheduled_departure || f?.scheduledDeparture || null;
    const schedArr = f?.arrival?.scheduledTime || f?.arrival?.scheduled || f?.arrival_time || f?.scheduled_arrival || f?.scheduledArrival || null;

    return { flightNo, dep, arr, schedDep, schedArr };
  }

  function scoreMatch(a, b) {
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

  function normalize(x) {
    return String(x).trim().toUpperCase();
  }
  function timeDistanceMinutes(t1, t2) {
    const a = toDate(t1);
    const b = toDate(t2);
    if (!a || !b) return null;
    return Math.abs(a.getTime() - b.getTime()) / 60000;
  }

  // ---------- Flatten & utilities ----------
  function flattenObject(obj, prefix = "", out = {}) {
    if (obj === null || obj === undefined) return out;
    if (typeof obj !== "object") {
      out[prefix || "value"] = obj;
      return out;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => {
        const p = prefix ? `${prefix}[${i}]` : `[${i}]`;
        flattenObject(v, p, out);
      });
      return out;
    }
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") flattenObject(v, p, out);
      else out[p] = v;
    }
    return out;
  }

  function diffKeys(prev, next) {
    const changed = new Set();
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const k of keys) {
      const a = prev[k];
      const b = next[k];
      if (!deepEqual(a, b)) changed.add(k);
    }
    return changed;
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    return String(a) === String(b);
  }

  function pickAny(flat, paths) {
    for (const p of paths) {
      if (flat[p] !== undefined && flat[p] !== null && String(flat[p]).trim() !== "") return flat[p];
    }
    return "";
  }

  function fmtTime(v) {
    const d = toDate(v);
    if (!d) return v ? String(v) : "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const n = Number(v);
    if (!Number.isNaN(n) && String(v).length >= 10) {
      return new Date(n < 2e10 ? n * 1000 : n);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }


  // ---------- Share / Calendar / Notifications ----------
  function shareFlight(){
    const id = deriveIdentity(state.current || {});
    const title = `${id.flightNo || "Flight"} • ${id.dep || "—"}→${id.arr || "—"}`;
    const url = window.location.href;
    const text = `Live status: ${title}`;
    if (navigator.share) {
      navigator.share({ title, text, url }).catch(()=>{});
    } else {
      navigator.clipboard?.writeText(url).catch(()=>{});
      flashStatus("good", "Link copied");
    }
  }

  function downloadICS(){
    const f = state.current;
    if (!f) return;
    const flat = flattenObject(f);
    const id = deriveIdentity(f);
    const flightNo = id.flightNo || "Flight";
    const dep = id.dep || "—";
    const arr = id.arr || "—";

    const depDT = toICSDate(toDate(pickAny(flat, ["departure.scheduledTime","departure.scheduled","scheduled_departure","departure_time","scheduledDeparture"])));
    const arrDT = toICSDate(toDate(pickAny(flat, ["arrival.scheduledTime","arrival.scheduled","scheduled_arrival","arrival_time","scheduledArrival"])));

    const uid = `${flightNo}-${dep}-${arr}-${depDT}@brs-flights`;
    const now = toICSDate(new Date());
    const summary = `${flightNo} ${dep}→${arr}`;
    const desc = `Flight tracking link: ${window.location.href}`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BRS Flights//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      depDT ? `DTSTART:${depDT}` : "",
      arrDT ? `DTEND:${arrDT}` : "",
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(desc)}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${flightNo}_${dep}_${arr}.ics`.replace(/\s+/g,"_");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function toICSDate(d){
    if (!d || isNaN(d.getTime())) return "";
    const pad = (n)=>String(n).padStart(2,"0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }
  function escapeICS(s){
    return String(s).replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
  }

  function notifyKey(){
    const id = deriveIdentity(state.current || {});
    return `brs_notify_${normalize(id.flightNo || "flight")}_${normalize(id.dep || "")}_${normalize(id.arr || "")}`;
  }
  function loadNotifyState(){
    const raw = safeGetLocal(notifyKey());
    state.notifyEnabled = raw === "1";
    updateNotifyButton();
  }
  function updateNotifyButton(){
    if (!els.notifyBtn) return;
    els.notifyBtn.textContent = state.notifyEnabled ? "Notifications: On" : "Notify me";
    els.notifyBtn.className = state.notifyEnabled ? "btn primary" : "btn primary";
  }
  async function toggleNotify(){
    if (!("Notification" in window)) { flashStatus("warn","Not supported"); return; }
    if (!state.notifyEnabled){
      const perm = await Notification.requestPermission().catch(()=> "denied");
      if (perm !== "granted") { flashStatus("warn","Permission denied"); return; }
      state.notifyEnabled = true;
      safeSetLocal(notifyKey(),"1");
      flashStatus("good","Notifications on");
    } else {
      state.notifyEnabled = false;
      safeSetLocal(notifyKey(),"0");
      flashStatus("good","Notifications off");
    }
    updateNotifyButton();
  }
  function maybeNotify(prevFlat, flat){
    if (!state.notifyEnabled) return;
    const keys = ["departure.gate","depGate","gate","departure_gate","status","flight_status","departure.estimatedTime","departure.estimated","estimated_departure","arrival.estimatedTime","arrival.estimated","estimated_arrival"];
    const changed = keys.filter(k => String(prevFlat[k]||"") !== String(flat[k]||"") && (prevFlat[k] !== undefined || flat[k] !== undefined));
    if (!changed.length) return;
    const id = deriveIdentity(state.current || {});
    const title = `${id.flightNo || "Flight"} update`;
    const body = changed.slice(0,3).map(k => `${k}: ${String(flat[k] ?? "—")}`).join(" • ");
    const hash = title+"|"+body;
    if (state.lastNotifiedHash === hash) return;
    state.lastNotifiedHash = hash;
    try { new Notification(title, { body }); } catch {}
  }

  
  function estimateGateWalkMinutes(gate){
    // Bristol (single terminal) heuristics: closer gates tend to be lower numbers.
    // These are conservative, business-traveller-friendly estimates.
    const m = String(gate || "").match(/\d+/);
    if (!m) return null;
    const n = Number(m[0]);
    if (!Number.isFinite(n)) return null;
    if (n <= 10) return 3;
    if (n <= 20) return 5;
    if (n <= 30) return 7;
    return 9;
  }

  function formatCountdown(mins){
    if (mins === null || mins === undefined) return "—";
    if (!Number.isFinite(mins)) return "—";
    const sign = mins < 0 ? "-" : "";
    const m = Math.abs(Math.round(mins));
    const h = Math.floor(m/60);
    const mm = m % 60;
    if (h <= 0) return `${sign}${mm}m`;
    return `${sign}${h}h ${mm}m`;
  }

function renderLeaveIndicator(flat){
    if (!els.leaveCard) return;
    const rawStatus =
      pickAny(flat, ["status", "flight_status", "arrival.status", "departure.status", "flight.status", "info.status"]) || "Unknown";

    const friendlyStatus = (() => {
      const st = String(rawStatus).toLowerCase();
      if (st.includes("cancel")) return "Cancelled";
      if (st.includes("delay")) return "Delayed";
      if (st.includes("boarding")) return "Boarding";
      if (st.includes("depart")) return "Departed";
      if (st.includes("land")) return "Landed";
      if (st.includes("scheduled") || st.includes("on time")) return "On time";
      return rawStatus;
    })();

    const status = friendlyStatus;

    // original status value (kept via rawStatus)
    // const status = (pickAny(flat, ["status","flight_status","arrival.status","departure.status"]) || "Unknown").toLowerCase();
    const gate = pickAny(flat, ["departure.gate","depGate","gate","departure_gate"]) || "";
    const depSched = toDate(pickAny(flat, ["departure.scheduledTime","departure.scheduled","scheduled_departure","departure_time","scheduledDeparture"]));
    const depEst = toDate(pickAny(flat, ["departure.estimatedTime","departure.estimated","estimated_departure","estimatedDeparture"])) || depSched;

    const minsToDep = depEst ? (depEst.getTime() - Date.now())/60000 : null;

    // Last call heuristic (common airline practice): ~15 minutes before departure.
    const lastCallMins = depEst ? minsToDep - 15 : null;

    const walkMins = estimateGateWalkMinutes(gate);

    let title="On track", msg="Terminal 1 • Gate TBA", cls="good";

    if (status.includes("cancel")) {
      title="Do not travel";
      msg="This flight is cancelled.";
      cls="bad";
    } else if (status.includes("boarding")) {
      title="Go now";
      msg=gate ? `Boarding at Gate ${gate}.` : "Boarding in progress.";
      cls="warn";
    } else if (minsToDep !== null && minsToDep <= 30) {
      title="Head airside";
      msg=gate ? `Departure soon • Gate ${gate}` : "Departure soon • check gate";
      cls="warn";
    } else if (status.includes("delay")) {
      title="You have time";
      msg="Delayed — monitor for updates.";
      cls="good";
    } else {
      title="On track";
      msg=gate ? `Gate ${gate} • Terminal 1` : "Terminal 1 • Gate TBA";
      cls="good";
    }

    const depLabel = (minsToDep === null) ? "—" : (minsToDep < -1 ? "Departed" : `${formatCountdown(minsToDep)} to depart`);
    const lastCallLabel = (lastCallMins === null) ? "—" : (lastCallMins < 0 ? "Last call passed" : `${formatCountdown(lastCallMins)} to last call`);
    const walkLabel = (walkMins === null) ? "—" : `${walkMins} min walk`;

    els.leaveCard.innerHTML = `
      <div class="title">${escapeHtml(title)}</div>
      <div class="msg">${escapeHtml(msg)}</div>
      <div class="leave-metrics">
        <div class="pill"><span class="k">Walk</span><span class="v">${escapeHtml(walkLabel)}</span></div>
        <div class="pill"><span class="k">Last call</span><span class="v">${escapeHtml(lastCallLabel)}</span></div>
        <div class="pill"><span class="k">Departure</span><span class="v">${escapeHtml(depLabel)}</span></div>
      </div>
    `;
    els.leaveCard.style.borderColor =
      cls==="bad" ? "rgba(255,93,93,.35)" :
      cls==="warn" ? "rgba(255,176,32,.35)" :
      "rgba(54,193,140,.35)";
  }

  function renderInboundLink(flat){
    if (!els.inboundLinkLine) return;
    const reg = pickAny(flat, ["aircraft.regNumber","flight.aircraft.registration","aircraft.registration","registration"]);
    const icao24 = pickAny(flat, ["aircraft.icao24","icao24"]);
    const code = pickAny(flat, ["aircraft.icaoCode","flight.aircraft.model.code","aircraft.model.code"]);
    if (!reg && !icao24) { els.inboundLinkLine.textContent=""; return; }
    const q = encodeURIComponent(reg || icao24);
    els.inboundLinkLine.innerHTML = `<a class="small" href="https://www.flightradar24.com/data/aircraft/${q}" target="_blank" rel="noreferrer">Track aircraft (${escapeHtml(reg || icao24)}${code ? ` • ${escapeHtml(code)}`:""})</a>`;
  }

  
  // ---------- Holidaymaker-friendly features ----------
  function getSecurityEstimateMinutes(){
    try{
      const raw = safeGetLocal("brs_security_samples");
      if (!raw) return null;
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || !list.length) return null;
      const cutoff = Date.now() - 14*24*60*60*1000;
      const recent = list.filter(s => Date.parse(s.when) >= cutoff);
      const use = recent.length >= 3 ? recent : list;
      const avg = use.reduce((a,b)=>a+Number(b.minutes||0),0)/use.length;
      return Math.round(avg);
    } catch { return null; }
  }

  async function renderWeather(flat){
    if (!els.weatherBox) return;

    const mode = (state.context && state.context.mode) ? state.context.mode : "departures";
    let brs = (state.context && state.context.airportPos) ? state.context.airportPos : null;
    if (!brs || brs.lat == null || brs.lng == null) {
      const c = getAirportCoords("BRS");
      if (c) brs = c;
    }

    const otherLat = pickNumber(flat, [
      mode === "departures" ? "flight.airport.destination.position.latitude" : "flight.airport.origin.position.latitude",
      "flight.airport.destination.position.latitude",
      "flight.airport.origin.position.latitude",
      "airport.destination.position.latitude",
      "airport.origin.position.latitude",
      "destination.position.latitude",
      "origin.position.latitude"
    ]);
    const otherLng = pickNumber(flat, [
      mode === "departures" ? "flight.airport.destination.position.longitude" : "flight.airport.origin.position.longitude",
      "flight.airport.destination.position.longitude",
      "flight.airport.origin.position.longitude",
      "airport.destination.position.longitude",
      "airport.origin.position.longitude",
      "destination.position.longitude",
      "origin.position.longitude"
    ]);

    const otherCode =
      pickAny(flat, [
        mode === "departures" ? "flight.airport.destination.code.iata" : "flight.airport.origin.code.iata",
        "destination", "to", "origin", "from"
      ]) || "Destination";

    if (els.wxHint) els.wxHint.textContent = `Bristol (BRS) • ${otherCode}`;

    let otherLat2 = otherLat;
    let otherLng2 = otherLng;
    if ((otherLat2 === null || otherLng2 === null) && otherCode) {
      const c = getAirportCoords(otherCode);
      if (c) { otherLat2 = c.lat; otherLng2 = c.lng; }
    }

    if ((!brs || brs.lat == null || brs.lng == null) && (otherLat2 === null || otherLng2 === null)) {
      els.weatherBox.innerHTML = `<div class="small">Weather unavailable (missing coordinates).</div>`;
      return;
    }

    els.weatherBox.innerHTML = `<div class="small">Loading weather…</div>`;

    async function fetchWx(lat, lng){
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lng));
      url.searchParams.set("current_weather", "true");
      url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
      url.searchParams.set("timezone", "auto");
      const res = await fetch(url.toString(), { cache:"no-store" });
      if (!res.ok) throw new Error("weather");
      return res.json();
    }

    function wxCard(title, data){
      const cur = data?.current_weather;
      const daily = data?.daily;
      const todayMax = daily?.temperature_2m_max?.[0];
      const todayMin = daily?.temperature_2m_min?.[0];
      const rain = daily?.precipitation_probability_max?.[0];

      return `
        <div class="callout" style="margin-top:0;">
          <div class="hero-title">${escapeHtml(title)}</div>
          <div class="panel-grid" style="margin-top:10px;">
            <div class="kpi">
              <div class="label">Now</div>
              <div class="value mono">${cur ? `${Math.round(cur.temperature)}°C` : "—"}</div>
              <div class="small">${cur ? `Wind ${Math.round(cur.windspeed)} km/h` : ""}</div>
            </div>
            <div class="kpi">
              <div class="label">Today</div>
              <div class="value mono">${(todayMin!==undefined && todayMax!==undefined) ? `${Math.round(todayMin)}–${Math.round(todayMax)}°C` : "—"}</div>
              <div class="small">${rain !== undefined ? `Rain chance ${Math.round(rain)}%` : ""}</div>
            </div>
          </div>
        </div>
      `;
    }

    function cacheKey(lat,lng){ return `wx_${Number(lat).toFixed(2)}_${Number(lng).toFixed(2)}`; }
    function getCached(lat,lng){
      try{
        const raw = safeGetLocal(cacheKey(lat,lng));
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (Date.now() - cached.t < 15*60*1000) return cached.data;
      } catch {}
      return null;
    }
    function setCached(lat,lng,data){
      try{ safeSetLocal(cacheKey(lat,lng), JSON.stringify({ t: Date.now(), data })); } catch {}
    }

    try{
      let brsData = null;
      let otherData = null;

      if (brs && brs.lat != null && brs.lng != null){
        brsData = getCached(brs.lat, brs.lng) || await fetchWx(brs.lat, brs.lng);
        setCached(brs.lat, brs.lng, brsData);
      }
      if (otherLat2 !== null && otherLng2 !== null){
        otherData = getCached(otherLat2, otherLng2) || await fetchWx(otherLat2, otherLng2);
        setCached(otherLat2, otherLng2, otherData);
      }

      const parts = [];
      if (brsData) parts.push(wxCard("Bristol (BRS)", brsData));
      if (otherData) parts.push(wxCard(otherCode, otherData));

      els.weatherBox.innerHTML = parts.join('<div style="height:12px"></div>') + `<div class="small" style="margin-top:10px;">Powered by Open-Meteo (best effort).</div>`;
    } catch (e){
      els.weatherBox.innerHTML = `<div class="small">Weather unavailable right now.</div>`;
    }
  }

  function openGroupMode(){
    if (!els.groupModal || !state.current) return;
    els.groupModal.classList.add("show");
    els.groupModal.setAttribute("aria-hidden","false");

    const id = deriveIdentity(state.current || {});
    const title = `${id.flightNo || "Flight"} • ${id.dep || "—"}→${id.arr || "—"}`;
    els.groupTitle.textContent = title;
    els.groupSubtitle.textContent = "Bristol Airport (Terminal 1)";

    updateGroupCountdown();
    if (state.groupTimer) clearInterval(state.groupTimer);
    state.groupTimer = setInterval(updateGroupCountdown, 1000);
  }

  function closeGroupMode(){
    if (!els.groupModal) return;
    els.groupModal.classList.remove("show");
    els.groupModal.setAttribute("aria-hidden","true");
    if (state.groupTimer) clearInterval(state.groupTimer);
    state.groupTimer = null;
  }

  function updateGroupCountdown(){
    if (!state.current) return;
    const flat = flattenObject(state.current);
    const gate = pickAny(flat, ["departure.gate","depGate","gate","departure_gate"]) || "";
    const walk = estimateGateWalkMinutes(gate);
    const depSched = toDate(pickAny(flat, ["departure.scheduledTime","departure.scheduled","scheduled_departure","departure_time","scheduledDeparture"]));
    const depEst = toDate(pickAny(flat, ["departure.estimatedTime","departure.estimated","estimated_departure","estimatedDeparture"])) || depSched;
    const minsToDep = depEst ? (depEst.getTime() - Date.now())/60000 : null;
    const lastCallMins = depEst ? minsToDep - 15 : null;

    if (els.groupCountdown) els.groupCountdown.textContent = lastCallMins !== null ? formatCountdown(lastCallMins) : "—";
    if (els.groupNext) {
      if (lastCallMins === null) els.groupNext.textContent = "Last call: unavailable";
      else if (lastCallMins < 0) els.groupNext.textContent = "Last call has passed — head to the gate.";
      else els.groupNext.textContent = `to last call • depart in ${formatCountdown(minsToDep)} • Terminal 1`;
    }
    if (els.groupPills){
      const pills = [
        {k:"Gate", v: gate ? gate : "TBA"},
        {k:"Walk", v: walk ? `${walk} min` : "—"},
        {k:"Departure", v: depEst ? depEst.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "—"}
      ];
      els.groupPills.innerHTML = pills.map(x => `<div class="pill"><span class="k">${escapeHtml(x.k)}</span><span class="v">${escapeHtml(x.v)}</span></div>`).join("");
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();