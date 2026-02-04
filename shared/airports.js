/* shared/airports.js — Bristol Airport Flights App
   Offline-first IATA -> airport/city lookup.
   Exposes: window.BrsAirports
*/
"use strict";

(function(){
  const AIRPORT_INDEX_URL = "./airports.min.json";
  const AIRPORT_INDEX_CACHE_KEY = "brs_airport_index_v1";
  const AIRPORT_INDEX_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

  let airportIndex = null;
  let loadPromise = null;

  function normIata(code){
    return String(code || "").trim().toUpperCase();
  }

  function safeJsonParse(s){
    try { return JSON.parse(s); } catch { return null; }
  }

  function loadAirportIndexFromStorage(){
    try{
      const raw = localStorage.getItem(AIRPORT_INDEX_CACHE_KEY);
      const parsed = raw ? safeJsonParse(raw) : null;
      if(!parsed || typeof parsed !== "object") return null;

      const ts = Number(parsed.ts) || 0;
      const data = (parsed.data && typeof parsed.data === "object") ? parsed.data : null;
      if(!data) return null;

      const fresh = (Date.now() - ts) < AIRPORT_INDEX_TTL_MS;
      return fresh ? data : null;
    }catch{ return null; }
  }

  function saveAirportIndexToStorage(data){
    try{
      localStorage.setItem(AIRPORT_INDEX_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    }catch{}
  }

  async function loadAirportIndexBestEffort(){
    if(airportIndex && typeof airportIndex === "object") return airportIndex;
    if(loadPromise) return loadPromise;

    loadPromise = (async ()=>{
      // storage first
      const cached = loadAirportIndexFromStorage();
      if(cached){
        airportIndex = cached;
        return airportIndex;
      }

      // bundled JSON (cached by SW)
      try{
        const res = await fetch(AIRPORT_INDEX_URL, { cache: "no-store" });
        if(!res.ok) throw new Error(`airport index HTTP ${res.status}`);
        const data = await res.json();
        if(data && typeof data === "object"){
          airportIndex = data;
          saveAirportIndexToStorage(data);
          return airportIndex;
        }
      }catch(e){
        console.warn("[BRS Flights] airport index load failed:", e);
      }

      airportIndex = null;
      return null;
    })();

    return loadPromise;
  }

  function getAirportRecord(iata){
    const code = normIata(iata);
    if(!code) return null;
    return (airportIndex && airportIndex[code]) ? airportIndex[code] : null;
  }

  function getAirportDisplayName(iata, prefer = "city"){
    // prefer: "city" | "airport"
    const code = normIata(iata);
    if(!code) return "—";
    const rec = getAirportRecord(code);
    if(!rec) return code; // never hide flights: fallback to IATA

    if(prefer === "airport") return rec.name || rec.city || rec.iata || code;
    return rec.city || rec.name || rec.iata || code;
  }

  function getAirportLatLon(iata){
    const rec = getAirportRecord(iata);
    if(!rec) return null;
    const lat = (rec.lat != null) ? Number(rec.lat) : null;
    const lon = (rec.lon != null) ? Number(rec.lon) : null;
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    // Treat 0,0 as invalid
    if (Math.abs(lat) < 0.001 && Math.abs(lon) < 0.001) return null;
    return { lat, lon };
  }

  window.BrsAirports = {
    normIata,
    loadAirportIndexBestEffort,
    getAirportRecord,
    getAirportDisplayName,
    getAirportLatLon,
  };
})();
