import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  workerExists, loadWorker, installCaches, installUpstream, call, adbFlight, makePushEnv, makeBrowser, APP_ORIGIN, HOUR,
} from "./helpers.mjs";

const MIN = 60e3;
const today = () => new Date().toISOString().slice(0, 10);
const NO = encodeURIComponent("U2 2806");

describe("worker: Web Push crypto (RFC 8291 + VAPID RFC 8292)", { skip: !workerExists && "CloudFlare/ is git-ignored here" }, () => {
  let I;
  beforeEach(async () => { I = (await loadWorker())._internals; });

  test("matches the RFC 8291 Appendix A test vector exactly", async () => {
    const b = (s) => I.b64uDecode(s);
    const pub = b("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
    const privateKey = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", x: I.b64uEncode(pub.slice(1, 33)), y: I.b64uEncode(pub.slice(33, 65)), ext: true }, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const publicKey = await crypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, true, []);
    const body = await I.encryptWebPush(
      { keys: { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" } },
      new TextEncoder().encode("When I grow up, I want to be a watermelon"),
      { salt: b("DGv6ra1nlYgDCS1FRnbzlw"), serverKeyPair: { privateKey, publicKey } },
    );
    assert.equal(I.b64uEncode(body), "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
  });

  test("round trip: a browser can decrypt what we encrypt (unicode included)", async () => {
    const br = await makeBrowser();
    const msg = { title: "U2 2806 has landed", body: "Landed 15:22 ✈ — ünï", n: 42 };
    const body = await I.encryptWebPush(br.subscription, new TextEncoder().encode(JSON.stringify(msg)));
    assert.deepEqual(await br.decrypt(body), msg);
  });

  test("every message uses fresh randomness", async () => {
    const br = await makeBrowser();
    const a = await I.encryptWebPush(br.subscription, new TextEncoder().encode("x"));
    const b = await I.encryptWebPush(br.subscription, new TextEncoder().encode("x"));
    assert.notEqual(I.b64uEncode(a), I.b64uEncode(b));
  });

  test("tampered ciphertext, wrong auth secret and bad keys are rejected", async () => {
    const br = await makeBrowser();
    const body = await I.encryptWebPush(br.subscription, new TextEncoder().encode("hello"));
    const bad = body.slice(); bad[bad.length - 3] ^= 1;
    await assert.rejects(() => br.decrypt(bad));
    await assert.rejects(() => I.encryptWebPush({ keys: { p256dh: "AAAA", auth: br.subscription.keys.auth } }, new TextEncoder().encode("x")), /bad subscription keys/);
    await assert.rejects(() => I.encryptWebPush({ keys: { p256dh: br.subscription.keys.p256dh, auth: "AA" } }, new TextEncoder().encode("x")), /bad subscription keys/);
    await assert.rejects(() => I.encryptWebPush(br.subscription, new Uint8Array(5000)), /too large/);
  });

  test("VAPID header: valid ES256 JWT for the push service's origin, 12 h expiry, our contact", async () => {
    const env = await makePushEnv();
    const header = await I.vapidAuthorization(env, "https://updates.push.services.mozilla.com/wpush/v2/abc");
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
    assert.ok(m, header);
    const [, h, c, sig, k] = m;
    assert.equal(k, env.VAPID_PUBLIC_KEY);
    assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(Buffer.from(c, "base64url"));
    assert.equal(claims.aud, "https://updates.push.services.mozilla.com");
    assert.equal(claims.sub, "mailto:owner@example.com");
    const left = claims.exp - Date.now() / 1000;
    assert.ok(left > 11 * 3600 && left <= 12 * 3600 + 5, `exp in ${left}s`);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, env._vapidPublicKey, Buffer.from(sig, "base64url"), new TextEncoder().encode(`${h}.${c}`));
    assert.equal(ok, true, "signature verifies against the advertised public key");
  });

  test("only real push services are accepted as endpoints (no open relay)", () => {
    for (const ok of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/Qx", "https://wns2-par02p.notify.windows.com/w/?token=x"]) assert.equal(I.pushEndpointAllowed(ok), true, ok);
    for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://169.254.169.254/latest", "https://localhost/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "javascript:alert(1)", "not a url", ""]) assert.equal(I.pushEndpointAllowed(bad), false, bad);
  });
});

describe("worker: deciding what is worth a notification", { skip: !workerExists && "CloudFlare/ is git-ignored here" }, () => {
  let I;
  beforeEach(async () => { mock.timers.reset(); mock.timers.enable({ apis: ["Date"], now: Date.now() }); I = (await loadWorker())._internals; });

  const flightAt = (over = {}, side = "arr") => {
    const raw = adbFlight({ number: "U2 2806", side, other: side === "arr" ? "KGS" : "AMS", sched: Date.now() + 30 * MIN, ...over });
    return raw;
  };
  // normalised flights come from the real normaliser: build via the worker's own pipeline using a fake call
  async function norm(over, side = "arr") {
    installCaches(); const up = installUpstream();
    up.state.byNumber = () => [flightAt(over, side)];
    const w = await loadWorker();
    const r = await call(w, `/api/flights?flight_iata=${NO}&${side === "arr" ? "arr_iata" : "dep_iata"}=BRS&date=${today()}`);
    return (await r.json())[0];
  }
  const step = async (type, over, state, place = "Kos") => I.decidePushMessages({ type, flight: await norm(over, type === "arrival" ? "arr" : "dep"), state, place });

  test("first look is only a baseline: nothing already true is announced", async () => {
    const r = await step("arrival", { delayMin: 40, status: "Approaching" }, null);
    assert.deepEqual(r.messages, []);
    assert.equal(r.state.init, true);
    assert.equal(r.state.delayNotified, 40, "they subscribed knowing it is late");
  });

  test("arrival: landed → one message with a likely-out time; never repeated", async () => {
    let { state } = await step("arrival", {}, null);
    let r = await step("arrival", { sched: Date.now() - 5 * MIN, runway: true, status: "Arrived", delayMin: 3 }, state);
    assert.equal(r.messages.length, 1);
    assert.match(r.messages[0].title, /^U2 2806 from Kos has landed$/);
    assert.match(r.messages[0].body, /^Landed at Bristol \d\d:\d\d — likely out around \d\d:\d\d\.$/);
    assert.equal(r.messages[0].tag, "U2 2806-landed");
    r = await step("arrival", { sched: Date.now() - 5 * MIN, runway: true, status: "Arrived", delayMin: 3 }, r.state);
    assert.deepEqual(r.messages, []);
  });

  test("delay: told at 15+, again only when it moves by 10+, and when it is back on time", async () => {
    let { state } = await step("arrival", {}, null);
    let r = await step("arrival", { delayMin: 12 }, state);
    assert.deepEqual(r.messages, [], "12 min is not worth a buzz");
    r = await step("arrival", { delayMin: 20 }, r.state);
    assert.match(r.messages[0].title, /is running 20 min late/);
    assert.match(r.messages[0].body, /Now expected at Bristol \d\d:\d\d \(scheduled \d\d:\d\d\)\./);
    r = await step("arrival", { delayMin: 24 }, r.state);
    assert.deepEqual(r.messages, [], "only +4 since last message");
    r = await step("arrival", { delayMin: 35 }, r.state);
    assert.match(r.messages[0].title, /35 min late/);
    r = await step("arrival", { delayMin: 2 }, r.state);
    assert.match(r.messages[0].title, /is back on time/);
    r = await step("arrival", { delayMin: 2 }, r.state);
    assert.deepEqual(r.messages, []);
  });

  test("cancelled is announced once", async () => {
    let { state } = await step("arrival", {}, null);
    let r = await step("arrival", { status: "Canceled" }, state);
    assert.match(r.messages[0].title, /has been cancelled$/);
    r = await step("arrival", { status: "Canceled" }, r.state);
    assert.deepEqual(r.messages, []);
  });

  test("arrival: baggage belt announced when assigned and when it changes", async () => {
    let { state } = await step("arrival", { sched: Date.now() - 10 * MIN, runway: true, status: "Arrived" }, null);
    let r = await step("arrival", { sched: Date.now() - 10 * MIN, runway: true, status: "Arrived", belt: "3" }, state);
    assert.match(r.messages[0].title, /baggage belt 3$/);
    r = await step("arrival", { sched: Date.now() - 10 * MIN, runway: true, status: "Arrived", belt: "3" }, r.state);
    assert.deepEqual(r.messages, []);
    r = await step("arrival", { sched: Date.now() - 10 * MIN, runway: true, status: "Arrived", belt: "5" }, r.state);
    assert.match(r.messages[0].title, /baggage belt 5$/);
  });

  test("departure: gate assigned → changed → boarding → departed", async () => {
    let { state } = await step("departure", { sched: Date.now() + HOUR }, null, "Amsterdam");
    let r = await step("departure", { sched: Date.now() + HOUR, gate: "A4" }, state, "Amsterdam");
    assert.equal(r.messages[0].title, "U2 2806 to Amsterdam: gate A4");
    r = await step("departure", { sched: Date.now() + HOUR, gate: "B7" }, r.state, "Amsterdam");
    assert.equal(r.messages[0].title, "U2 2806 to Amsterdam: gate changed to B7");
    assert.equal(r.messages[0].body, "It was A4.");
    r = await step("departure", { sched: Date.now() + 20 * MIN, gate: "B7", status: "Boarding" }, r.state, "Amsterdam");
    assert.equal(r.messages[0].title, "U2 2806 to Amsterdam is boarding");
    assert.equal(r.messages[0].body, "Go to gate B7.");
    r = await step("departure", { sched: Date.now() - 2 * MIN, gate: "B7", status: "Departed", runway: true }, r.state, "Amsterdam");
    assert.match(r.messages[0].title, /has departed$/);
    assert.ok(r.state.doneAt);
  });

  test("a delayed flight that has already left is not reported as delayed", async () => {
    let { state } = await step("departure", { sched: Date.now() + HOUR }, null);
    const r = await step("departure", { sched: Date.now() - 30 * MIN, delayMin: 40, status: "Departed", runway: true }, state);
    assert.ok(r.messages.every((m) => !/late/.test(m.title)));
  });

  test("falls back to the airport code when no place name was given", async () => {
    let { state } = await step("arrival", {}, null, "");
    const r = await step("arrival", { status: "Canceled" }, state, "");
    assert.equal(r.messages[0].title, "U2 2806 has been cancelled");
  });
});

describe("worker: /api/push/* (config, subscribe, unsubscribe)", { skip: !workerExists && "CloudFlare/ is git-ignored here" }, () => {
  let worker, env, br;
  beforeEach(async () => {
    mock.timers.reset(); mock.timers.enable({ apis: ["Date"], now: Date.now() });
    installCaches(); installUpstream();
    worker = await loadWorker();
    env = await makePushEnv();
    br = await makeBrowser();
  });
  const post = (path, body, o = {}) => call(worker, path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), env, headers: { "Content-Type": "application/json" }, ...o });
  const good = (over = {}) => ({ subscription: br.subscription, flight: { type: "arrival", number: "U2 2806", date: today(), place: "Kos" }, ...over });

  test("config: disabled without configuration, enabled with the public key", async () => {
    const off = await (await call(worker, "/api/push/config", { env: {} })).json();
    assert.deepEqual(off, { enabled: false, publicKey: null });
    const on = await (await call(worker, "/api/push/config", { env })).json();
    assert.deepEqual(on, { enabled: true, publicKey: env.VAPID_PUBLIC_KEY });
    assert.equal((await (await call(worker, "/api/health", { origin: null, env })).json()).features.push, true);
    assert.equal((await (await call(worker, "/api/health", { origin: null, env: {} })).json()).features.push, false);
  });

  test("subscribe stores a record that expires after the flight, with the place name", async () => {
    const r = await post("/api/push/subscribe", good());
    assert.equal(r.status, 200);
    const keys = (await env.PUSH_SUBS.list({ prefix: "s:" })).keys.map((k) => k.name);
    assert.equal(keys.length, 1);
    assert.match(keys[0], new RegExp(`^s:[0-9a-f]{32}:arrival:U22806:${today()}$`));
    const rec = JSON.parse(await env.PUSH_SUBS.get(keys[0]));
    assert.equal(rec.endpoint, br.subscription.endpoint);
    assert.equal(rec.place, "Kos");
    assert.equal(rec.state, null);
    const ttl = rec.exp - Math.floor(Date.now() / 1000);
    assert.ok(ttl > 3600 && ttl <= 3 * 86400, `ttl ${ttl}`);
  });

  test("subscribing again keeps what we already told them; unsubscribe removes it", async () => {
    await post("/api/push/subscribe", good());
    const key = (await env.PUSH_SUBS.list({ prefix: "s:" })).keys[0].name;
    const rec = JSON.parse(await env.PUSH_SUBS.get(key));
    await env.PUSH_SUBS.put(key, JSON.stringify({ ...rec, state: { init: true, landed: true } }), { expiration: rec.exp });
    await post("/api/push/subscribe", good());
    assert.equal(JSON.parse(await env.PUSH_SUBS.get(key)).state.landed, true);
    assert.equal((await env.PUSH_SUBS.list({ prefix: "s:" })).keys.length, 1);
    assert.equal((await post("/api/push/unsubscribe", good())).status, 200);
    assert.equal((await env.PUSH_SUBS.list({ prefix: "s:" })).keys.length, 0);
  });

  test("validation: endpoint, keys, flight, date, size", async () => {
    const bad = async (body, status = 400, msg = "") => assert.equal((await post("/api/push/subscribe", body)).status, status, msg || JSON.stringify(body).slice(0, 80));
    await bad(good({ subscription: { ...br.subscription, endpoint: "https://evil.example/x" } }));
    await bad(good({ subscription: { ...br.subscription, endpoint: "http://fcm.googleapis.com/x" } }));
    await bad(good({ subscription: { endpoint: br.subscription.endpoint, keys: { p256dh: "AAAA", auth: br.subscription.keys.auth } } }));
    await bad(good({ subscription: { endpoint: br.subscription.endpoint, keys: { p256dh: br.subscription.keys.p256dh, auth: "AA" } } }));
    await bad(good({ subscription: { endpoint: br.subscription.endpoint } }));
    await bad(good({ flight: { type: "sideways", number: "U2 2806", date: today() } }));
    await bad(good({ flight: { type: "arrival", number: "<script>", date: today() } }));
    await bad(good({ flight: { type: "arrival", number: "U2 2806", date: "2020-01-01" } }), 400, "date far in the past");
    await bad(good({ flight: { type: "arrival", number: "U2 2806", date: "nope" } }));
    await bad("not json at all");
    await bad("x".repeat(5000));
    assert.equal((await env.PUSH_SUBS.list({ prefix: "s:" })).keys.length, 0, "nothing stored for rejected requests");
  });

  test("the place name is sanitised", async () => {
    await post("/api/push/subscribe", good({ flight: { type: "arrival", number: "U2 2806", date: today(), place: `<img src=x onerror=1>São Paulo` } }));
    const rec = JSON.parse(await env.PUSH_SUBS.get((await env.PUSH_SUBS.list({ prefix: "s:" })).keys[0].name));
    assert.ok(!/[<>=]/.test(rec.place), rec.place);
    assert.match(rec.place, /São Paulo/);
  });

  test("access control: only our own sites; not configured = 503; wrong method", async () => {
    assert.equal((await post("/api/push/subscribe", good(), { origin: "https://evil.example" })).status, 403);
    assert.equal((await post("/api/push/subscribe", good(), { origin: null })).status, 403);
    const notConfigured = await call(worker, "/api/push/subscribe", { method: "POST", body: JSON.stringify(good()), env: {} });
    assert.equal(notConfigured.status, 503);
    assert.equal((await call(worker, "/api/push/subscribe", { env })).status, 405);
  });

  test("one browser can follow at most 10 flights", async () => {
    for (let i = 0; i < 10; i++) assert.equal((await post("/api/push/subscribe", good({ flight: { type: "arrival", number: `U2 ${2800 + i}`, date: today() } }))).status, 200);
    assert.equal((await post("/api/push/subscribe", good({ flight: { type: "arrival", number: "U2 2899", date: today() } }))).status, 429);
    assert.equal((await post("/api/push/subscribe", good({ flight: { type: "arrival", number: "U2 2800", date: today() } }))).status, 200, "re-subscribing to one you already follow is fine");
    const other = await makeBrowser();
    assert.equal((await post("/api/push/subscribe", good({ subscription: other.subscription }))).status, 200, "limit is per browser");
  });

  test("CORS preflight allows POST with a JSON body", async () => {
    const r = await call(worker, "/api/push/subscribe", { method: "OPTIONS", env });
    assert.equal(r.status, 204);
    assert.match(r.headers.get("Access-Control-Allow-Methods"), /POST/);
    assert.match(r.headers.get("Access-Control-Allow-Headers"), /Content-Type/);
  });
});

describe("worker: scheduled job", { skip: !workerExists && "CloudFlare/ is git-ignored here" }, () => {
  let worker, env, up, br, now;
  beforeEach(async () => {
    mock.timers.reset(); now = Date.now(); mock.timers.enable({ apis: ["Date"], now });
    installCaches(); up = installUpstream();
    worker = await loadWorker();
    env = await makePushEnv();
    br = await makeBrowser();
    // the flight starts as "on time, 30 min away"
    up.state.flight = { sched: now + 30 * MIN };
    up.state.byNumber = () => [adbFlight({ number: "U2 2806", sched: now + 30 * MIN, ...(up.state.flightOver || {}) })];
  });
  const post = (flight, browser = br) => call(worker, "/api/push/subscribe", { method: "POST", env, body: JSON.stringify({ subscription: browser.subscription, flight: { type: "arrival", number: "U2 2806", date: today(), place: "Kos", scheduled: new Date(now + 30 * MIN).toISOString(), ...flight } }), headers: { "Content-Type": "application/json" } });
  const cron = async () => { const pending = []; await worker.scheduled({}, env, { waitUntil: (p) => pending.push(p) }); await Promise.all(pending); };
  const job = () => worker._internals.runPushJob(env, { waitUntil: () => {} }, { force: true });   // force = ignore the adaptive cadence (tested separately)
  const tick = (min) => mock.timers.tick(min * MIN);

  test("without configuration the job does nothing", async () => {
    assert.deepEqual(await worker._internals.runPushJob({}, { waitUntil() {} }), { skipped: true });
  });

  test("baseline run is silent; landing then sends ONE encrypted push the browser can read; not repeated", async () => {
    await post();
    let s = await job();
    assert.equal(s.sent, 0);
    assert.equal(up.state.pushes.length, 0, "nothing announced about what was already true");

    tick(40);                                                    // flight has landed
    up.state.flightOver = { sched: now + 30 * MIN, runway: true, status: "Arrived", delayMin: 4 };
    s = await job();
    assert.equal(s.sent, 1);
    assert.equal(up.state.pushes.length, 1);
    const push = up.state.pushes[0];
    assert.equal(push.url, br.subscription.endpoint);
    assert.equal(push.headers["content-encoding"], "aes128gcm");
    assert.match(push.headers["authorization"], /^vapid t=.+, k=.+$/);
    assert.equal(push.headers["ttl"], "3600");
    const msg = await br.decrypt(push.body);
    assert.equal(msg.title, "U2 2806 from Kos has landed");
    assert.match(msg.body, /^Landed at Bristol \d\d:\d\d — likely out around \d\d:\d\d\.$/);
    assert.equal(msg.url, `${APP_ORIGIN}/flight-details.html?type=arrival&flight=U2%202806&date=${today()}`);
    assert.equal(msg.tag, "U2 2806-landed");

    tick(5);
    await job();
    assert.equal(up.state.pushes.length, 1, "no duplicate");
  });

  test("scheduled() runs the same job", async () => {
    await post();
    await cron();                                                // baseline
    tick(40);
    up.state.flightOver = { sched: now + 30 * MIN, runway: true, status: "Arrived" };
    await cron();
    assert.equal(up.state.pushes.length, 1);
  });

  test("many followers of one flight cost ONE provider lookup", async () => {
    const others = await Promise.all([makeBrowser(), makeBrowser(), makeBrowser()]);
    await post(); for (const o of others) await post({}, o);
    up.calls.length = 0;
    await job();
    assert.equal(up.calls.filter((u) => u.includes("/flights/number/")).length, 1);
    tick(40);
    up.state.flightOver = { sched: now + 30 * MIN, runway: true, status: "Arrived" };
    await job();
    assert.equal(up.state.pushes.length, 4);
    const dests = new Set(up.state.pushes.map((p) => p.url));
    assert.equal(dests.size, 4, "each follower gets their own message");
  });

  test("a subscription the push service reports gone (410/404) is deleted", async () => {
    await post(); await job();
    up.state.pushStatus = () => 410;
    tick(40); up.state.flightOver = { sched: now + 30 * MIN, status: "Canceled" };
    const s = await job();
    assert.equal(s.removed, 1);
    assert.equal((await env.PUSH_SUBS.list({ prefix: "s:" })).keys.length, 0);
  });

  test("a temporary push failure (5xx) is retried on the next run — the person is not silently skipped", async () => {
    await post(); await job();
    up.state.pushStatus = () => 503;
    tick(40); up.state.flightOver = { sched: now + 30 * MIN, status: "Canceled" };
    let s = await job();
    assert.equal(s.failed, 1);
    assert.equal((await env.PUSH_SUBS.list({ prefix: "s:" })).keys.length, 1, "kept");
    up.state.pushStatus = () => 201;
    tick(5);
    s = await job();
    assert.equal(s.sent, 1, "delivered on retry");
    assert.match((await br.decrypt(up.state.pushes.at(-1).body)).title, /cancelled/);
  });

  test("provider outage / unknown flight: nothing sent, subscription kept", async () => {
    await post(); await job();
    up.state.status = 429;
    tick(10);
    const s = await job();
    assert.equal(s.sent, 0);
    assert.equal((await env.PUSH_SUBS.list({ prefix: "s:" })).keys.length, 1);
  });

  test("expiry is preserved when state is saved, and finished arrivals are removed after 90 minutes", async () => {
    await post(); await job();
    const key = (await env.PUSH_SUBS.list({ prefix: "s:" })).keys[0].name;
    const exp = JSON.parse(await env.PUSH_SUBS.get(key)).exp;
    tick(40); up.state.flightOver = { sched: now + 30 * MIN, runway: true, status: "Arrived" };
    await job();
    assert.equal(JSON.parse(await env.PUSH_SUBS.get(key)).exp, exp, "original expiry kept");
    tick(60);
    await job();
    assert.ok(await env.PUSH_SUBS.get(key), "still followed 60 min after landing (belt may be announced)");
    tick(40);
    await job();
    assert.equal(await env.PUSH_SUBS.get(key), null, "removed 100 min after landing");
  });

  test("at most 40 distinct flights are checked per run", async () => {
    for (let i = 0; i < 45; i++) await post({ number: `U2 ${3000 + i}` }, await makeBrowser());   // one flight per browser (each browser is limited to 10)
    up.calls.length = 0;
    const s = await job();
    assert.equal(up.calls.filter((u) => u.includes("/flights/number/")).length, 40);
    assert.equal(s.subscriptions, 45);
  });

  test("a record about to expire is released instead of crashing the job (KV rejects expiry < 60 s away)", async () => {
    await post(); await job();
    const key = (await env.PUSH_SUBS.list({ prefix: "s:" })).keys[0].name;
    const rec = JSON.parse(await env.PUSH_SUBS.get(key));
    await env.PUSH_SUBS._m.set(key, { value: JSON.stringify({ ...rec, exp: Math.floor(Date.now() / 1000) + 30 }), exp: 0 });
    tick(10); up.state.flightOver = { sched: now + 30 * MIN, status: "Canceled" };
    const s = await job();                                         // would throw "Invalid expiration" if it tried to re-save
    assert.equal(s.sent, 1, "they still get the last message");
    assert.equal(await env.PUSH_SUBS.get(key), null);
  });

  test("a corrupt record is cleaned up and one bad subscription never stops everyone else's", async () => {
    const good = await makeBrowser();
    await post({}, good); await job();                                           // baseline for the good one
    await env.PUSH_SUBS.put(`s:${"0".repeat(32)}:arrival:U22806:${today()}`, "{not json", { expirationTtl: 3600 });
    const broken = { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/broken", keys: { p256dh: "AAAA", auth: "AAAA" } } };
    await env.PUSH_SUBS.put(`s:${"1".repeat(32)}:arrival:U22806:${today()}`, JSON.stringify({
      endpoint: broken.subscription.endpoint, keys: broken.subscription.keys, type: "arrival", number: "U2 2806", date: today(), place: "Kos",
      state: { init: true }, exp: Math.floor(Date.now() / 1000) + 3600,
    }), { expirationTtl: 3600 });
    tick(10); up.state.flightOver = { sched: now + 30 * MIN, status: "Canceled" };
    const s = await job();
    assert.equal(s.sent, 1, "the healthy subscriber was still notified");
    assert.equal(up.state.pushes.at(-1).url, good.subscription.endpoint);
    assert.equal(await env.PUSH_SUBS.get(`s:${"0".repeat(32)}:arrival:U22806:${today()}`), null, "corrupt entry removed");
    assert.ok(s.failed >= 1, "the broken subscription is counted, not fatal");
  });

  test("the service refuses new followers once the store is full (KV lists at most 1000 keys)", async () => {
    for (let i = 0; i < 1000; i++) await env.PUSH_SUBS.put(`s:${String(i).padStart(32, "0")}:arrival:X${i}:${today()}`, "{}", { expirationTtl: 3600 });
    const r = await post();
    assert.equal(r.status, 503);
  });

  test("adaptive schedule: dense around the flight, sparse far from it", async () => {
    const { checkIntervalSlots: slots } = worker._internals;
    const at = (deltaMin) => slots(now + deltaMin * MIN, now);
    assert.equal(at(8 * 60), 12, "8 h before: hourly");
    assert.equal(at(3 * 60), 3, "3 h before: every 15 min");
    assert.equal(at(60), 1, "1 h before: every 5 min");
    assert.equal(at(-10), 1, "just after: every 5 min");
    assert.equal(at(-60), 3, "1 h after: every 15 min");
    assert.equal(at(-3 * 60), 12, "3 h after: hourly");
    assert.equal(slots(NaN, now), 3, "unknown time: every 15 min");
  });

  test("a far-off flight is checked about once an hour, a near one every run (provider calls over an hour)", async () => {
    const lookups = () => up.calls.filter((u) => u.includes("/flights/number/")).length;
    const farPost = await post({ number: "U2 3001", scheduled: new Date(now + 10 * 60 * MIN).toISOString() }, await makeBrowser());
    const nearPost = await post({ number: "U2 3002", scheduled: new Date(now + 40 * MIN).toISOString() }, await makeBrowser());
    assert.equal(farPost.status, 200); assert.equal(nearPost.status, 200);
    const run = () => worker._internals.runPushJob(env, { waitUntil: () => {} });     // real cadence, no force
    await run();                                                                       // first run: baselines both
    up.calls.length = 0;
    for (let i = 0; i < 12; i++) { tick(5); await run(); }                             // one hour of 5-minute runs
    const far = up.calls.filter((u) => u.includes("/flights/number/U23001")).length;
    const near = up.calls.filter((u) => u.includes("/flights/number/U23002")).length;
    assert.equal(far, 1, `far-off flight looked up ${far} times in an hour (expected 1)`);
    assert.ok(near >= 6, `near flight looked up ${near} times (it moves into the dense window; expected many)`);
    assert.ok(lookups() < 12 * 2, "far fewer provider calls than checking everything every run");
  });

  test("a flight nobody has been checked for yet is always due (so subscribers get a baseline within 5 minutes)", async () => {
    const { groupDue } = worker._internals;
    assert.equal(groupDue("arrival:U22806:x", [{ state: null, sched: now + 20 * 60 * 60e3 }], now), true);
    const hits = (id) => { let n = 0; for (let i = 0; i < 12; i++) if (groupDue(id, [{ state: {}, sched: now + 20 * 60 * 60e3 }], now + i * 5 * MIN)) n++; return n; };
    assert.equal(hits("arrival:U22806:2026-10-04"), 1, "exactly one slot in twelve for a far flight");
    assert.equal(hits("departure:LS1889:2026-10-04"), 1);
    const near = (id) => { let n = 0; for (let i = 0; i < 12; i++) if (groupDue(id, [{ state: {}, sched: now + 12 * 60 * 60e3 + i * 5 * MIN }], now + 12 * 60 * 60e3 + i * 5 * MIN - 20 * MIN)) n++; return n; };
    assert.equal(near("arrival:U22806:2026-10-04"), 12, "every slot when due within 30 minutes");
  });

  test("subscribe stores the scheduled time, but ignores an absurd one", async () => {
    const recordFor = async (browser) => {
      for (const k of (await env.PUSH_SUBS.list({ prefix: "s:" })).keys) {
        const rec = JSON.parse(await env.PUSH_SUBS.get(k.name));
        if (rec.endpoint === browser.subscription.endpoint) return rec;
      }
    };
    const good = new Date(now + 2 * 3600e3).toISOString();
    await post({ scheduled: good });
    assert.equal((await recordFor(br)).sched, Date.parse(good));
    for (const bad of ["1999-01-01T00:00:00Z", "not a date", "", null, 12]) {
      const b = await makeBrowser();
      assert.equal((await post({ scheduled: bad }, b)).status, 200, "a bad scheduled time must not reject the subscription");
      assert.equal((await recordFor(b)).sched, null, `ignored: ${JSON.stringify(bad)}`);
    }
  });

  test("a flight that does not operate to Bristol is ignored quietly", async () => {
    up.state.byNumber = () => [adbFlight({ number: "U2 2806", side: "dep", other: "AMS", sched: now + 30 * MIN })];   // departs BRS, we follow the arrival
    await post();
    const s = await job();
    assert.equal(s.flights, 0);
    assert.equal(up.state.pushes.length, 0);
  });
});
