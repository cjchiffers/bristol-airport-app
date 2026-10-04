import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { workerExists, loadWorker, installCaches, installUpstream, call, adbFlight, adbTime, HOUR } from "./helpers.mjs";

const MIN = 60e3;
const today = () => new Date().toISOString().slice(0, 10);

/** A raw AeroDataBox leg between two airports (not necessarily Bristol). */
const leg = ({ number, from, to, depMs, arrMs, arrDelay = 0, status = "Expected", runway = false, reg = "G-UZHA" }) => ({
  number, status,
  departure: { airport: { iata: from }, scheduledTime: adbTime(depMs) },
  arrival: {
    airport: { iata: to }, scheduledTime: adbTime(arrMs),
    ...(arrDelay ? { revisedTime: adbTime(arrMs + arrDelay * MIN) } : {}),
    ...(runway ? { runwayTime: adbTime(arrMs + arrDelay * MIN) } : {}),
  },
  aircraft: { reg }, airline: { iata: "U2", name: "easyJet" },
});

describe("worker: /api/inbound (previous flight of the same aircraft)", { skip: !workerExists && "CloudFlare/ is git-ignored here" }, () => {
  let worker, up, now;
  beforeEach(async () => {
    mock.timers.reset();
    now = Date.now();
    mock.timers.enable({ apis: ["Date"], now });
    installCaches();
    up = installUpstream();
    worker = await loadWorker();
    // our flight: U2 7075 BRS -> AMS leaving in 1 h with aircraft G-UZHA
    up.state.byNumber = () => [adbFlight({ number: "U2 7075", side: "dep", other: "AMS", sched: now + HOUR, reg: "G-UZHA" })];
  });
  const q = (extra = "") => call(worker, `/api/inbound?flight_iata=${encodeURIComponent("U2 7075")}&type=departure&date=${today()}${extra}`);

  test("late inbound: reports it and the knock-on delay", async () => {
    // arrives AMS->BRS due in 10 min but 35 min late => ready 10+35+30 = 75 min from now; we leave in 60 => +15
    up.state.byReg = () => [leg({ number: "U2 7076", from: "AMS", to: "BRS", depMs: now - 80 * MIN, arrMs: now + 10 * MIN, arrDelay: 35 })];
    const j = await (await q()).json();
    assert.equal(j.available, true);
    assert.equal(j.reg, "G-UZHA");
    assert.equal(j.inbound.number, "U2 7076");
    assert.equal(j.inbound.from, "AMS");
    assert.equal(j.inbound.to, "BRS");
    assert.equal(j.inbound.delay, 35);
    assert.equal(j.inbound.landed, false);
    assert.equal(j.additionalDelayMin, 15);
    assert.equal(j.turnaroundMin, 30);
  });

  test("inbound already landed on time: no knock-on delay", async () => {
    up.state.byReg = () => [leg({ number: "U2 7076", from: "AMS", to: "BRS", depMs: now - 150 * MIN, arrMs: now - 30 * MIN, runway: true, status: "Arrived" })];
    const j = await (await q()).json();
    assert.equal(j.inbound.landed, true);
    assert.equal(j.additionalDelayMin, 0);
  });

  test("delay already reflected in this flight's own estimate is not counted twice", async () => {
    up.state.byNumber = () => [adbFlight({ number: "U2 7075", side: "dep", other: "AMS", sched: now + HOUR, delayMin: 20, reg: "G-UZHA" })];
    up.state.byReg = () => [leg({ number: "U2 7076", from: "AMS", to: "BRS", depMs: now - 80 * MIN, arrMs: now + 10 * MIN, arrDelay: 35 })];
    assert.equal((await (await q()).json()).additionalDelayMin, 0 + Math.max(0, (10 + 35 + 30) - 80), "ready at +75, we already expect to leave at +80");
  });

  test("chooses the latest arrival at the origin BEFORE departure; ignores other airports, later flights and itself", async () => {
    up.state.byReg = () => [
      leg({ number: "U2 1111", from: "PMI", to: "BRS", depMs: now - 8 * HOUR, arrMs: now - 5 * HOUR }),
      leg({ number: "U2 7076", from: "AMS", to: "BRS", depMs: now - 100 * MIN, arrMs: now - 20 * MIN }),     // <- the one
      leg({ number: "U2 2222", from: "BRS", to: "FAO", depMs: now - 3 * HOUR, arrMs: now - 30 * MIN }),       // arrives elsewhere
      leg({ number: "U2 3333", from: "AMS", to: "BRS", depMs: now + 3 * HOUR, arrMs: now + 5 * HOUR }),       // after we leave
      leg({ number: "U2 7075", from: "BRS", to: "AMS", depMs: now + HOUR, arrMs: now + 2 * HOUR }),           // this very flight
    ];
    assert.equal((await (await q()).json()).inbound.number, "U2 7076");
  });

  test("falls back to the previous day for an aircraft that night-stopped", async () => {
    const yesterday = new Date(now - 24 * HOUR).toISOString().slice(0, 10);
    up.state.byReg = (reg, url) => url.endsWith(`/${yesterday}`)
      ? [leg({ number: "U2 9000", from: "AMS", to: "BRS", depMs: now - 20 * HOUR, arrMs: now - 18 * HOUR, runway: true, status: "Arrived" })]
      : [];
    const j = await (await q()).json();
    assert.equal(j.inbound.number, "U2 9000");
    assert.ok(up.calls.some((u) => u.includes("/flights/reg/") && u.endsWith(`/${yesterday}`)));
  });

  test("not available (with a reason) when there is nothing to report", async () => {
    up.state.byReg = () => [];
    assert.deepEqual(await (await q()).json(), { available: false, reason: "no_inbound_found" });

    up.calls.length = 0;
    up.state.byNumber = () => [adbFlight({ number: "U2 7075", side: "dep", other: "AMS", sched: now + HOUR, reg: "" })];
    installCaches();
    assert.deepEqual(await (await q()).json(), { available: false, reason: "no_registration" });
    assert.ok(!up.calls.some((u) => u.includes("/flights/reg/")), "no registration = no wasted aircraft lookups");

    installCaches();
    up.state.byNumber = () => null;                                  // 204: flight unknown
    assert.deepEqual(await (await q()).json(), { available: false, reason: "flight_not_found" });
  });

  test("arrival pages look at the aircraft's previous flight into the ORIGIN airport", async () => {
    up.state.byNumber = () => [adbFlight({ number: "U2 2806", side: "arr", other: "KGS", sched: now + 3 * HOUR, reg: "G-UZHA" })];
    // our flight: KGS -> BRS, departs KGS 3 h earlier than it lands = now. Previous leg lands at KGS.
    up.state.byReg = () => [leg({ number: "U2 2805", from: "ATH", to: "KGS", depMs: now - 3 * HOUR, arrMs: now - 10 * MIN, arrDelay: 40 })];
    const r = await call(worker, `/api/inbound?flight_iata=${encodeURIComponent("U2 2806")}&type=arrival&date=${today()}`);
    const j = await r.json();
    assert.equal(j.available, true);
    assert.equal(j.inbound.number, "U2 2805");
    assert.equal(j.inbound.to, "KGS");
  });

  test("validation and access control", async () => {
    assert.equal((await call(worker, "/api/inbound?flight_iata=%3Cx%3E&type=departure")).status, 400);
    assert.equal((await call(worker, "/api/inbound?flight_iata=U27075&type=sideways")).status, 400);
    assert.equal((await call(worker, "/api/inbound?flight_iata=U27075&type=departure&date=nope")).status, 400);
    assert.equal((await call(worker, "/api/inbound?flight_iata=U27075&type=departure", { origin: "https://evil.example" })).status, 403);
    assert.equal((await call(worker, "/api/inbound?flight_iata=U27075&type=departure", { origin: null })).status, 403);
  });

  test("provider failure is a clean 502, not a crash", async () => {
    up.state.status = 429;
    const r = await q();
    assert.equal(r.status, 502);
    assert.deepEqual(await r.json(), { error: "upstream", status: 429 });
  });

  test("health advertises the feature", async () => {
    assert.equal((await (await call(worker, "/api/health", { origin: null })).json()).features.inbound, true);
  });
});
