// ------------ STATE ------------

const state = {
  context: null,  // will be built from query params
  current: null,  // will be filled after fetch
  apiKey: null     // Store the API key received from Cloudflare Worker
};

// Utility to get query params from the URL
function getQueryParams() {
  const params = {};
  location.search
    .substring(1)
    .split("&")
    .forEach(pair => {
      const [key, value] = pair.split("=");
      if (key) params[key] = decodeURIComponent(value);
    });
  return params;
}

// Initialize state from query params (e.g., key=flight_...)
function initStateFromQuery() {
  const q = getQueryParams();

  // If no key or invalid input, bail
  if (!q.key) return null;

  const flightId = q.key; // Use the flight key from URL as flight number (or another identifier)

  // Build the context for API call
  state.context = {
    airport: "BRS",         // Bristol Airport (adjust as needed)
    mode: "departures",     // Assume departures by default
    day: 1,                 // Default day (can adjust for specific date)
    flightKey: flightId     // Use the flight key as flight number
  };

  // Pre-seed state.current with the flightKey
  state.current = { flightKey: flightId };
}

// ------------ API CALL ------------

// Fetch API key from the Cloudflare Worker and then use it to make the flight data request
async function fetchApiKey() {
  const workerUrl = "https://proud-bonus-5b54.cjchiffers.workers.dev/api/timetable";
  const response = await fetch(workerUrl);

  if (!response.ok) {
    console.error("Error fetching the API key from the Cloudflare Worker");
    return null;
  }

  const data = await response.json();

  if (data.apiKey) {
    state.apiKey = data.apiKey;
    return data.apiKey;  // Return the API key
  } else {
    console.error("No API key returned from the worker");
    return null;
  }
}

// Fetch flight data from Aviation Edge API using the retrieved API key
async function fetchFlightData(context) {
  const apiKey = state.apiKey; // Retrieve the API key from the state (set by Cloudflare Worker)
  if (!apiKey) {
    console.error("API key is missing");
    return [];
  }

  const url = new URL("https://aviation-edge.com/v2/public/flights");
  url.searchParams.set("key", apiKey); // Use the API key from Cloudflare Worker

  // Option A — filter by departure airport
  url.searchParams.set("depIata", context.airport);

  // Option B — filter by flight number (from flightKey)
  if (context.flightKey) {
    url.searchParams.set("flightIata", context.flightKey); // Adjust to the correct parameter for flight number
  }

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json();
    console.log("API response data:", data); // Log the API response for debugging

    if (!data || data.error || !Array.isArray(data)) {
      return []; // Return an empty array if no valid data
    }
    return data;
  } catch (err) {
    console.error("Fetch error:", err);
    return [];
  }
}

// ------------ RENDER ------------

// Render the flight data to the page
function render(f) {
  document.getElementById("headline").textContent = `${f.flightNumber || "Unknown Flight"}`;
  document.getElementById("subhead").textContent = `${f.scheduledTime || "Unknown Time"}`;

  const details = document.getElementById("flightDetails");
  if (!details) return;

  details.innerHTML = `
    <p><strong>Flight Number:</strong> ${f.flightNumber || "N/A"}</p>
    <p><strong>Scheduled:</strong> ${f.scheduledTime || "N/A"}</p>
    <p><strong>Gate:</strong> ${f.gate || "N/A"}</p>
    <p><strong>Status:</strong> ${f.status || "N/A"}</p>
  `;
}

// ------------ INIT Flow ------------

async function initialize() {
  initStateFromQuery();

  // if no context or flightKey, show message
  if (!state.context || !state.current) {
    document.getElementById("headline").textContent = "No flight key provided";
    return;
  }

  // Fetch the API key from Cloudflare Worker
  const apiKey = await fetchApiKey();
  if (!apiKey) {
    document.getElementById("headline").textContent = "Error fetching API key";
    return;
  }

  const list = await fetchFlightData(state.context);
  if (!list || list.length === 0) {
    document.getElementById("headline").textContent = "No flights found";
    return;
  }

  // Updated matching logic to account for the worker response format:
  // The flight data is now inside the "data" array
  const best = list.data.find(f => f.flight.iataNumber === state.context.flightKey);
  if (!best) {
    document.getElementById("headline").textContent = "Flight not found";
    return;
  }

  state.current = best;
  render(best);
}

document.addEventListener("DOMContentLoaded", initialize);
