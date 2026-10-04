// Loads the browser scripts in shared/ into a sandbox with a fake `window`, exactly as a page would.
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _map: m,
  };
}

export function loadShared(files, extra = {}) {
  const window = { location: { href: "https://flightapp.chiffers.com/index.html?x=1#h", origin: "https://flightapp.chiffers.com" }, ...extra };
  window.window = window;
  const ctx = vm.createContext({
    window, console, Intl, URL, URLSearchParams, TextEncoder, Date, Math, JSON, Map, Set, Promise, Array, Object, Number, String, Error,
    localStorage: window.localStorage || makeStorage(), sessionStorage: makeStorage(),
    navigator: window.navigator || {}, document: window.document || {}, fetch: window.fetch || (() => Promise.reject(new Error("no network in tests"))),
    setTimeout, clearTimeout, URL_: URL,
  });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  return window;
}

export const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
export { ROOT };
