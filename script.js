
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

// Mapping of airport codes to city names
const airportCodeToCityName = {
    "BRS": "Bristol",
    "LHR": "London Heathrow",
    "LGW": "London Gatwick",
    "DUB": "Dublin",
    "JFK": "New York",
    "SFO": "San Francisco",
    "ORD": "Chicago",
    "CDG": "Paris",
    "AMS": "Amsterdam",
    // Add more airport codes and cities as needed
};

// --- FlightAPI key helper (stores in localStorage) ---
function safeSetSession(key, value){
  try { sessionStorage.setItem(key, value); return true; } catch { return false; }
}

function getFlightApiKey() {
  let k = localStorage.getItem("flightapi_key");
  if (!k) {
    k = prompt("Enter your FlightAPI.io API key:");
    if (k) localStorage.setItem("flightapi_key", k);
  }
  return k;
}

// Store selected flight + context and open details page
function openFlightDetailsWithStorage(flight, context) {
  const key = `flight_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  safeSetSession(key, JSON.stringify({ flight, context }));
  window.location.href = `flight-details.html?key=${encodeURIComponent(key)}`;
}



// Function to get city name from airport code
function getCityName(airportCode) {
    return airportCodeToCityName[airportCode] || airportCode; // Return the city name or fallback to the code
}

// Function to get current time minus 1 hour (returns timestamp)
function getCurrentTimeMinusOneHour() {
    const now = new Date();
    now.setHours(now.getHours() - 1);  // Subtract 1 hour from the current time
    return now.getTime();  // Return timestamp in milliseconds
}

// Fetch departure data
fetch('https://aviation-edge.com/v2/public/timetable?key=26071f-14ef94&iataCode=BRS&type=departure')
    .then(response => response.json())
    .then(data => {
        console.log('Departure data:', data);
        if (data && Array.isArray(data)) {
            const filteredDepartures = filterFlightsByTime(data);
            displayDepartures(filteredDepartures);
        } else {
            console.log("No departure data found.");
        }
    })
    .catch(error => console.error('Error fetching departure data:', error));

// Fetch arrival data
fetch('https://aviation-edge.com/v2/public/timetable?key=26071f-14ef94&iataCode=BRS&type=arrival')
    .then(response => response.json())
    .then(data => {
        console.log('Arrival data:', data);
        if (data && Array.isArray(data)) {
            const filteredArrivals = filterFlightsByTime(data);
            displayArrivals(filteredArrivals);
        } else {
            console.log("No arrival data found.");
        }
    })
    .catch(error => console.error('Error fetching arrival data:', error));

// Filter flights that are after the current time minus 1 hour
function filterFlightsByTime(flights) {
    const currentTimeMinusOneHour = getCurrentTimeMinusOneHour();
    return flights.filter(flight => {
        const scheduledTime = new Date(flight.departure.scheduledTime || flight.arrival.scheduledTime);
        return scheduledTime >= currentTimeMinusOneHour;
    });
}

// Display departure data in table
function displayDepartures(departures) {
    let departureTable = document.getElementById('departureTable').getElementsByTagName('tbody')[0];
    departures.forEach(flight => {
        let row = departureTable.insertRow();
        row.innerHTML = `
            <td><button class="btn ghost flight-open">${(flight.flight && flight.flight.iataNumber) ? flight.flight.iataNumber : (flight.flight_iata || flight.flightNumber || "N/A")}</button></td>
            <td><button class="btn ghost flight-save" title="Save">☆</button></td>
            <td>${getAirlineLogo(flight.airline.iataCode, flight.airline.name)}</td>
            <td>${getCityName(flight.arrival.iataCode) || 'N/A'}</td> <!-- Show city name instead of airport code -->
            <td>${convertToLondonTime(flight.departure.scheduledTime) || 'N/A'}</td>
            <td>${getFlightStatus(flight.departure) || 'N/A'}</td> <!-- Enhanced status -->
        `;
    
        const openBtn = row.querySelector('.flight-open');
        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openFlightDetailsWithStorage(flight, {mode:"departures", airport:"BRS", day:1, airportPos: window.__brsAirportPos});
            });
        }
        const saveBtn = row.querySelector('.flight-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                saveFlight(flight, {mode:"departures", airport:"BRS", day:1, airportPos: window.__brsAirportPos});
                saveBtn.textContent = "★";
            });
        }
});
}

// Display arrival data in table
function displayArrivals(arrivals) {
    let arrivalTable = document.getElementById('arrivalTable').getElementsByTagName('tbody')[0];
    arrivals.forEach(flight => {
        let row = arrivalTable.insertRow();
        row.innerHTML = `
            <td><button class="btn ghost flight-open">${(flight.flight && flight.flight.iataNumber) ? flight.flight.iataNumber : (flight.flight_iata || flight.flightNumber || "N/A")}</button></td>
            <td><button class="btn ghost flight-save" title="Save">☆</button></td>
            <td>${getAirlineLogo(flight.airline.iataCode, flight.airline.name)}</td>
            <td>${getCityName(flight.departure.iataCode) || 'N/A'}</td> <!-- Show city name instead of airport code -->
            <td>${convertToLondonTime(flight.arrival.scheduledTime) || 'N/A'}</td>
            <td>${getFlightStatus(flight.arrival) || 'N/A'}</td> <!-- Enhanced status -->
        `;
    
        const openBtn = row.querySelector('.flight-open');
        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openFlightDetailsWithStorage(flight, {mode:"arrivals", airport:"BRS", day:1, airportPos: window.__brsAirportPos});
            });
        }
        const saveBtn = row.querySelector('.flight-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                saveFlight(flight, {mode:"arrivals", airport:"BRS", day:1, airportPos: window.__brsAirportPos});
                saveBtn.textContent = "★";
            });
        }
});
}

// Helper function to convert UTC time to London Time (with timezone offset)
function convertToLondonTime(utcTime) {
    const options = { timeZone: "Europe/London", hour12: false, hour: "2-digit", minute: "2-digit" };
    return new Date(utcTime).toLocaleString('en-GB', options); // Show time in 24-hour format
}

// Helper function to get airline logo URL (using IATA code) and display it
function getAirlineLogo(iataCode, airlineName) {
    const logoUrl = `https://www.gstatic.com/flights/airline_logos/70px/${iataCode}.png`;
    return `
        <img src="${logoUrl}" alt="${airlineName} logo" class="airline-logo" onError="this.onerror=null; this.src='default-logo.png';" />
        ${iataCode ? '' : airlineName} <!-- If logo fails, show airline text -->
    `;
}

