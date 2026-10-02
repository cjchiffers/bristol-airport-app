/* shared/airports.js — Bristol Airport Flights App
   Offline-first IATA -> airport/city lookup.
   Exposes: window.BrsAirports
*/
"use strict";

(function(){
  // airports.min.json: { "BRS": [name, city, lat, lon], ... }
  // `name` is "" when it is simply "<city> Airport". Fetched once; the service worker / HTTP cache keep it.
  const AIRPORT_INDEX_URL = "./airports.min.json?v=2";
  const OLD_STORAGE_KEY = "brs_airport_index_v1";   // earlier versions copied the whole index (1.7 MB) into localStorage

  let airportIndex = null;
  let loadPromise = null;
  const records = new Map();

  // The index "city" is the municipality, which is often not what travellers call the place
  // (Malpensa -> "Ferno (VA)", Kraków -> "Balice", Lanzarote -> "San Bartolomé").
  const CITY_OVERRIDES = {
    ACE: "Lanzarote", BGY: "Milan Bergamo", BSL: "Basel", CDG: "Paris CDG", CFU: "Corfu",
    FNC: "Madeira", GCI: "Guernsey", IOM: "Isle of Man", JER: "Jersey", KGS: "Kos",
    KRK: "Kraków", LIN: "Milan Linate", LPA: "Gran Canaria", MAH: "Menorca", MXP: "Milan Malpensa",
    NCE: "Nice", NCL: "Newcastle", NOC: "Knock", ORY: "Paris Orly", OTP: "Bucharest",
    SID: "Sal", TFS: "Tenerife", TLS: "Toulouse", GIG: "Rio de Janeiro", JFK: "New York JFK",
    EWR: "New York Newark", LGW: "London Gatwick", LHR: "London Heathrow", STN: "London Stansted",
    LTN: "London Luton", LCY: "London City",
  };

  // "Pisa (PI)" -> "Pisa", "Nice, Alpes-Maritimes" -> "Nice", "Toulouse/Blagnac" -> "Toulouse", "Kos Island" -> "Kos"
  function cleanCity(city){
    return String(city || "")
      .replace(/\s*\([^)]*\)/g, "")
      .split(/\s*[,/]\s*/)[0]
      .replace(/\s+Island$/i, "")
      .trim();
  }

  function normIata(code){
    return String(code || "").trim().toUpperCase();
  }

  async function loadAirportIndexBestEffort(){
    if(airportIndex && typeof airportIndex === "object") return airportIndex;
    if(loadPromise) return loadPromise;

    loadPromise = (async ()=>{
      try{ localStorage.removeItem(OLD_STORAGE_KEY); }catch{}

      try{
        const res = await fetch(AIRPORT_INDEX_URL);
        if(!res.ok) throw new Error(`airport index HTTP ${res.status}`);
        const data = await res.json();
        if(data && typeof data === "object"){
          airportIndex = data;
          return airportIndex;
        }
      }catch(e){
        console.warn("[BRS Flights] airport index load failed:", e);
      }

      // Allow a later retry (e.g. after coming back online).
      loadPromise = null;
      return null;
    })();

    return loadPromise;
  }

  function expand(code, r){
    if(!r) return null;
    if(Array.isArray(r)){
      const rawCity = r[1] || "";
      return {
        iata: code,
        name: r[0] || (rawCity ? `${rawCity} Airport` : ""),
        city: CITY_OVERRIDES[code] || cleanCity(rawCity),
        lat: r[2],
        lon: r[3],
      };
    }
    return r; // already an object (old format)
  }

  function getAirportRecord(iata){
    const code = normIata(iata);
    if(!code || !airportIndex) return null;
    if(records.has(code)) return records.get(code);
    const rec = expand(code, airportIndex[code]);
    records.set(code, rec);
    return rec;
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
