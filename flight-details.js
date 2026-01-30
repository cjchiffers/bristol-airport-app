(function () {
  const flight = window.__FLIGHT__ || {};

  const airlineNameEl = document.getElementById("airlineName");
  const airlineCodeEl = document.getElementById("airlineCode");
  const airlineLogoEl = document.getElementById("airlineLogo");

  if (flight.airline) {
    airlineNameEl.textContent = flight.airline.name || "—";
    airlineCodeEl.textContent = "Airline code: " + (flight.airline.iataCode || "—");

    if (flight.airline.logo) {
      airlineLogoEl.src = flight.airline.logo;
      airlineLogoEl.alt = flight.airline.name || "";
    }
  }

  const gateEl = document.getElementById("heroGate");
  const beltEl = document.getElementById("heroBaggage");

  if (gateEl) gateEl.textContent = flight.departure?.gate || "—";
  if (beltEl) beltEl.textContent = flight.arrival?.baggage || "—";
})();