import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { workerExists, loadWorker, installCaches, installUpstream, call, adbFlight, HOUR } from "./helpers.mjs";

const NOW = () => Date.now();
const today = () => new Date().toISOString().slice(0, 10);

describe("worker: share previews (/s/…)", { skip: !workerExists && "CloudFlare/ is git-ignored here" }, () => {
  let worker, up;
  beforeEach(async () => {
    mock.timers.reset();
    mock.timers.enable({ apis: ["Date"], now: Date.now() });
    installCaches();
    up = installUpstream();
    worker = await loadWorker();
    up.state.byNumber = (n) => n.replace(/\s/g, "") === "U22806"
      ? [adbFlight({ number: "U2 2806", sched: NOW() + 30 * 60e3, delayMin: 15, status: "Approaching" })] : null;
  });
  const get = (p, o = {}) => call(worker, p, { origin: null, ...o });   // link scrapers send no Origin

  test("scrapers get flight-specific og tags with live status; no Origin needed", async () => {
    const r = await get(`/s/arrival/${encodeURIComponent("U2 2806")}/${today()}?p=Kos`);
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.match(html, /<meta property="og:title" content="U2 2806 from Kos">/);
    assert.match(html, /<meta property="og:description" content="Expected at Bristol \d\d:\d\d \(scheduled \d\d:\d\d\) · Delayed 15 min">/);
    assert.match(html, /og:image" content="https:\/\/flightapp\.chiffers\.com\/assets\/icon-512\.png"/);
    assert.match(html, /<title>U2 2806 from Kos<\/title>/);
  });

  test("og:url points at the preview itself (not the app, whose generic tags would replace ours)", async () => {
    const html = await (await get(`/s/arrival/U2%202806/${today()}?p=Kos`)).text();
    assert.match(html, /og:url" content="https:\/\/w\.example\/s\/arrival\/U2%202806\/\d{4}-\d{2}-\d{2}\?p=Kos"/);
  });

  test("people are sent on to the app by script; no-JS visitors get a refresh inside <noscript>; scrapers are not redirected by meta-refresh", async () => {
    const html = await (await get(`/s/arrival/U2%202806/${today()}?p=Kos`)).text();
    const app = `https://flightapp.chiffers.com/flight-details.html?type=arrival&flight=U2%202806&date=${today()}`;
    assert.ok(html.includes(`location.replace(${JSON.stringify(app)})`), "JS redirect to the app");
    const attr = app.replaceAll("&", "&amp;");                  // correct HTML escaping inside attributes
    assert.ok(html.includes(`<noscript><meta http-equiv="refresh" content="0;url=${attr}"></noscript>`));
    assert.equal(html.match(/http-equiv="refresh"/g).length, 1, "the only meta refresh is the <noscript> one");
    assert.ok(html.includes(`<a href="${attr}">`), "plain link fallback");
  });

  test("the redirect target is always our own app (cannot be used as an open redirect)", async () => {
    for (const p of [`/s/arrival/U2%202806/${today()}?p=${encodeURIComponent("//evil.example")}`, `/s/arrival/U2%202806/${today()}?url=https://evil.example`]) {
      const html = await (await get(p)).text();
      const targets = [...html.matchAll(/location\.replace\(("[^"]*")\)/g)].map((m) => JSON.parse(m[1]));
      assert.ok(targets.length === 1 && targets[0].startsWith("https://flightapp.chiffers.com/flight-details.html?"), targets.join());
    }
  });

  test("injection through the place name or flight is escaped / rejected", async () => {
    const evil = `"><script>alert(1)</script><img src=x onerror=alert(2)>`;
    const html = await (await get(`/s/arrival/U2%202806/${today()}?p=${encodeURIComponent(evil)}`)).text();
    assert.ok(!html.includes("<script>alert"), "no raw script from the query");
    assert.ok(!html.includes("<img src=x"), "no raw tag from the query");
    assert.equal((html.match(/<script>/g) || []).length, 1, "only our own redirect script");
    for (const bad of ["%3Cscript%3E", "U2%202806%22%3E", "ZZZZZZZZZZZZZ", "U"]) {
      assert.equal((await get(`/s/arrival/${bad}/${today()}`)).status, 404, bad);
    }
    assert.equal((await get(`/s/arrival/U2%202806/2026-13-45`)).status, 404, "impossible date");
    assert.equal((await get(`/s/sideways/U2%202806/${today()}`)).status, 404, "unknown type");
  });

  test("landed, departed and cancelled read naturally", async () => {
    up.state.byNumber = () => [adbFlight({ number: "BA 123", sched: NOW() - 30 * 60e3, delayMin: 5, runway: true, status: "Arrived", airline: { iata: "BA", name: "BA" } })];
    let html = await (await get(`/s/arrival/BA%20123/${today()}?p=London`)).text();
    assert.match(html, /content="Landed at Bristol \d\d:\d\d"/);
    up.state.byNumber = () => [adbFlight({ number: "U2 7075", side: "dep", other: "AMS", sched: NOW() - 20 * 60e3, status: "Departed", runway: true })];
    html = await (await get(`/s/departure/U2%207075/${today()}?p=Amsterdam`)).text();
    assert.match(html, /og:title" content="U2 7075 to Amsterdam"/);
    assert.match(html, /content="Departed Bristol \d\d:\d\d"/);
    up.state.byNumber = () => [adbFlight({ number: "FR 999", sched: NOW() + 2 * HOUR, status: "Canceled" })];
    html = await (await get(`/s/arrival/FR%20999/${today()}?p=Dublin`)).text();
    assert.match(html, /og:description" content="Cancelled"/);
  });

  test("without ?p the origin airport code is used", async () => {
    const html = await (await get(`/s/arrival/U2%202806/${today()}`)).text();
    assert.match(html, /og:title" content="U2 2806 from KGS"/);
  });

  test("a provider outage never breaks a shared link", async () => {
    up.state.status = 429;
    const r = await get(`/s/arrival/U2%202806/${today()}?p=Kos`);
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(html, /og:description" content="Live flight status at Bristol Airport"/);
    assert.ok(html.includes("location.replace("));
  });

  test("dates far from today do not spend any quota", async () => {
    up.calls.length = 0;
    await get(`/s/arrival/U2%202806/2020-01-01?p=Kos`);
    await get(`/s/arrival/U2%202806/2099-01-01?p=Kos`);
    assert.equal(up.calls.length, 0);
  });

  test("health advertises the preview feature", async () => {
    const j = await (await get("/api/health")).json();
    assert.equal(j.features.preview, true);
  });
});
