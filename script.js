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
  sessionStorage.setItem(key, JSON.stringify({ flight, context }));
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
            <td><button class="btn ghost" onclick=\'openFlightDetailsWithStorage(flight, {mode:"departures", airport:"BRS", day:1})'>${(flight.flight && flight.flight.iataNumber) ? flight.flight.iataNumber : (flight.flight_iata || flight.flightNumber || "N/A")}</button></td>
            <td>${getAirlineLogo(flight.airline.iataCode, flight.airline.name)}</td>
            <td>${getCityName(flight.arrival.iataCode) || 'N/A'}</td> <!-- Show city name instead of airport code -->
            <td>${convertToLondonTime(flight.departure.scheduledTime) || 'N/A'}</td>
            <td>${getFlightStatus(flight.departure) || 'N/A'}</td> <!-- Enhanced status -->
        `;
    });
}

// Display arrival data in table
function displayArrivals(arrivals) {
    let arrivalTable = document.getElementById('arrivalTable').getElementsByTagName('tbody')[0];
    arrivals.forEach(flight => {
        let row = arrivalTable.insertRow();
        row.innerHTML = `
            <td><button class="btn ghost" onclick=\'openFlightDetailsWithStorage(flight, {mode:"arrivals", airport:"BRS", day:1})'>${(flight.flight && flight.flight.iataNumber) ? flight.flight.iataNumber : (flight.flight_iata || flight.flightNumber || "N/A")}</button></td>
            <td>${getAirlineLogo(flight.airline.iataCode, flight.airline.name)}</td>
            <td>${getCityName(flight.departure.iataCode) || 'N/A'}</td> <!-- Show city name instead of airport code -->
            <td>${convertToLondonTime(flight.arrival.scheduledTime) || 'N/A'}</td>
            <td>${getFlightStatus(flight.arrival) || 'N/A'}</td> <!-- Enhanced status -->
        `;
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
