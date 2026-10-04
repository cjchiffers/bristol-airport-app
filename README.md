# Bristol Airport Flights

A fast, installable web app for people **flying out of Bristol** (BRS) and people **collecting someone who is arriving**.
Live departures/arrivals, one-tap sharing of a flight, pick-up helpers, and optional notifications.
No build step: plain HTML/CSS/JS served as static files, plus one Cloudflare Worker for the data.

## What it does
- **Boards** — departures and arrivals with live times, delays and status; search, filters (Next 4h / Delayed / Cancelled); side-by-side on desktop.
- **Flight page** — countdown, gate/belt, terminal, check-in desk, aircraft (with a side-view illustration), route map with the plane's real position when airborne, destination/Bristol weather, recent history, and a warning when the aircraft is running late on its previous flight.
- **Meeting someone** — "likely out" window after landing, keep-screen-on, pick-up/parking links (`getting-here.html`).
- **Share & reload** — every flight has a stable link (`flight-details.html?type=arrival&flight=U2%202806&date=2026-10-04`); shared links show a live preview in WhatsApp/Messages; add to calendar (.ics).
- **My flights**, **Install app** (incl. iPhone steps), **notifications** (landed, delayed, gate/belt, cancelled — optional, needs setup), works offline from the last data.

## Layout
| Path | What |
|---|---|
| `index.html`, `script.js`, `styles.css` | The boards |
| `flight-details.*` | The flight page |
| `getting-here.html` | Links to Bristol Airport's own pick-up / parking / transport pages |
| `shared/*.js` | Logic shared by the pages (time, flights, airports, aircraft, install, push, config) |
| `sw.js`, `manifest.json` | Offline cache, push notifications, PWA install |
| `airports.min.json` | ~9,000 airports (name, city, coordinates) |
| `assets/vendor/leaflet/` | Self-hosted Leaflet 1.9.4 |
| `CloudFlare/` | The worker (**git-ignored on purpose**): flight data, history, inbound aircraft, map tiles, share previews, notifications. See `CloudFlare/README.md` |
| `tests/` | Unit, worker and browser tests — see `tests/README.md` |

## Run locally
```
python3 -m http.server 8000      # then open http://localhost:8000
```
`localhost:8000` is allowed by the worker's CORS list. The page talks to the deployed worker (`shared/config.js`).

## Tests
```
npm test                                                  # unit + worker (Node 22+)
pip install -r tests/e2e/requirements.txt && playwright install chromium
python -m pytest tests/e2e                                # browser tests, fully faked backend
```
GitHub Actions runs both on every push (`.github/workflows/tests.yml`).

## Keys and secrets
None are in this repo. The worker needs `RAPIDAPI_KEY` (AeroDataBox) and `CARTO_MAP_KEY` (map tiles); notifications also need
`VAPID_PRIVATE_KEY` plus a KV namespace. Details: `CloudFlare/README.md`.

## Deploying
Static files: publish the repo root. Worker: `cd CloudFlare && npx wrangler deploy`. Bump `CACHE_NAME` in `sw.js` whenever a cached file changes
so installed copies update.