// Helper function to determine flight status (on time, delayed, cancelled, go to gate, boarding, etc.)
function getFlightStatus(flight) {
    if (flight.cancelled) {
        return "Cancelled";
    } else if (flight.boarding) {
        return "Boarding";
    } else if (flight.gate) {
        return `Go to Gate ${flight.gate}`; // If gate info is available
    } else if (flight.delay) {
        return `Delayed ${flight.delay} minutes`;
    } else if (new Date(flight.scheduledTime) > new Date()) {
        return "On time";
    }
    return "Active"; // Default fallback
}



// --- Tabs: Departures / Arrivals ---
(function initTabs(){
  const btns = document.querySelectorAll(".tab-btn");
  const panels = {
    departures: document.getElementById("tab-departures"),
    arrivals: document.getElementById("tab-arrivals"),
  };
  if (!btns.length || !panels.departures || !panels.arrivals) return;

  function setTab(name){
    btns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    Object.entries(panels).forEach(([k, el]) => el.classList.toggle("active", k === name));
  }

  btns.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  setTab("departures");
})();

// =======================
// Product features (MVP+)
// =======================
function safeGetLocal(key){ try { return localStorage.getItem(key);} catch { return null; } }
function safeSetLocal(key, value){ try { localStorage.setItem(key,value); return true;} catch { return false; } }
function escapeHtml(s){ return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

// Search filtering
(function initSearch(){
  const input = document.getElementById("searchInput");
  const meta = document.getElementById("searchMeta");
  if (!input) return;
  const normalize = (s) => String(s || "").toLowerCase();
  function filterTables(q){
    const qn = normalize(q).trim();
    const tables = [document.getElementById("departureTable"), document.getElementById("arrivalTable")].filter(Boolean);
    let shown = 0, total = 0;
    tables.forEach(tbl => {
      Array.from(tbl.querySelectorAll("tbody tr")).forEach(r => {
        total += 1;
        const ok = !qn || normalize(r.innerText).includes(qn);
        r.style.display = ok ? "" : "none";
        if (ok) shown += 1;
      });
    });
    if (meta) meta.textContent = qn ? `${shown} of ${total} flights` : "";
  }
  input.addEventListener("input", () => filterTables(input.value));
})();

// Saved flights
function getSavedFlights(){
  const raw = safeGetLocal("brs_saved_flights");
  if (!raw) return [];
  try { const x = JSON.parse(raw); return Array.isArray(x) ? x : []; } catch { return []; }
}
function setSavedFlights(list){ safeSetLocal("brs_saved_flights", JSON.stringify(list.slice(0, 30))); }
function saveFlight(flight, context){
  const tripLabel = prompt('Trip label (optional) — e.g. “Barcelona hen do”') || '';
  const idObj = (typeof deriveIdentity === "function") ? deriveIdentity(flight) : {};
  const flightNo = idObj.flightNo || (flight.flight && flight.flight.iataNumber) || flight.flight_iata || flight.flightNumber || "—";
  const dep = idObj.dep || (flight.departure && (flight.departure.iataCode || flight.departure.iata)) || "—";
  const arr = idObj.arr || (flight.arrival && (flight.arrival.iataCode || flight.arrival.iata)) || "—";
  const label = `${flightNo} • ${dep}→${arr}` + (tripLabel.trim() ? ` • ${tripLabel.trim()}` : '');
  const key = `saved_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const list = getSavedFlights();
  const next = [{ id:key, label, tripLabel: tripLabel.trim(), context, flight }, ...list.filter(x => x.label !== label)];
  setSavedFlights(next);
  renderSavedBar();
}
function removeSaved(id){ setSavedFlights(getSavedFlights().filter(x => x.id !== id)); renderSavedBar(); }
function renderSavedBar(){
  const bar = document.getElementById("savedBar");
  if (!bar) return;
  const list = getSavedFlights();
  if (!list.length){ bar.style.display="none"; bar.innerHTML=""; return; }
  bar.style.display="";
  bar.innerHTML = list.map(item => `
    <div class="chip" data-id="${item.id}">
      <span>${escapeHtml(item.label)}</span>
      <span class="x" title="Remove">×</span>
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
}
(function initSavedUI(){
  const btn = document.getElementById("savedBtn");
  const bar = document.getElementById("savedBar");
  if (!btn || !bar) return;
  btn.addEventListener("click", () => {
    const show = bar.style.display === "none";
    bar.style.display = show ? "" : "none";
    if (show) renderSavedBar();
  });
  renderSavedBar();
})();

// Install prompt
(function initInstall(){
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
})();

// Security wait time (local samples)
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
(function initSecurity(){
  const btn = document.getElementById("securityBtn");
  const panel = document.getElementById("securityPanel");
  if (!btn || !panel) return;
  function render(){
    const est = computeSecurityEstimate();
    const last = getSecuritySamples()[0];
    panel.innerHTML = `
      <div class="security-grid">
        <div class="card pad" style="box-shadow:none;">
          <div class="section-title"><h3>Estimated security wait</h3></div>
          <div class="kpi">
            <div class="label">Typical (local samples)</div>
            <div class="value mono">${est !== null ? `${est} min` : "—"}</div>
          </div>
          <div class="small">${last ? `Last report: ${new Date(last.when).toLocaleString()} (${last.minutes} min)` : "No reports yet — be the first."}</div>
        </div>
        <div class="card pad" style="box-shadow:none;">
          <div class="section-title"><h3>Report your wait</h3></div>
          <div class="row">
            <input id="secMinutes" type="number" min="0" max="120" placeholder="Minutes (e.g., 12)" />
            <button class="btn primary" id="secSubmit" type="button">Submit</button>
          </div>
          <div class="small">Stored on your device only. No account.</div>
        </div>
      </div>
    `;
    const submit = panel.querySelector("#secSubmit");
    const input = panel.querySelector("#secMinutes");
    if (submit && input){
      submit.addEventListener("click", () => {
        const v = Number(input.value);
        if (Number.isFinite(v) && v >= 0 && v <= 120){
          addSecuritySample(v);
          input.value = "";
          render();
        }
      });
    }
  }
  btn.addEventListener("click", () => {
    const show = panel.style.display === "none";
    panel.style.display = show ? "" : "none";
    if (show) render();
  });
})();
