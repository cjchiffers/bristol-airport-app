import { test, describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { loadShared, readJson, makeStorage, ROOT } from "./load.mjs";

const w = loadShared(["shared/time.js", "shared/flights.js", "shared/aircraft.js"]);
const T = w.BrsTime, F = w.BrsFlights, A = w.BrsAircraft;
// Objects made inside the sandbox have a different prototype, so compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

describe("time.js", () => {
  test("parses every format the API/browsers produce (incl. Safari-hostile 'YYYY-MM-DD HH:MM+01:00')", () => {
    const want = "2026-10-02T14:25:00.000Z";
    for (const v of ["2026-10-02 15:25+01:00", "2026-10-02T15:25+01:00", "2026-10-02T15:25+0100", "2026-10-02T14:25Z", "2026-10-02T14:25:00.000", "2026-10-02 14:25", 1790951100, 1790951100000, "1790951100"]) {
      assert.equal(T.parse(v)?.toISOString(), want, String(v));
    }
    assert.equal(T.parse(""), null); assert.equal(T.parse(null), null); assert.equal(T.parse("abc"), null);
  });
  test("formats in London time whatever the machine's timezone", () => {
    assert.equal(T.fmtTime("2026-10-02 14:25Z"), "15:25");        // BST
    assert.equal(T.fmtTime("2026-12-02 14:25Z"), "14:25");        // GMT
    assert.equal(T.fmtTime("2026-10-01T23:00Z"), "00:00");        // midnight is 00:00, never 24:00
    assert.equal(T.londonDateKey("2026-10-01T23:30Z"), "2026-10-02");
  });
  test("day label uses 3-letter months", () => {
    assert.equal(T.fmtDay("2026-10-02 15:25+01:00"), "Fri 02 Oct");
    assert.equal(T.fmtDay("2026-09-30 12:00+01:00"), "Wed 30 Sep");
  });
  test("minutesBetween", () => {
    assert.equal(T.minutesBetween("2026-10-02 15:10+01:00", "2026-10-02 15:25+01:00"), 15);
    assert.equal(T.minutesBetween("x", "2026-10-02 15:25+01:00"), null);
  });
});

const mk = (o = {}) => ({
  status: "scheduled",
  departure: { iataCode: "KGS", scheduledTime: "2026-10-02 12:00+01:00", estimatedTime: "", actualTime: "", delay: "", gate: "D28" },
  arrival: { iataCode: "BRS", scheduledTime: "2026-10-02 15:10+01:00", estimatedTime: "", actualTime: "", delay: "" },
  flight: { iataNumber: "U2 2806" }, airline: { iataCode: "U2", name: "easyJet" }, aircraft: { regNumber: "G-UZHA", modelText: "Airbus A320" },
  ...o,
});
const withArr = (patch, top = {}) => { const f = mk(top); Object.assign(f.arrival, patch); return f; };

describe("flights.js: which time matters, delay, status", () => {
  test("Bristol side: arrivals use the ARRIVAL time (not the origin's departure)", () => {
    const f = mk();
    assert.equal(F.keyTime(f, "arrival").toISOString(), "2026-10-02T14:10:00.000Z");
    assert.equal(F.keyTime(f, "departure").toISOString(), "2026-10-02T11:00:00.000Z");
    assert.equal(F.seg(f, "arrivals").iataCode, "BRS");
  });
  test("keyTime prefers actual, then estimated, then scheduled", () => {
    assert.equal(F.keyTime(withArr({ estimatedTime: "2026-10-02 15:30+01:00" }), "arrival").toISOString(), "2026-10-02T14:30:00.000Z");
    assert.equal(F.keyTime(withArr({ estimatedTime: "2026-10-02 15:30+01:00", actualTime: "2026-10-02 15:21+01:00" }), "arrival").toISOString(), "2026-10-02T14:21:00.000Z");
  });
  test("delay: numeric field wins, else derived from estimated, null when unknown", () => {
    assert.equal(F.delayMin(withArr({ delay: 7 }), "arrival"), 7);
    assert.equal(F.delayMin(withArr({ delay: "" , estimatedTime: "2026-10-02 15:25+01:00" }), "arrival"), 15);
    assert.equal(F.delayMin(withArr({ estimatedTime: "2026-10-02 15:05+01:00" }), "arrival"), -5);
    assert.equal(F.delayMin(mk(), "arrival"), null);
    assert.equal(F.delayMin(withArr({ delay: 0 }), "arrival"), 0);
  });
  const st = (patch, top, mode = "arrival") => F.statusInfo(withArr(patch, top), mode);
  test("status priority and wording", () => {
    assert.deepEqual(plain(st({}, { status: "cancelled" })), { key: "cancelled", text: "Cancelled", tone: "bad" });
    assert.equal(st({}, { status: "diverted" }).key, "diverted");
    assert.equal(st({ actualTime: "2026-10-02 15:22+01:00" }, { status: "landed" }).text, "Landed 15:22");
    assert.equal(st({}, { status: "boarding" }, "departure").text, "Boarding");
    assert.equal(st({}, { status: "gateclosed" }, "departure").tone, "warn");
    assert.equal(st({}, { status: "checkin" }, "departure").text, "Check-in open");
    assert.equal(st({}, { status: "active" }, "departure").text, "Departed");       // older worker's word for departed
    assert.equal(st({ estimatedTime: "2026-10-02 15:42+01:00" }).text, "Delayed · Exp 15:42");
    assert.equal(st({ estimatedTime: "2026-10-02 15:00+01:00" }).text, "Early · Exp 15:00");
    assert.equal(st({ estimatedTime: "2026-10-02 15:20+01:00" }, { status: "approaching" }).text, "Expected 15:20", "en route: show the time that matters");
    assert.equal(st({ estimatedTime: "2026-10-02 15:20+01:00" }, { status: "scheduled" }).text, "On time", "10 min late is within tolerance");
    assert.equal(st({}, { status: "approaching" }).text, "Expected 15:10");
    assert.equal(st({}).text, "On time");
    assert.equal(st({ estimatedTime: "2026-10-02 15:42+01:00" }, { status: "departed" }, "departure").key, "departed", "departed beats delayed");
  });
});

describe("flights.js: de-duplication", () => {
  const twin = (no, name, over = {}) => mk({ flight: { iataNumber: no }, airline: { iataCode: no.slice(0, 2), name }, ...over });
  test("exact duplicates and easyJet U2/EC twins collapse; the other number is kept for search", () => {
    const out = F.dedupe([twin("EC 7003", "EasyJet Europe"), twin("U2 7003", "easyJet"), twin("U2 7003", "easyJet")], "arrival");
    assert.equal(out.length, 1);
    assert.equal(out[0].flight.iataNumber, "U2 7003");
    assert.deepEqual(plain(out[0].codeshares), ["EC 7003"]);
  });
  test("different flights at the same time to the same place are NOT merged", () => {
    const a = twin("LS 1889", "Jet2", { aircraft: { regNumber: "", modelText: "" } });
    const b = twin("U2 2739", "easyJet", { aircraft: { regNumber: "", modelText: "" } });
    assert.equal(F.dedupe([a, b], "arrival").length, 2);
  });
  test("same aircraft registration = same flight even with unrelated numbers", () => {
    assert.equal(F.dedupe([twin("EI 3280", "Aer Lingus"), twin("EAI 8BR", "EAI")], "arrival").length, 1);
  });
  test("merges codeshares reported by the worker too", () => {
    const a = twin("U2 5527", "easyJet", { codeshares: ["XX 1"] });
    const out = F.dedupe([a, twin("EC 5527", "EasyJet Europe")], "arrival");
    assert.deepEqual(plain(out[0].codeshares).sort(), ["EC 5527", "XX 1"]);
  });
});

describe("flights.js: shareable URLs, cache, share text, calendar", () => {
  test("details URL carries type/flight/date (London date of the Bristol side)", () => {
    assert.equal(F.detailsUrl(mk(), "arrival"), "https://flightapp.chiffers.com/flight-details.html?type=arrival&flight=U2%202806&date=2026-10-02");
    const late = withArr({ scheduledTime: "2026-10-02 23:50+01:00" });
    assert.equal(F.routeOf(late, "arrival").date, "2026-10-02");
    assert.equal(F.routeOf(withArr({ scheduledTime: "2026-10-03 00:20+01:00" }), "arrival").date, "2026-10-03");
  });
  test("per-flight cache round-trips and prunes entries older than 48 h", () => {
    const store = makeStorage();
    const win = loadShared(["shared/time.js", "shared/flights.js"], { localStorage: store });
    const f = mk(); const r = win.BrsFlights.routeOf(f, "arrival");
    win.BrsFlights.saveCached(r, f);
    assert.equal(win.BrsFlights.loadCached(r).flight.flight.iataNumber, "U2 2806");
    store.setItem("brs_fd:arrival:OLD 1:2020-01-01", JSON.stringify({ ts: 1, flight: {} }));
    win.BrsFlights.saveCached(r, f);
    assert.equal(store.getItem("brs_fd:arrival:OLD 1:2020-01-01"), null);
  });
  test("share text is status-aware", () => {
    assert.match(F.shareText(withArr({ estimatedTime: "2026-10-02 15:25+01:00" }), "arrival"), /^U2 2806 from KGS — expected at Bristol 15:25 \(scheduled 15:10\)$/);
    assert.match(F.shareText(withArr({ actualTime: "2026-10-02 15:22+01:00" }, { status: "landed" }), "arrival"), /landed 15:22$/);
    assert.match(F.shareText(mk({ status: "cancelled" }), "arrival"), /cancelled$/);
    assert.match(F.shareText(mk({ status: "departed" }), "departure"), /departed Bristol/);
  });
  test("ICS: escapes text, folds long lines at 75 octets, UTC times", () => {
    const f = withArr({ estimatedTime: "2026-10-02 15:25+01:00" });
    f.airline.name = "a;b,c";
    const ics = F.buildIcs(f, "arrival", "https://flightapp.chiffers.com/flight-details.html?type=arrival&flight=U2%202806&date=2026-10-02");
    const lines = ics.split("\r\n");
    assert.equal(lines[0], "BEGIN:VCALENDAR"); assert.equal(lines.at(-2), "END:VCALENDAR"); assert.equal(lines.at(-1), "");
    assert.ok(lines.every((l) => new TextEncoder().encode(l).length <= 75));
    const unfolded = ics.replace(/\r\n /g, "");
    assert.match(unfolded, /DTSTART:20261002T142500Z/);
    assert.match(unfolded, /DESCRIPTION:.*\\n.*Status: /, "newlines are escaped as \\n");
    assert.equal(F.buildIcs({ departure: {}, arrival: {} }, "arrival"), "", "no time = no event");
  });
});

describe("flights.js: share URL", () => {
  const route = { type: "arrival", flight: "U2 2806", date: "2026-10-03" };
  const cfg = (features) => loadShared(["shared/time.js", "shared/flights.js"], { BrsConfig: { WORKER_ORIGIN: "https://w.example", features } }).BrsFlights;
  test("uses the worker's preview address when it supports it, with the place name", () => {
    assert.equal(cfg({ preview: true }).shareUrl(route, "Kos"), "https://w.example/s/arrival/U2%202806/2026-10-03?p=Kos");
    assert.equal(cfg({ preview: true }).shareUrl(route, "São Paulo & Co"), "https://w.example/s/arrival/U2%202806/2026-10-03?p=S%C3%A3o%20Paulo%20%26%20Co");
  });
  test("falls back to the app URL for an older worker (never a broken link)", () => {
    for (const features of [{}, undefined, { preview: false }]) {
      assert.equal(cfg(features).shareUrl(route, "Kos"), "https://flightapp.chiffers.com/flight-details.html?type=arrival&flight=U2%202806&date=2026-10-03");
    }
  });
});

describe("aircraft.js", () => {
  const cases = {
    narrowbody: ["Airbus A320", "Boeing 737-800", "Airbus A319", "Boeing 737 MAX 8", "Airbus A321 NEO", "Airbus A320 (Sharklets)", "Airbus A220-300", "Boeing 757-200", "Airbus A319 (Sharklets)", ""],
    regional: ["Embraer 175", "Embraer 190", "Embraer RJ145", "Bombardier CRJ900"],
    turboprop: ["ATR 72", "Bombardier Dash 8 Q400", "De Havilland DHC-8-400"],
    widebody: ["Boeing 787-9", "Boeing 767-300", "Airbus A330-200", "Airbus A350-900", "Airbus A310"],
    widebody4: ["Boeing 747-400", "Airbus A380", "Airbus A340-600"],
  };
  for (const [kind, models] of Object.entries(cases)) {
    test(`${kind}`, () => { for (const m of models) assert.equal(A.kindFor(m), kind, m || "(blank)"); });
  }
  test("every kind renders a well-formed decorative svg", () => {
    for (const k of Object.keys(cases)) {
      const s = A.svg(k);
      assert.match(s, /^<svg [^>]*viewBox="0 0 400 140"[^>]*aria-hidden="true">/);
      assert.equal((s.match(/<svg/g) || []).length, 1); assert.ok(s.trim().endsWith("</svg>"));
      assert.ok(A.label(k));
    }
  });
});

describe("airports.js", () => {
  test("friendly city names and coordinates from the compact index", async () => {
    const index = readJson("airports.min.json");
    const win = loadShared(["shared/airports.js"], { fetch: async () => ({ ok: true, json: async () => index }), localStorage: makeStorage() });
    await win.BrsAirports.loadAirportIndexBestEffort();
    const name = (c) => win.BrsAirports.getAirportDisplayName(c);
    assert.equal(name("MXP"), "Milan Malpensa"); assert.equal(name("KRK"), "Kraków"); assert.equal(name("ACE"), "Lanzarote");
    assert.equal(name("IBZ"), "Ibiza"); assert.equal(name("PSA"), "Pisa"); assert.equal(name("TLS"), "Toulouse"); assert.equal(name("BRS"), "Bristol");
    assert.equal(name("ZZZ"), "ZZZ", "unknown airports fall back to the code");
    const p = win.BrsAirports.getAirportLatLon("BRS");
    assert.ok(Math.abs(p.lat - 51.38) < 0.05 && Math.abs(p.lon + 2.72) < 0.05);
    assert.equal(win.BrsAirports.getAirportDisplayName("AGP", "airport"), "Málaga-Costa del Sol Airport");
  });
  test("travellers' names for airports where the municipality is misleading", async () => {
    const index = readJson("airports.min.json");
    const win = loadShared(["shared/airports.js"], { fetch: async () => ({ ok: true, json: async () => index }), localStorage: makeStorage() });
    await win.BrsAirports.loadAirportIndexBestEffort();
    const want = {
      ATH: "Athens", BRU: "Brussels", CHQ: "Chania", NAP: "Naples", CGN: "Cologne", VCE: "Venice", FUE: "Fuerteventura",
      OTP: "Bucharest", LIN: "Milan Linate", MRS: "Marseille", LYS: "Lyon", TIA: "Tirana", ADB: "Izmir", SAW: "Istanbul Sabiha Gökçen",
      LEI: "Almería", FNI: "Nîmes", JSY: "Syros", NIM: "Niamey", SYR: "Syracuse", JFK: "New York JFK", HAJ: "Hanover", LGW: "London Gatwick",
    };
    for (const [code, name] of Object.entries(want)) assert.equal(win.BrsAirports.getAirportDisplayName(code), name, code);
  });

  test("every curated city name belongs to the airport it is attached to (guards against wrong codes)", () => {
    const index = readJson("airports.min.json");
    const text = fs.readFileSync(path.join(ROOT, "shared/airports.js"), "utf8");
    const block = text.slice(text.indexOf("const CITY_OVERRIDES = {"), text.indexOf("  };", text.indexOf("const CITY_OVERRIDES = {")));
    const pairs = [...block.matchAll(/([A-Z0-9]{3}): "([^"]+)"/g)].map((m) => [m[1], m[2]]);
    assert.ok(pairs.length > 400);
    const fold = (x) => x.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
    // Names that deliberately differ from the file's municipality/airport name (checked by hand).
    const intentional = new Set(("ADB ANU AOI AUA BDA BGI BGY BLR BVC CUR DPS EFL FNC GND GOT HAJ KBP KIT LXS MJT MRU PDL POS PTY RAK SID SKB TAB TPE UVF VRA").split(" "));
    const seen = new Set();
    for (const [code, name] of pairs) {
      assert.ok(!seen.has(code), `duplicate ${code}`); seen.add(code);
      const rec = index[code];
      assert.ok(rec, `${code} (${name}) is not in the airport file — wrong IATA code?`);
      if (intentional.has(code)) continue;
      const hay = fold(`${rec[0]} ${rec[1]}`);
      const words = fold(name).split(" ").filter((w) => !["city", "international", "north", "de", "world", "central"].includes(w));
      assert.ok(words.some((w) => hay.includes(w)), `${code}: "${name}" does not match "${rec[0] || rec[1]}"`);
    }
  });

  test("the airport file is compact and well-formed", () => {
    const index = readJson("airports.min.json");
    const rows = Object.entries(index);
    assert.ok(rows.length > 8000);
    for (const [code, r] of rows) {
      assert.match(code, /^[A-Z0-9]{3}$/);
      assert.ok(Array.isArray(r) && r.length === 4 && Number.isFinite(r[2]) && Number.isFinite(r[3]), code);
    }
  });
});
