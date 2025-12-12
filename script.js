// Fetch departure data
fetch('https://aviation-edge.com/v2/public/timetable?key=26071f-14ef94&iataCode=BRS&type=departure')
    .then(response => response.json())
    .then(data => {
        console.log('Departure data:', data);  // Log full response
        if (data && Array.isArray(data)) {
            displayDepartures(data);
        } else {
            console.log("No departure data found.");
        }
    })
    .catch(error => console.error('Error fetching departure data:', error));

// Fetch arrival data
fetch('https://aviation-edge.com/v2/public/timetable?key=26071f-14ef94&iataCode=BRS&type=arrival')
    .then(response => response.json())
    .then(data => {
        console.log('Arrival data:', data);  // Log full response
        if (data && Array.isArray(data)) {
            displayArrivals(data);
        } else {
            console.log("No arrival data found.");
        }
    })
    .catch(error => console.error('Error fetching arrival data:', error));

// Display departure data in table
function displayDepartures(departures) {
    let departureTable = document.getElementById('departureTable').getElementsByTagName('tbody')[0];
    departures.forEach(flight => {
        console.log(flight);  // Log each flight data
        let row = departureTable.insertRow();
        row.innerHTML = `
            <td>${flight.flight.iataNumber || 'N/A'}</td>
            <td>${flight.departure.iataCode || 'N/A'}</td>
            <td>${flight.departure.scheduledTime || 'N/A'}</td>
            <td>${flight.status || 'N/A'}</td>
        `;
    });
}

// Display arrival data in table
function displayArrivals(arrivals) {
    let arrivalTable = document.getElementById('arrivalTable').getElementsByTagName('tbody')[0];
    arrivals.forEach(flight => {
        console.log(flight);  // Log each flight data
        let row = arrivalTable.insertRow();
        row.innerHTML = `
            <td>${flight.flight.iataNumber || 'N/A'}</td>
            <td>${flight.arrival.iataCode || 'N/A'}</td>
            <td>${flight.arrival.scheduledTime || 'N/A'}</td>
            <td>${flight.status || 'N/A'}</td>
        `;
    });
}
