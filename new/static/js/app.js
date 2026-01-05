
// Set up API key and URLs for the API requests
const apiKey = '26071f-14ef94';
const baseApiUrl = 'https://flightapp-workers.chiffers.com/api/flights?key=' + apiKey + '&arrIata=BRS';

// Select elements
const arrivalsTab = document.getElementById('arrivalsTab');
const departuresTab = document.getElementById('departuresTab');
const flightInfo = document.getElementById('flightInfo');
const flightDetailsModal = document.getElementById('flightDetailsModal');
const flightDetailsContent = document.getElementById('flightDetailsContent');
const closeModalButton = document.getElementById('closeModal');

// Event listeners for tabs
arrivalsTab.addEventListener('click', () => fetchFlights('arrivals'));
departuresTab.addEventListener('click', () => fetchFlights('departures'));

// Close modal
closeModalButton.addEventListener('click', () => {
    flightDetailsModal.style.display = 'none';
});

// Fetch flights from the API
function fetchFlights(type) {
    fetch(`${baseApiUrl}&type=${type}`)
        .then(response => response.json())
        .then(data => {
            displayFlights(data);
        })
        .catch(error => {
            console.error('Error fetching flight data:', error);
        });
}

// Display flights in the flight info section
function displayFlights(flights) {
    flightInfo.innerHTML = ''; // Clear previous flights
    flights.forEach(flight => {
        const flightElement = document.createElement('div');
        flightElement.classList.add('bg-white', 'p-4', 'm-2', 'rounded-lg', 'shadow-lg');
        flightElement.innerHTML = `
            <h3 class="text-lg font-bold">${flight.flightNumber}</h3>
            <p>Departure: ${flight.departureTime}</p>
            <p>Arrival: ${flight.arrivalTime}</p>
            <p>Gate: ${flight.gate || 'N/A'}</p>
            <button onclick="showFlightDetails(${flight.id})" class="text-blue-500">View Details</button>
        `;
        flightInfo.appendChild(flightElement);
    });
}

// Show flight details in a modal
function showFlightDetails(flightId) {
    fetch(`https://flightapp-workers.chiffers.com/api/flight&flightId=${flightId}`)
        .then(response => response.json())
        .then(data => {
            const flight = data[0];
            flightDetailsContent.innerHTML = `
                <p><strong>Departure Time:</strong> ${flight.departureTime}</p>
                <p><strong>Arrival Time:</strong> ${flight.arrivalTime}</p>
                <p><strong>Gate:</strong> ${flight.gate || 'N/A'}</p>
                <p><strong>Flight Status:</strong> ${flight.status}</p>
                <p><strong>Destination Weather:</strong> ${flight.weather}</p>
            `;
            flightDetailsModal.style.display = 'block';
        })
        .catch(error => {
            console.error('Error fetching flight details:', error);
        });
}
