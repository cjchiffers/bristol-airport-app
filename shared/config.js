/* shared/config.js — Bristol Airport Flights App
   One place for the backend URL and home airport, plus a probe of which optional features the
   deployed worker supports (so a newer page keeps working against an older worker).
   Exposes: window.BrsConfig  (BrsConfig.features is filled in shortly after load;
   await BrsConfig.featuresReady if you must wait for it)
*/
"use strict";

window.BrsConfig = {
  API_BASE: "https://flightapp-workers.chiffers.com/api",
  AIRPORT: "BRS",
  features: {},
  featuresReady: null,
};

window.BrsConfig.featuresReady = fetch(`${window.BrsConfig.API_BASE}/health`, { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => { window.BrsConfig.features = (j && j.features) || {}; return window.BrsConfig.features; })
  .catch(() => window.BrsConfig.features);
