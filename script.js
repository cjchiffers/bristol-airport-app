// Function to get airline logo URL (change this as needed)
function getAirlineLogoUrl(airlineIataCode) {
    return `/assets/logos/${airlineIataCode}.png`; // Adjust this path to where you store your logos
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
            <td><a href="flight-details.html?flight=${flight.flight.iataNumber}" class="flight-link">${flight.flight.iataNumber || 'N/A'}</a></td>
            <td><img src="${getAirlineLogoUrl(flight.airline.iataCode)}" alt="${flight.airline.name} logo" class="airline-logo">${flight.airline.name || 'N/A'}</td>
            <td>${flight.arrival.iataCode || 'N/A'}</td>
            <td>${convertToLondonTime(flight.departure.scheduledTime) || 'N/A'}</td>
            <td>${flight.status || 'N/A'}</td>
        `;
    });
}

// Display arrival data in table
function displayArrivals(arrivals) {
    let arrivalTable = document.getElementById('arrivalTable').getElementsByTagName('tbody')[0];
    arrivals.forEach(flight => {
        let row = arrivalTable.insertRow();
        row.innerHTML = `
            <td><a href="flight-details.html?flight=${flight.flight.iataNumber}" class="flight-link">${flight.flight.iataNumber || 'N/A'}</a></td>
            <td><img src="${getAirlineLogoUrl(flight.airline.iataCode)}" alt="${flight.airline.name} logo" class="airline-logo">${flight.airline.name || 'N/A'}</td>
            <td>${flight.departure.iataCode || 'N/A'}</td>
            <td>${convertToLondonTime(flight.arrival.scheduledTime) || 'N/A'}</td>
            <td>${flight.status || 'N/A'}</td>
        `;
    });
}
