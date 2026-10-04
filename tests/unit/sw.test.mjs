// Runs sw.js in a sandbox with a fake service-worker scope, to test push + notificationclick without a browser.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./load.mjs";

function loadSw() {
  const listeners = {};
  const shown = [];
  const opened = [];
  const state = { windows: [] };
  const self = {
    location: new URL("https://flightapp.chiffers.com/sw.js"),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting() {},
    registration: { showNotification: async (title, opts) => { shown.push({ title, opts }); } },
    clients: {
      matchAll: async () => state.windows,
      openWindow: async (url) => { opened.push(url); },
      claim: async () => {},
    },
  };
  const ctx = vm.createContext({ self, caches: { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [], delete: async () => {}, match: async () => undefined }, fetch: async () => new Response("x"), URL, Request, Response, console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), ctx, { filename: "sw.js" });
  const fire = async (type, event) => { const waits = []; event.waitUntil = (p) => waits.push(p); listeners[type](event); await Promise.all(waits); };
  return { fire, shown, opened, state, listeners };
}

describe("sw.js: push notifications", () => {
  test("a push becomes a visible notification with the worker's text, tag and link", async () => {
    const sw = loadSw();
    await sw.fire("push", { data: { json: () => ({ title: "U2 2806 from Kos has landed", body: "Landed at Bristol 15:22.", tag: "U2 2806-landed", url: "https://flightapp.chiffers.com/flight-details.html?type=arrival&flight=U2%202806&date=2026-10-04" }) } });
    assert.equal(sw.shown.length, 1);
    const n = sw.shown[0];
    assert.equal(n.title, "U2 2806 from Kos has landed");
    assert.equal(n.opts.body, "Landed at Bristol 15:22.");
    assert.equal(n.opts.tag, "U2 2806-landed");
    assert.equal(n.opts.renotify, true, "a newer message about the same thing alerts again");
    assert.equal(n.opts.data.url, "https://flightapp.chiffers.com/flight-details.html?type=arrival&flight=U2%202806&date=2026-10-04");
    assert.ok(n.opts.icon && n.opts.badge);
  });

  test("always shows something, even for an empty or non-JSON push (iOS and Chrome require it)", async () => {
    for (const data of [null, { json: () => { throw new Error("not json"); }, text: () => "plain text" }, { json: () => ({}) }]) {
      const sw = loadSw();
      await sw.fire("push", { data });
      assert.equal(sw.shown.length, 1);
      assert.equal(sw.shown[0].title, "Bristol Flights");
    }
    const sw = loadSw();
    await sw.fire("push", { data: { json: () => { throw new Error("x"); }, text: () => "plain text" } });
    assert.equal(sw.shown[0].opts.body, "plain text");
  });

  test("no tag means no renotify flag (it would throw in browsers)", async () => {
    const sw = loadSw();
    await sw.fire("push", { data: { json: () => ({ title: "t", body: "b" }) } });
    assert.equal(sw.shown[0].opts.renotify, false);
    assert.equal(sw.shown[0].opts.tag, undefined);
  });

  test("tapping a notification focuses an open app window and navigates it to the flight", async () => {
    const sw = loadSw();
    const calls = [];
    sw.state.windows = [{ url: "https://flightapp.chiffers.com/index.html", navigate: async (u) => calls.push(["navigate", u]), focus: async () => calls.push(["focus"]) }];
    let closed = false;
    await sw.fire("notificationclick", { notification: { close: () => { closed = true; }, data: { url: "https://flightapp.chiffers.com/flight-details.html?type=arrival&flight=U2%202806&date=2026-10-04" } } });
    assert.equal(closed, true);
    assert.deepEqual(calls, [["navigate", "https://flightapp.chiffers.com/flight-details.html?type=arrival&flight=U2%202806&date=2026-10-04"], ["focus"]]);
    assert.deepEqual(sw.opened, []);
  });

  test("with no app window open it opens one; windows of other sites are never hijacked", async () => {
    const sw = loadSw();
    const hijacked = [];
    sw.state.windows = [{ url: "https://evil.example/", navigate: async (u) => hijacked.push(u), focus: async () => hijacked.push("focus") }];
    await sw.fire("notificationclick", { notification: { close() {}, data: { url: "https://flightapp.chiffers.com/flight-details.html?type=departure&flight=U2%207075&date=2026-10-04" } } });
    assert.deepEqual(hijacked, []);
    assert.deepEqual(sw.opened, ["https://flightapp.chiffers.com/flight-details.html?type=departure&flight=U2%207075&date=2026-10-04"]);
  });

  test("a notification without data falls back to the app's home page", async () => {
    const sw = loadSw();
    await sw.fire("notificationclick", { notification: { close() {}, data: null } });
    assert.deepEqual(sw.opened, ["./"]);
  });

  test("the offline cache lists every file the pages need", () => {
    const text = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    const listed = [...text.matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
    for (const f of listed) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is in the offline cache but does not exist`);
    for (const html of ["index.html", "flight-details.html", "getting-here.html"]) {
      const src = fs.readFileSync(path.join(ROOT, html), "utf8");
      const used = [...src.matchAll(/(?:src|href)="([^"#?]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//.test(u) && /\.(js|css)$/.test(u));
      for (const u of used) assert.ok(listed.includes(u), `${html} loads ${u} but it is missing from the offline cache`);
    }
  });
});
