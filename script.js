// Fetch departure data
fetch('https://aviation-edge.com/v2/public/timetable?key=26071f-14ef94&iataCode=BRS&type=departure')
    .then(response => response.json())
    .then(data => {
        displayDepartures(data);
    })
    .catch(error => console.error('Error fetching departure data:', error));

// Fetch arrival data
fetch('https://aviation-edge.com/v2/public/timetable?key=26071f-14ef94&iataCode=BRS&type=arrival')
    .then(response => response.json())
    .then(data => {
        displayArrivals(data);
    })
    .catch(error => console.error('Error fetching arrival data:', error));

// Display departure data in table
function displayDepartures(departures) {
    let departureTable = document.getElementById('departureTable').getElementsByTagName('tbody')[0];
    departures.forEach(flight => {
        let row = departureTable.insertRow();
        row.innerHTML = `
            <td>${flight.flight.iata}</td>
            <td>${flight.destination.iata}</td>
            <td>${flight.scheduledDeparture}</td>
            <td>${flight.status}</td>
        `;
    });
}

// Display arrival data in table
function displayArrivals(arrivals) {
    let arrivalTable = document.getElementById('arrivalTable').getElementsByTagName('tbody')[0];
    arrivals.forEach(flight => {
        let row = arrivalTable.insertRow();
        row.innerHTML = `
            <td>${flight.flight.iata}</td>
            <td>${flight.origin.iata}</td>
            <td>${flight.scheduledArrival}</td>
            <td>${flight.status}</td>
        `;
    });
}
