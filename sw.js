// Bump this when you change any app-shell file so users receive updates immediately.
const CACHE_NAME = "brs-flights-2026-10-04-11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./flight-details.html",
  "./getting-here.html",
  "./flight-details.js",
  "./flight-details.css",
  "./assets/vendor/leaflet/leaflet.js",
  "./assets/vendor/leaflet/leaflet.css",
  "./manifest.json",
  "./assets/bristol-logo.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./shared/utils.js",
  "./shared/install.js",
  "./shared/config.js",
  "./shared/time.js",
  "./shared/airports.js",
  "./shared/airlines.js",
  "./shared/flights.js",
  "./shared/push.js",
  "./shared/aircraft.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Cache API only supports GET; let the browser handle anything else.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept cross-origin (API) requests — let the browser handle CORS properly.
  if (url.origin !== self.location.origin) return;

  // HTML: network-first so updates propagate. Pages are stored under their path only (no query
  // string), so a deep link like flight-details.html?type=arrival&flight=… still opens offline.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    const pageKey = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(pageKey, copy));
        }
        return res;
      }).catch(async () =>
        (await caches.match(pageKey)) ||
        (await caches.match(req, { ignoreSearch: true })) ||
        (await caches.match(url.pathname.endsWith("flight-details.html") ? "./flight-details.html" : "./index.html"))
      )
    );
    return;
  }

  // Static assets (CSS/JS/JSON/images): cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});


// ---------------------------------------------------------------------------
// Web Push: show the notification the worker sent, and open the flight when tapped.
// (Browsers — iOS especially — require every push to show a notification.)
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data ? event.data.text() : "" }; }

  const title = data.title || "Bristol Flights";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,          // a newer message about the same thing replaces the older one
      renotify: !!data.tag,
      icon: "assets/icon-192.png",
      badge: "assets/icon-192.png",
      data: { url: data.url || "./" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === new URL(url, self.location.href).origin && "focus" in w) {
        try { await w.navigate(url); } catch { /* cross-origin or unsupported: just focus */ }
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
