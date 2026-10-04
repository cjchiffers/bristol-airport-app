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
    pushes: [],                   // every Web Push message "sent"
    pushStatus: () => 201,        // fn(endpointUrl) -> HTTP status from the push service
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push(url);
    // Web Push services (FCM, Mozilla, Apple, Windows): record the message and answer with a controllable status.
    if (/(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|notify\.windows\.com)$/.test(new URL(url).hostname)) {
      state.pushes.push({ url, headers: Object.fromEntries(new Headers(init.headers)), body: new Uint8Array(await new Response(init.body).arrayBuffer()) });
      return new Response(null, { status: state.pushStatus(url) });
    }
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


// ---------------------------------------------------------------------------------------- Web Push helpers
export function makeKV() {
  const m = new Map();
  const live = () => { const t = Math.floor(Date.now() / 1000); for (const [k, v] of m) if (v.exp && v.exp <= t) m.delete(k); };
  return {
    _m: m,
    async get(k) { live(); return m.has(k) ? m.get(k).value : null; },
    async put(k, value, opts = {}) { m.set(k, { value, exp: opts.expiration || (opts.expirationTtl ? Math.floor(Date.now() / 1000) + opts.expirationTtl : 0) }); },
    async delete(k) { m.delete(k); },
    async list({ prefix = "", limit = 1000, cursor } = {}) {
      live();
      const all = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + limit);
      const done = start + limit >= all.length;
      return { keys: page.map((name) => ({ name })), list_complete: done, cursor: done ? undefined : String(start + limit) };
    },
  };
}

const b64u = (bytes) => Buffer.from(bytes).toString("base64url");

/** The owner's VAPID key pair + a push-enabled env (KV store included). */
export async function makePushEnv(extra = {}) {
  const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", k.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
  return { VAPID_PUBLIC_KEY: b64u(pub), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: "mailto:owner@example.com", PUSH_SUBS: makeKV(), _vapidPublicKey: k.publicKey, ...extra };
}

/** A pretend browser: what PushManager.subscribe() returns, plus the ability to decrypt what the server sends (RFC 8291). */
export async function makeBrowser(endpoint = `https://fcm.googleapis.com/fcm/send/${Math.random().toString(36).slice(2)}`) {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const hkdf = async (ikm, salt, info, len) => new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), len * 8));
  const enc = new TextEncoder();
  return {
    subscription: { endpoint, keys: { p256dh: b64u(uaPublic), auth: b64u(auth) } },
    async decrypt(body) {
      const salt = body.slice(0, 16);
      const idlen = body[20];
      const asPublic = body.slice(21, 21 + idlen);
      const record = body.slice(21 + idlen);
      const server = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
      const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: server }, kp.privateKey, 256));
      const cat = (...a) => Uint8Array.from(a.flatMap((x) => [...x]));
      const ikm = await hkdf(ecdh, auth, cat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
      const cek = await hkdf(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);
      const nonce = await hkdf(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 12);
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), record));
      let end = plain.length - 1;
      while (end >= 0 && plain[end] === 0) end--;                 // strip padding
      if (plain[end] !== 2) throw new Error("missing record delimiter");
      return JSON.parse(new TextDecoder().decode(plain.slice(0, end)));
    },
  };
}
