import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { workerExists, loadWorker, installCaches, installUpstream, call, board, APP_ORIGIN } from "./helpers.mjs";

// A timestamp near now, at the given minute past the (UTC) hour.
const atMinute = (m) => { const d = new Date(); d.setUTCMinutes(m, 0, 0); return d.getTime(); };

describe("worker: access control, resilience, quota", { skip: !workerExists && "CloudFlare/ is git-ignored here" }, () => {
  let worker, up, store;
  beforeEach(async () => {
    mock.timers.reset();
    mock.timers.enable({ apis: ["Date"], now: atMinute(10) });   // fixed point inside an hour keeps these tests deterministic
    store = installCaches();
    up = installUpstream();
    worker = await loadWorker();
  });

  test("data routes refuse requests that are not from our own sites", async () => {
    for (const route of ["/api/timetable?type=arrival", "/api/flights?flight_iata=U22806", "/api/history?flight_iata=U22806&arr_iata=BRS"]) {
      assert.equal((await call(worker, route, { origin: null })).status, 403, `${route} with no Origin/Referer`);
      assert.equal((await call(worker, route, { origin: "https://evil.example" })).status, 403, `${route} from another site`);
    }
    assert.equal(up.calls.length, 0, "no upstream call may be spent on refused requests");
  });

  test("allowed Origin, localhost and Referer-only all work", async () => {
    assert.equal((await call(worker, "/api/timetable?type=arrival")).status, 200);
    assert.equal((await call(worker, "/api/timetable?type=arrival", { origin: "http://localhost:8000" })).status, 200);
    assert.equal((await call(worker, "/api/timetable?type=departure", { origin: null, headers: { Referer: `${APP_ORIGIN}/index.html` } })).status, 200);
  });

  test("health is public and advertises features; quota only with the token", async () => {
    const r = await call(worker, "/api/health", { origin: null });
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.ok, true);
    assert.equal(j.features.history, true);
    assert.equal("quota" in j, false);
    const r2 = await call(worker, "/api/health?token=wrong", { origin: null, env: { HEALTH_TOKEN: "secret" } });
    assert.equal("quota" in (await r2.json()), false, "wrong token must not reveal quota");
  });

  test("CORS exposes the stale headers to the page", async () => {
    const r = await call(worker, "/api/timetable?type=arrival");
    assert.match(r.headers.get("Access-Control-Expose-Headers"), /X-Data-Stale/);
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), APP_ORIGIN);
  });

  test("provider outage: last good copy is served and flagged as stale", async () => {
    const live = await (await call(worker, "/api/timetable?type=arrival")).json();
    assert.ok(live.length >= 3);

    mock.timers.tick(10 * 60 * 1000);          // fresh cache (2 min) has expired; last-good copy (6 h) has not
    up.state.status = 429;
    const before = up.calls.length;
    const r = await call(worker, "/api/timetable?type=arrival");
    assert.equal(r.status, 200, "must not turn an outage into an error page");
    assert.equal(r.headers.get("X-Data-Stale"), "1");
    assert.ok(Date.parse(r.headers.get("X-Data-Updated")) < Date.now() - 9 * 60 * 1000, "reports when the data is from");
    assert.deepEqual((await r.json()).map((f) => f.flight.number), live.map((f) => f.flight.number));
    assert.ok(up.calls.length > before, "it did try the provider first");
  });

  test("outage during the hourly window rollover still serves the last good board", async () => {
    // The timetable is fetched as rolling hour-aligned windows, so its cache key changes on the hour.
    mock.timers.reset();
    mock.timers.enable({ apis: ["Date"], now: atMinute(55) });
    installCaches(); up = installUpstream(); worker = await loadWorker();
    const live = await (await call(worker, "/api/timetable?type=departure")).json();
    mock.timers.tick(10 * 60 * 1000);                          // now 5 minutes into the next hour
    up.state.status = 429;
    const r = await call(worker, "/api/timetable?type=departure");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("X-Data-Stale"), "1");
    assert.deepEqual((await r.json()).map((f) => f.flight.number), live.map((f) => f.flight.number));
  });

  test("a fresh board is never overwritten by stale data", async () => {
    const live = await (await call(worker, "/api/timetable?type=arrival")).json();
    mock.timers.tick(10 * 60 * 1000);
    up.state.status = 429;
    await call(worker, "/api/timetable?type=arrival");           // served stale
    mock.timers.tick(10 * 60 * 1000);
    const again = await (await call(worker, "/api/timetable?type=arrival")).json();
    assert.deepEqual(again.map((f) => f.flight.number), live.map((f) => f.flight.number));
  });

  test("stale data is not served forever: after 6 h the error comes through", async () => {
    await call(worker, "/api/timetable?type=arrival");
    mock.timers.tick(7 * 3600e3);
    up.state.status = 429;
    const r = await call(worker, "/api/timetable?type=arrival");
    assert.equal(r.status, 502);
    assert.deepEqual(await r.json(), { error: "upstream", status: 429 });
  });

  test("a failure is remembered briefly so visitors do not stampede the provider", async () => {
    up.state.status = 429;
    assert.equal((await call(worker, "/api/timetable?type=arrival")).status, 502);
    const n = up.calls.length;
    for (let i = 0; i < 5; i++) assert.equal((await call(worker, "/api/timetable?type=arrival")).status, 502);
    assert.equal(up.calls.length, n, "no more upstream calls inside the failure window");

    mock.timers.tick(20 * 1000);                // window over, provider recovered
    up.state.status = 200;
    assert.equal((await call(worker, "/api/timetable?type=arrival")).status, 200);
  });

  test("plan/permission failures (403) are retried only every few minutes", async () => {
    up.state.status = 403;
    assert.equal((await call(worker, "/api/history?flight_iata=U22806&arr_iata=BRS")).status, 502);
    const n = up.calls.length;
    mock.timers.tick(60 * 1000);
    await call(worker, "/api/history?flight_iata=U22806&arr_iata=BRS");
    assert.equal(up.calls.length, n, "still inside the 5 minute window");
    mock.timers.tick(5 * 60 * 1000);
    await call(worker, "/api/history?flight_iata=U22806&arr_iata=BRS");
    assert.ok(up.calls.length > n, "retried after the window");
  });

  test("quota headers are tracked; low quota is logged; health reveals it only with the token", async () => {
    up.state.headers = { "x-ratelimit-requests-remaining": "40", "x-ratelimit-requests-limit": "1000" };
    const warn = mock.method(console, "warn", () => {});
    await call(worker, "/api/timetable?type=arrival");
    assert.ok(warn.mock.calls.some((c) => /\[quota\].*40 of 1000/.test(String(c.arguments[0]))), "low quota warning logged");
    warn.mock.restore();

    const j = await (await call(worker, "/api/health?token=secret", { origin: null, env: { HEALTH_TOKEN: "secret" } })).json();
    assert.equal(j.quota.remaining, 40);
    assert.equal(j.quota.limit, 1000);
  });

  test("healthy quota does not log a warning", async () => {
    up.state.headers = { "x-ratelimit-requests-remaining": "900", "x-ratelimit-requests-limit": "1000" };
    const warn = mock.method(console, "warn", () => {});
    await call(worker, "/api/timetable?type=arrival");
    assert.equal(warn.mock.calls.length, 0);
    warn.mock.restore();
  });

  test("timetable still de-duplicates codeshares and derives delay (regression)", async () => {
    const arr = await (await call(worker, "/api/timetable?type=arrival")).json();
    const nums = arr.map((f) => f.flight.number);
    assert.ok(nums.includes("U2 2806") && !nums.includes("EC 2806"));
    assert.deepEqual(arr.find((f) => f.flight.number === "U2 2806").codeshares, ["EC 2806"]);
    assert.equal(arr.find((f) => f.flight.number === "U2 2806").arrival.delay, 15);
    assert.equal(arr.find((f) => f.flight.number === "BA 123").status, "landed");
    assert.equal(arr.find((f) => f.flight.number === "FR 999").status, "cancelled");
  });
});
