// Bump this when you change any app-shell file so users receive updates immediately.
const CACHE_NAME = "brs-flights-2026-02-04-01";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./flight-details.html",
  "./flight-details.js",
  "./flight-details.css",
  "./airports.min.json",
  "./manifest.json",
  "./assets/bristol-logo.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
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

  // Cache API only supports GET; bypass caching for non-GET.
  if (req.method !== "GET") {
    event.respondWith(fetch(req));
    return;
  }

  const url = new URL(req.url);

  // Never intercept cross-origin (API) requests — let the browser handle CORS properly.
  if (url.origin !== self.location.origin) return;

  // HTML: network-first so updates propagate.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Static assets (CSS/JS/JSON/images): cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});
