(function () {
  const gateEl = document.getElementById("heroGate");
  const beltEl = document.getElementById("heroBaggage");

  if (!gateEl || !beltEl) return;

  const flight = window.__FLIGHT__ || {};

  const gate =
    flight.departure?.gate ??
    flight.departureGate ??
    null;

  const belt =
    flight.arrival?.baggage ??
    flight.arrivalBelt ??
    null;

  gateEl.textContent = gate || "—";
  beltEl.textContent = belt || "—";
})();