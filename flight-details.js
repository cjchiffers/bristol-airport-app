
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

  // Safe storage wrappers
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
  }

  // Helper functions
  function flattenObject(obj) {
    const result = {};
    for (const i in obj) {
      if ((typeof obj[i]) === 'object' && !Array.isArray(obj[i])) {
        const temp = flattenObject(obj[i]);
        for (const j in temp) {
          result[`${i}.${j}`] = temp[j];
        }
      } else {
        result[i] = obj[i];
      }
    }
    return result;
  }

  function diffKeys(prevFlat, flat) {
    const changes = new Set();
    for (const key in flat) {
      if (flat[key] !== prevFlat[key]) {
        changes.add(key);
      }
    }
    return changes;
  }

  function fmtTime(time) {
    if (!time) return "—";
    const date = new Date(time);
    return date.toLocaleString("en-GB", { hour: '2-digit', minute: '2-digit' });
  }

  // Render function
  function render(flight, prev) {
    if (!flight) return;

    const now = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
    if (els.lastUpdated) els.lastUpdated.textContent = `Last updated: ${now}`;

    const flat = flattenObject(flight);
    const prevFlat = prev ? flattenObject(prev) : null;
    const changed = prevFlat ? diffKeys(prevFlat, flat) : new Set();

    // Example: Render the flight headline with flight number and route
    const route = `${flight.dep || "—"} → ${flight.arr || "—"}`;
    const displayNo = flight.flightNo || "—";
    if (els.headline) els.headline.textContent = `${displayNo} • ${route}`;

    // Render other fields, like status, departure, and arrival times
    const depTime = fmtTime(flat["flight.time.scheduled.departure"]);
    const arrTime = fmtTime(flat["flight.time.scheduled.arrival"]);
    if (els.depKv) els.depKv.textContent = depTime;
    if (els.arrKv) els.arrKv.textContent = arrTime;

    // Update the status badge
    if (els.statusBadge) {
        els.statusBadge.className = "badge good"; // Example: dynamically set status
        els.statusBadge.textContent = flight.status || "On time";
    }
  }

  // Initialize and other functions remain as is...
})();
