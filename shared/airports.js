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

  // The index "city" is the *municipality*, which is often not what travellers call the place (Athens airport is in
  // "Spata-Artemida", Brussels in "Zaventem", Chania in "Souda"). A rule can't tell those from airports named after people
  // (Adnan Menderes, John F. Kennedy), so this table gives the common name for the ~468 airports people actually fly
  // between; anything else falls back to the cleaned-up municipality below.
  const CITY_OVERRIDES = {
    AAL: "Aalborg", ABZ: "Aberdeen", ACC: "Accra", ACE: "Lanzarote", ACI: "Alderney", ADB: "Izmir",
    ADD: "Addis Ababa", AEY: "Akureyri", AGA: "Agadir", AGP: "Málaga", AHO: "Alghero",
    AJA: "Ajaccio", AKL: "Auckland", ALC: "Alicante", AMM: "Amman", AMS: "Amsterdam", ANR: "Antwerp",
    ANU: "Antigua", AOI: "Ancona", AOK: "Karpathos", AQJ: "Aqaba", ARN: "Stockholm Arlanda", ASW: "Aswan",
    ATH: "Athens", ATL: "Atlanta", AUA: "Aruba", AUH: "Abu Dhabi", AYT: "Antalya", BAH: "Bahrain",
    BBU: "Bucharest Băneasa", BCN: "Barcelona", BDA: "Bermuda", BDS: "Brindisi", BEB: "Benbecula", BEG: "Belgrade",
    BER: "Berlin", BES: "Brest", BEY: "Beirut", BFS: "Belfast International", BGI: "Barbados", BGO: "Bergen",
    BGY: "Milan Bergamo", BHD: "Belfast City", BHX: "Birmingham", BIA: "Bastia", BIO: "Bilbao", BIQ: "Biarritz",
    BJL: "Banjul", BJV: "Bodrum", BKK: "Bangkok", BLK: "Blackpool", BLL: "Billund", BLQ: "Bologna",
    BLR: "Bangalore", BMA: "Stockholm Bromma", BNE: "Brisbane", BOD: "Bordeaux", BOG: "Bogotá", BOH: "Bournemouth",
    BOJ: "Burgas", BOM: "Mumbai", BOS: "Boston", BRE: "Bremen", BRI: "Bari", BRN: "Bern",
    BRQ: "Brno", BRS: "Bristol", BRU: "Brussels", BSL: "Basel", BTS: "Bratislava", BUD: "Budapest",
    BVA: "Paris Beauvais", BVC: "Boa Vista", BZO: "Bolzano", BZR: "Béziers", CAG: "Cagliari", CAI: "Cairo",
    CAL: "Campbeltown", CAN: "Guangzhou", CCF: "Carcassonne", CDG: "Paris CDG", CFR: "Caen", CFU: "Corfu",
    CGK: "Jakarta", CGN: "Cologne", CHC: "Christchurch", CHQ: "Chania", CIA: "Rome Ciampino", CIY: "Comiso",
    CLJ: "Cluj-Napoca", CLT: "Charlotte", CLY: "Calvi", CMB: "Colombo", CMF: "Chambéry", CMN: "Casablanca",
    CNX: "Chiang Mai", CPH: "Copenhagen", CPT: "Cape Town", CRL: "Brussels Charleroi", CTA: "Catania", CUF: "Cuneo",
    CUN: "Cancún", CUR: "Curaçao", CWL: "Cardiff", DAC: "Dhaka", DBV: "Dubrovnik", DCA: "Washington Reagan",
    DEL: "Delhi", DEN: "Denver", DFW: "Dallas", DJE: "Djerba", DLM: "Dalaman", DMK: "Bangkok Don Mueang",
    DND: "Dundee", DOH: "Doha", DOL: "Deauville", DPS: "Bali", DRS: "Dresden", 
    DSS: "Dakar", DTM: "Dortmund", DUB: "Dublin", DUR: "Durban", DUS: "Düsseldorf", DWC: "Dubai World Central",
    DXB: "Dubai", EAS: "San Sebastián", ECN: "Ercan", EDI: "Edinburgh", EFL: "Kefalonia", EGC: "Bergerac",
    EIN: "Eindhoven", EMA: "East Midlands", ESB: "Ankara", ESU: "Essaouira", EWR: "New York Newark",
    EXT: "Exeter", EZE: "Buenos Aires", FAO: "Faro", FCO: "Rome", FDH: "Friedrichshafen", FEZ: "Fès",
    FLL: "Fort Lauderdale", FLR: "Florence", FMM: "Memmingen", FNC: "Madeira", FRA: "Frankfurt", FSC: "Figari",
    FUE: "Fuerteventura", GCI: "Guernsey", GDN: "Gdańsk", GIG: "Rio de Janeiro", GLA: "Glasgow", GNB: "Grenoble",
    GND: "Grenada", GOA: "Genoa", GOI: "Goa", GOT: "Gothenburg", GRO: "Girona", GRQ: "Groningen",
    GRU: "São Paulo", GRX: "Granada", GRZ: "Graz", GVA: "Geneva", GZM: "Gozo", GZP: "Gazipaşa",
    HAJ: "Hanover", HAM: "Hamburg", HAN: "Hanoi", HAV: "Havana", HEL: "Helsinki", HER: "Heraklion",
    HHN: "Frankfurt-Hahn", HKG: "Hong Kong", HKT: "Phuket", HND: "Tokyo Haneda", HRG: "Hurghada", HUY: "Humberside",
    IAD: "Washington Dulles", IAH: "Houston", IAS: "Iași", IBZ: "Ibiza", ICN: "Seoul", ILY: "Islay",
    INI: "Niš", INN: "Innsbruck", INV: "Inverness", IOM: "Isle of Man", ISC: "Isles of Scilly", IST: "Istanbul",
    JED: "Jeddah", JER: "Jersey", JFK: "New York JFK", JIK: "Ikaria", JKH: "Chios", JMK: "Mykonos",
    JNB: "Johannesburg", JNX: "Naxos", JRO: "Kilimanjaro", JSI: "Skiathos", JTR: "Santorini", KBP: "Kyiv",
    KEF: "Reykjavik", KGS: "Kos", KIN: "Kingston", KIR: "Kerry", KIT: "Kythira", 
    KIX: "Osaka", KLU: "Klagenfurt", KLX: "Kalamata", KOI: "Orkney", KRK: "Kraków", KRN: "Kiruna",
    KSC: "Košice", KSF: "Kassel", KTM: "Kathmandu", KTW: "Katowice", KUL: "Kuala Lumpur", KUN: "Kaunas",
    KVA: "Kavala", KWI: "Kuwait", LAS: "Las Vegas", LAX: "Los Angeles", LBA: "Leeds Bradford", LCA: "Larnaca",
    LCG: "A Coruña", LCY: "London City", LDE: "Lourdes", LDY: "Derry", LEJ: "Leipzig", LGA: "New York LaGuardia",
    LGG: "Liège", LGW: "London Gatwick", LHR: "London Heathrow", LIG: "Limoges", LIL: "Lille", LIM: "Lima",
    LIN: "Milan Linate", LIR: "Liberia", LIS: "Lisbon", LJU: "Ljubljana", LLA: "Luleå", LMP: "Lampedusa",
    LNZ: "Linz", LOS: "Lagos", LPA: "Gran Canaria", LPL: "Liverpool", LRH: "La Rochelle", LSI: "Shetland",
    LTN: "London Luton", LUN: "Lusaka", LUX: "Luxembourg", LUZ: "Lublin", LWO: "Lviv", LXR: "Luxor",
    LXS: "Lemnos", LYS: "Lyon", MAA: "Chennai", MAD: "Madrid", MAH: "Menorca", MAN: "Manchester",
    MBA: "Mombasa", MBJ: "Montego Bay", MCO: "Orlando", MCT: "Muscat", MEL: "Melbourne", MEX: "Mexico City",
    MFM: "Macau", MIA: "Miami", MIR: "Monastir", MJT: "Lesbos", MLA: "Malta", MLB: "Orlando Melbourne",
    MLE: "Malé", MME: "Teesside", MMX: "Malmö", MNL: "Manila", MPL: "Montpellier", MPM: "Maputo",
    MRS: "Marseille", MRU: "Mauritius", MST: "Maastricht", MUC: "Munich", MXP: "Milan Malpensa", NAN: "Nadi",
    NAP: "Naples", NAS: "Nassau", NBE: "Enfidha", NBO: "Nairobi", NCE: "Nice", NCL: "Newcastle",
    NDR: "Nador", NOC: "Knock", NQY: "Newquay", NRN: "Weeze", NRT: "Tokyo Narita",
    NTE: "Nantes", NUE: "Nuremberg", NWI: "Norwich", NYO: "Stockholm Skavsta", OHD: "Ohrid", OLB: "Olbia",
    OPO: "Porto", ORD: "Chicago", ORK: "Cork", ORY: "Paris Orly", OSI: "Osijek", OSL: "Oslo",
    OST: "Ostend", OTP: "Bucharest", OUD: "Oujda", OVD: "Asturias", PAD: "Paderborn", PDL: "Azores",
    PEG: "Perugia", PEK: "Beijing", PER: "Perth", PFO: "Paphos", PGF: "Perpignan", PHL: "Philadelphia",
    PHX: "Phoenix", PIK: "Glasgow Prestwick", PKX: "Beijing Daxing", PLQ: "Palanga", PMI: "Palma de Mallorca", PMO: "Palermo",
    PNA: "Pamplona", PNL: "Pantelleria", POS: "Trinidad", POZ: "Poznań", PRG: "Prague", PRN: "Pristina",
    PSA: "Pisa", PSR: "Pescara", PTY: "Panama City", PUF: "Pau", PUJ: "Punta Cana", PUY: "Pula",
    PVG: "Shanghai", PVK: "Preveza", PVR: "Puerto Vallarta", PXO: "Porto Santo", RAI: "Praia", RAK: "Marrakech",
    REG: "Reggio Calabria", REU: "Reus", RHO: "Rhodes", RIX: "Riga", RJK: "Rijeka", RKV: "Reykjavik City",
    RMF: "Marsa Alam", RMI: "Rimini", RMU: "Murcia", RNS: "Rennes", RTM: "Rotterdam", RUH: "Riyadh",
    RVN: "Rovaniemi", RZE: "Rzeszów", SAN: "San Diego", SAW: "Istanbul Sabiha Gökçen", SBZ: "Sibiu", SCL: "Santiago",
    SCQ: "Santiago de Compostela", SDQ: "Santo Domingo", SDR: "Santander", SEA: "Seattle", SEN: "London Southend",
    SEZ: "Seychelles", SFB: "Orlando Sanford", SFO: "San Francisco", SGN: "Ho Chi Minh City", SHA: "Shanghai Hongqiao", SHJ: "Sharjah",
    SID: "Sal", SIN: "Singapore", SJD: "Los Cabos", SJJ: "Sarajevo", SJO: "San José", SJU: "San Juan",
    SKB: "St Kitts", SKG: "Thessaloniki", SKP: "Skopje", SLL: "Salalah", SMI: "Samos", SNN: "Shannon",
    SOF: "Sofia", SOU: "Southampton", SPC: "La Palma", SPU: "Split", SSH: "Sharm El Sheikh", STN: "London Stansted",
    STR: "Stuttgart", SUF: "Lamezia Terme", SVG: "Stavanger", SVQ: "Seville", SXB: "Strasbourg", SXM: "St Maarten",
    SYD: "Sydney", SYY: "Stornoway", SZG: "Salzburg", SZZ: "Szczecin", TAB: "Tobago",
    TFN: "Tenerife North", TFS: "Tenerife", TGD: "Podgorica", TIA: "Tirana", TIV: "Tivat", TKU: "Turku",
    TLL: "Tallinn", TLN: "Toulon", TLS: "Toulouse", TLV: "Tel Aviv", TNG: "Tangier", TNR: "Antananarivo",
    TOS: "Tromsø", TPA: "Tampa", TPE: "Taipei", TPS: "Trapani", TRD: "Trondheim", TRE: "Tiree",
    TRF: "Oslo Sandefjord", TRN: "Turin", TRS: "Trieste", TSF: "Venice Treviso", TSR: "Timișoara", TUN: "Tunis",
    TZX: "Trabzon", UME: "Umeå", USM: "Koh Samui", UVF: "St Lucia", VAR: "Varna", VCE: "Venice",
    VFA: "Victoria Falls", VGO: "Vigo", VIE: "Vienna", VIT: "Vitoria", VLC: "Valencia", VNO: "Vilnius",
    VRA: "Varadero", VRN: "Verona", VXE: "São Vicente", WAW: "Warsaw", WDH: "Windhoek", WIC: "Wick",
    WMI: "Warsaw Modlin", WRO: "Wrocław", XRY: "Jerez", YEG: "Edmonton", YHZ: "Halifax", YOW: "Ottawa",
    YQB: "Québec City", YUL: "Montréal", YVR: "Vancouver", YWG: "Winnipeg", YYC: "Calgary", YYZ: "Toronto",
    ZAD: "Zadar", ZAG: "Zagreb", ZAZ: "Zaragoza", ZNZ: "Zanzibar", ZRH: "Zurich", ZTH: "Zakynthos",
    LEI: "Almería",
    RMO: "Chișinău",
    FNI: "Nîmes",
    JSY: "Syros",
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
