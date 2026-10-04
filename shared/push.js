/* shared/push.js — Bristol Airport Flights App
   Follow a flight for notifications (Web Push). The worker (see CloudFlare/README.md) stores the subscription and
   sends a message when something changes. Everything here must be started from a tap (browsers require it).
   Exposes: window.BrsPush
*/
"use strict";

(function(){
  const LS_KEY = "brs_push_v1";            // which flights this browser follows: { "arrival:U2 2806:2026-10-04": timestamp }
  const KEEP_MS = 3 * 24 * 3600 * 1000;

  const API = () => window.BrsConfig.API_BASE;
  const keyOf = (r) => `${r.type}:${String(r.flight).toUpperCase().replace(/\s+/g, " ").trim()}:${r.date}`;

  function readFollowed(){
    try {
      const x = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      const now = Date.now();
      const out = {};
      for (const [k, ts] of Object.entries(x && typeof x === "object" ? x : {})) if (now - Number(ts) < KEEP_MS) out[k] = ts;
      return out;
    } catch { return {}; }
  }
  function writeFollowed(o){ try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* storage unavailable */ } }

  /** Can this browser do Web Push at all? (iPhone Safari only can once the app is on the Home Screen.) */
  function supported(){
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function permission(){ return "Notification" in window ? Notification.permission : "denied"; }
  function isFollowing(route){ return !!readFollowed()[keyOf(route)]; }

  function urlBase64ToUint8Array(b64){
    const s = String(b64).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  let configPromise = null;
  function config(){
    if (!configPromise) {
      configPromise = fetch(`${API()}/push/config`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { enabled: false }))
        .catch(() => { configPromise = null; return { enabled: false }; });
    }
    return configPromise;
  }

  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });

  /** Start following. Throws an Error with .code: "unsupported" | "denied" | "disabled" | "limit" | "server". */
  async function follow(route, place){
    if (!supported()) throw fail("unsupported");
    // The permission prompt must be the first thing after the tap.
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw fail("denied");

    const cfg = await config();
    if (!cfg.enabled || !cfg.publicKey) throw fail("disabled");

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) });

    const res = await fetch(`${API()}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: typeof sub.toJSON === "function" ? sub.toJSON() : sub,
        flight: { type: route.type, number: route.flight, date: route.date, place: place || "" },
      }),
    });
    if (!res.ok) throw fail(res.status === 429 ? "limit" : "server", `subscribe HTTP ${res.status}`);

    const all = readFollowed();
    all[keyOf(route)] = Date.now();
    writeFollowed(all);
  }

  async function unfollow(route){
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API()}/push/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: typeof sub.toJSON === "function" ? sub.toJSON() : sub, flight: { type: route.type, number: route.flight, date: route.date } }),
        });
      }
    } catch { /* offline: still stop showing it as followed; the server entry expires by itself */ }
    const all = readFollowed();
    delete all[keyOf(route)];
    writeFollowed(all);
  }

  window.BrsPush = { supported, permission, isFollowing, follow, unfollow };
})();
