import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { workerExists, loadWorker, installCaches, installUpstream, call, adbFlight, HOUR } from "./helpers.mjs";

const today = () => new Date().toISOString().slice(0, 10);
const withLoc = (f, extra = {}) => ({
  ...f,
  location: {
    lat: 49.5, lon: -4.25, altitude: { feet: 36012.4 }, groundSpeed: { kt: 441 }, trueTrack: { deg: 128.4 },
    vsiFpm: 0, reportedAtUtc: new Date(Date.now() - 120e3).toISOString().replace(/\.\d+Z$/, "Z"), ...extra,
  },
});

describe("worker: live aircraft position (/api/flights?live=1)", { skip: !workerExists && "CloudFlare/ is git-ignored here" }, () => {
  let worker, up, now;
  beforeEach(async () => {
    mock.timers.reset();
    now = Date.now();
    mock.timers.enable({ apis: ["Date"], now });
    installCaches();
    up = installUpstream();
    worker = await loadWorker();
    up.state.byNumber = (_n, url) => [url.includes("withLocation=true")
      ? withLoc(adbFlight({ number: "U2 2806", sched: now + 30 * 60e3, status: "EnRoute" }))
      : adbFlight({ number: "U2 2806", sched: now + 30 * 60e3, status: "EnRoute" })];
  });
  const get = (live = "") => call(worker, `/api/flights?flight_iata=${encodeURIComponent("U2 2806")}&arr_iata=BRS&date=${today()}${live}`);

  test("live=1 asks the provider for location and returns a tidy position", async () => {
    const [f] = await (await get("&live=1")).json();
    assert.ok(up.calls.some((u) => u.includes("withLocation=true")));
    assert.deepEqual(f.position, { lat: 49.5, lon: -4.25, altitudeFt: 36012.4, speedKt: 441, trackDeg: 128.4, vsiFpm: 0, reportedAt: f.position.reportedAt });
    assert.ok(Date.parse(f.position.reportedAt) > now - 5 * 60e3);
  });

  test("without live=1 no location is requested (and position is null)", async () => {
    const [f] = await (await get()).json();
    assert.ok(!up.calls.some((u) => u.includes("withLocation")), "no extra provider cost");
    assert.equal(f.position, null);
  });

  test("plan/option rejected (403): retries without location, so the refresh still works", async () => {
    up.state.byNumber = (_n, url) => (url.includes("withLocation") ? "REJECT" : [adbFlight({ number: "U2 2806", sched: now + 30 * 60e3, status: "EnRoute" })]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => String(input).includes("withLocation")
      ? new Response("{}", { status: 403 }) : realFetch(input, init);
    const r = await get("&live=1");
    assert.equal(r.status, 200);
    const [f] = await r.json();
    assert.equal(f.flight.number, "U2 2806");
    assert.equal(f.position, null);
  });

  test("a provider outage (429) is NOT retried without location — that would double the load", async () => {
    up.state.status = 429;
    const r = await get("&live=1");
    assert.equal(r.status, 502);
    assert.equal(up.calls.length, 1);
  });

  test("garbage or missing coordinates give position:null, never NaN", async () => {
    for (const bad of [{ lat: "x" }, { lon: null }, { lat: undefined }]) {
      installCaches();
      up.state.byNumber = () => [withLoc(adbFlight({ number: "U2 2806", sched: now + 30 * 60e3 }), bad)];
      const [f] = await (await get("&live=1")).json();
      assert.equal(f.position, null, JSON.stringify(bad));
    }
  });

  test("missing altitude/speed/track stay null while the position still comes through", async () => {
    up.state.byNumber = () => [withLoc(adbFlight({ number: "U2 2806", sched: now + 30 * 60e3 }), { altitude: undefined, groundSpeed: null, trueTrack: undefined })];
    const [f] = await (await get("&live=1")).json();
    assert.equal(f.position.lat, 49.5);
    assert.equal(f.position.altitudeFt, null);
    assert.equal(f.position.speedKt, null);
    assert.equal(f.position.trackDeg, null);
  });

  test("health advertises position support", async () => {
    assert.equal((await (await call(worker, "/api/health", { origin: null })).json()).features.position, true);
  });
});
