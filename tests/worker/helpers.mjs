// Test harness for CloudFlare/index.js: a cache that honours max-age, a controllable fake of
// AeroDataBox (and CARTO), and a `call()` that behaves like the Workers runtime (waitUntil completes).
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const WORKER_PATH = path.resolve(here, "../../CloudFlare/index.js");
// CloudFlare/ is git-ignored by the owner, so CI checkouts won't have it: worker tests skip themselves.
export const workerExists = existsSync(WORKER_PATH);
export const loadWorker = async () => (await import(pathToFileURL(WORKER_PATH).href)).default;

export const APP_ORIGIN = "https://flightapp.chiffers.com";
export const HOUR = 3600e3;

// ---- cache.default with expiry (uses Date.now so tests can move the clock) ----
export function installCaches() {
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(req) {
        const e = store.get(req.url);
        if (!e) return undefined;
        if (Date.now() >= e.expires) { store.delete(req.url); return undefined; }
        return new Response(e.body, { status: e.status, headers: e.headers });
      },
      async put(req, res) {
        const m = /max-age=(\d+)/.exec(res.headers.get("Cache-Control") || "");
        const ttl = m ? Number(m[1]) : 0;
        if (!ttl) return;
        store.set(req.url, { body: await res.arrayBuffer(), status: res.status, headers: [...res.headers], expires: Date.now() + ttl * 1000 });
      },
    },
  };
  return store;
}

// ---- AeroDataBox time object ----
export function adbTime(ms, off = 1) {
  const f = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
  return { utc: `${f(ms)}Z`, local: `${f(ms + off * HOUR)}+0${off}:00` };
}

/** One AeroDataBox flight at Bristol. side: "arr" | "dep". */
export function adbFlight({ number, status = "Expected", side = "arr", other = "KGS", sched, delayMin = 0, runway = false, reg = "G-UZHA", airline = { iata: "U2", name: "easyJet" }, model = "Airbus A320", codeshareStatus = "Unknown", gate, belt }) {
  const home = { airport: { iata: "BRS" }, scheduledTime: adbTime(sched) };
  if (delayMin) home.revisedTime = adbTime(sched + delayMin * 60e3);
  if (runway) home.runwayTime = adbTime(sched + delayMin * 60e3);
  if (gate) home.gate = gate;
  if (belt) home.baggageBelt = belt;
  const far = { airport: { iata: other }, scheduledTime: adbTime(sched + (side === "arr" ? -3 : 3) * HOUR) };
  return { number, status, codeshareStatus, departure: side === "arr" ? far : home, arrival: side === "arr" ? home : far, airline, aircraft: { reg, model } };
}

/** A realistic airport board around `now`. */
export function board(now = Date.now()) {
  return {
    arrivals: [
      adbFlight({ number: "U2 2806", sched: now + 30 * 60e3, delayMin: 15, status: "Approaching" }),
      adbFlight({ number: "EC 2806", sched: now + 30 * 60e3, delayMin: 15, status: "Approaching", airline: { iata: "EC", name: "EasyJet Europe" }, codeshareStatus: "IsCodeshared" }),
      adbFlight({ number: "BA 123", other: "LHR", sched: now - 25 * 60e3, delayMin: 5, runway: true, status: "Arrived", airline: { iata: "BA", name: "British Airways" }, reg: "G-EUPT" }),
      adbFlight({ number: "FR 999", other: "DUB", sched: now + 2 * HOUR, status: "Canceled", airline: { iata: "FR", name: "Ryanair" }, reg: "EI-DCL", model: "Boeing 737-800" }),
    ],
    departures: [
      adbFlight({ number: "U2 7075", side: "dep", other: "AMS", sched: now + HOUR, gate: "A4" }),
      adbFlight({ number: "LS 1889", side: "dep", other: "TFS", sched: now + 2 * HOUR, airline: { iata: "LS", name: "Jet2" }, reg: "G-JZHA", model: "Boeing 737-800" }),
    ],
  };
}

// ---- controllable fake of the outside world ----
export function installUpstream() {
  const calls = [];
  const state = {
    board: board(),
    status: 200,                 // HTTP status AeroDataBox answers with (non-2xx = failure)
    headers: {},                 // e.g. x-ratelimit-requests-remaining
    byNumber: null,              // fn(numberPath) -> array | null
    carto: "ok",
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("basemaps.cartocdn.com")) {
      if (state.carto === "ok") return new Response("PNGDATA", { status: 200, headers: { "Content-Type": "image/png" } });
      return new Response("nope", { status: 403, headers: { "Content-Type": "text/plain" } });
    }
    if (!url.includes("aerodatabox.p.rapidapi.com")) throw new Error(`unexpected fetch ${url}`);
    if (state.status !== 200) return new Response("{}", { status: state.status, headers: state.headers });
    let body;
    if (url.includes("/flights/number/")) {
      const n = decodeURIComponent(url.split("/flights/number/")[1].split("/")[0]);
      body = state.byNumber ? state.byNumber(n, url) : [];
      if (body === null) return new Response(null, { status: 204, headers: state.headers });
    } else if (url.includes("/flights/reg/")) {
      body = state.byReg ? state.byReg(decodeURIComponent(url.split("/flights/reg/")[1].split("/")[0]), url) : [];
    } else {
      body = state.board;
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", ...state.headers } });
  };
  globalThis.setTimeout = ((fn) => { fn(); return 0; });   // worker's 1.1 s pacing sleep: skip it in tests
  return { calls, state };
}

/** Call the worker like the runtime does and wait for waitUntil work before returning. */
export async function call(worker, pathAndQuery, { headers = {}, env = {}, origin = APP_ORIGIN, method = "GET", body } = {}) {
  const pending = [];
  const h = new Headers(headers);
  if (origin && !h.has("Origin")) h.set("Origin", origin);
  const req = new Request(`https://w.example${pathAndQuery}`, { method, headers: h, body });
  const res = await worker.fetch(req, { RAPIDAPI_KEY: "test-key", ...env }, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
}
