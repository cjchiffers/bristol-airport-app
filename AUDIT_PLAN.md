# Bristol Airport Flights — Fix Plan

Implementation brief for an AI coding agent. Work through the phases in order. Each task lists **where**, **what**, and **done when**. Line numbers are from the audit snapshot and will drift once you start editing — locate code by function name.

> ## Status (2 Oct 2026): implemented on branch `audit-fixes` — all four phases
>
> Done and verified in a real browser (Chromium via Playwright) plus the worker handler run against a fake AeroDataBox.
> Notes on where the implementation differs from the plan:
> - Status helpers live in `shared/flights.js` (not a separate `shared/status.js`); `shared/utils.js`, `shared/config.js`, `shared/time.js` as planned.
> - `CloudFlare/` is git-ignored by the owner, so worker changes (W0–W8, `wrangler.toml`, `README.md`) are in the working tree but **not committed**.
> - W6 uses a rolling window (3 h ago → 21 h ahead). AeroDataBox's `dateLocalRole` defaults to `Both`, so share links need no extra parameter.
> - `airports.min.json` is 0.5 MB (was 1.75 MB), loaded lazily and cached by the service worker rather than precached.
> - Extra fixes found along the way: saved-flight identity bug (every star looked saved), `init()` running before later `const`s (TDZ), Open-Meteo sunrise/sunset shown in the wrong timezone, `hidden` badges ignored because of `display:inline-flex`, details container had no padding.
>
> **Still needs the owner:** revoke the old Aviation Edge key; deploy the worker (`CloudFlare/`, then delete the `AVIATION_EDGE_KEY` secret); real iPhone/Android test; review the uncommitted `index.html` change (see below).

---

## 0. Context you need first

### What the app is
A static, no-build, vanilla-JS PWA. Users are (a) people **flying out** of Bristol (BRS) and (b) people **picking someone up** from an arriving flight. Mobile-first, but must also look good on desktop.

| File | Role |
|---|---|
| `index.html`, `script.js`, `styles.css` | Departures/Arrivals list page |
| `flight-details.html`, `flight-details.js`, `flight-details.css` | Single-flight page (Leaflet map, weather) |
| `shared/airports.js`, `shared/airlines.js` | Shared helpers exposed on `window.BrsAirports` / `window.BrsAirlines` |
| `airports.min.json` | IATA → {name, city, country, lat, lon}, 9,059 airports, 1.75 MB, **not actually minified** |
| `sw.js`, `manifest.json` | Service worker + PWA manifest |
| `CloudFlare/index.js` | The Cloudflare Worker backend (source of truth for API shape) |
| `new/` | Dead, unused prototype containing a leaked API key — delete |

Deployed at `https://flightapp.chiffers.com`. No package.json, no bundler, no tests. **Node is not installed** on the dev machine; `python3` is.

### Backend
One Cloudflare Worker, reachable at **two hostnames**: `https://flightapp-workers.chiffers.com` (custom domain) and `https://flat-dust-a68a.cjchiffers.workers.dev` (workers.dev). Upstream provider is **AeroDataBox** (RapidAPI) — the only flight data provider. **Aviation Edge is not used by the owner: remove every trace of it** (worker routes, `AVIATION_EDGE_KEY`, `new/`, comments and function names in the front end) — see W0 and F10.

- `GET /api/timetable?iataCode=BRS&type=departure|arrival` — list page. Fetches London "today" 00:00–11:59 and 12:00–23:59 windows, normalises to an Aviation-Edge-like shape.
- `GET /api/flights?flight_iata=U2%202806&arr_iata=BRS` — details page refresh. **Currently broken** (see W1).

### Normalised flight shape (what the front end receives today)
```json
{
  "type": "arrival", "status": "scheduled", "flight_status": "scheduled",
  "departure": { "iataCode": "LPA", "scheduledTime": "2026-10-01 19:45+01:00", "estimatedTime": "2026-10-01 19:58+01:00",
                 "actualTime": "", "delay": "", "terminal": "1", "gate": "D28", "baggage": "", "checkInDesk": "201-215" },
  "arrival":   { "iataCode": "BRS", "scheduledTime": "2026-10-01 23:45+01:00", "estimatedTime": "2026-10-02 00:03+01:00",
                 "actualTime": "", "delay": "", "terminal": "", "gate": "", "baggage": "" },
  "flight":   { "iataNumber": "BY 6331", "icaoNumber": "", "number": "BY 6331" },
  "aircraft": { "regNumber": "", "modelText": "", "iataCode": "", "icaoCode": "" },
  "airline":  { "iataCode": "BY", "icaoCode": "TOM", "name": "TUI" },
  "codeshared": null
}
```
Note the time format: `YYYY-MM-DD HH:MM+HH:MM` (space separator, offset included).

### Live data facts (sampled 2 Oct 2026, ~14:00 BST) — design around these
| Field | Arrivals (135) | Departures (131) |
|---|---|---|
| `departure.scheduledTime` | 126 | 131 |
| `arrival.scheduledTime` | 135 | 126 |
| `*.estimatedTime` (own side) | 135 | 131 |
| `*.actualTime` | **0** | **0** |
| `*.delay` | **0** (always empty) | **0** |
| `departure.gate` | 65 (these are **origin-airport** gates) | **0** |
| `arrival.baggage` | **0** | 24 (destination belts — irrelevant) |
| `status` values | unknown 76, scheduled 59 | active 79, scheduled 41, unknown 11 |
| Duplicates | `U2 7003` ×2 + `EC 7003` (same flight); `FR 3160` ×2 | `U2 7075` + `EC 7075`; `FR 8296` ×2 |

Consequences: delay must be **derived** (estimated − scheduled); gates are essentially unavailable at BRS; "actual" times must come from a different AeroDataBox field; codeshares/window-overlap duplicates must be removed.

### Working rules
- Keep it vanilla JS, no build step, no new frameworks. Match existing code style (2-space indent, `"use strict"`, IIFE modules in `shared/`).
- Create a branch `audit-fixes`. Commit after each task (small, descriptive commits). **Do not push and do not deploy the worker** — the user deploys.
- Every time you change, add or remove an app-shell file, bump `CACHE_NAME` in `sw.js` and keep `APP_SHELL` in sync with files that actually exist.
- Escape all API strings inserted via `innerHTML` (`escapeHtml`). Never introduce inline `onerror=` handlers with interpolated values.
- Local test server: `python3 -m http.server 8000` from repo root → `http://localhost:8000` (this origin is already in the worker's CORS allow-list).
- Front-end changes must work against **both** the current deployed worker and the fixed worker (the user may deploy the worker later). Concretely: derive delay client-side even if the worker starts supplying it; tolerate empty `actualTime`.
- Verify AeroDataBox field names against its docs/OpenAPI spec before relying on fields not already used in `CloudFlare/index.js`. If you cannot verify, write the code defensively (optional chaining, fall back to existing fields) and note it in the commit message.

### Actions only the user can do (list these back to the user at the end; do not attempt)
1. Revoke the Aviation Edge key exposed in `new/static/js/app.js` / close the account (the repo is public; deleting the file does not remove it from history), and delete the `AVIATION_EDGE_KEY` secret from the worker after deploying.
2. Deploy the worker (`CloudFlare/`) after Phase 1A — Phase 1C (share/reload) depends on W1 being live.
3. Test on a real iPhone (Safari) and Android (Chrome), including sharing a flight link via WhatsApp/Messages and reloading the details page.

### Owner priorities
**Sharing a flight and reloading the details page without losing the flight are top priorities.** They are in Phase 1C and must not be deferred or simplified away.

---

## Phase 1A — Worker fixes (`CloudFlare/index.js`)

### W0. Remove Aviation Edge completely
**Do:** delete the `/api/airport` and `/api/airportDatabase` routes, `normalizeAirportRow`, and every `env.AVIATION_EDGE_KEY` reference. Update the header/route comments so nothing mentions Aviation Edge. The worker should then have exactly three routes: `/api/health`, `/api/timetable`, `/api/flights`.
**Done when:** `grep -rni "aviation.\?edge\|AVIATION_EDGE" CloudFlare/` returns nothing.

### W1. Fix `/api/flights` returning an empty flight  *(bug — confirmed live)*
**Where:** `/api/flights` handler (~L301–319).
**Problem:** `cachedAeroFetch()` returns `{ data, fromCache }`, but the handler treats the wrapper as the flight: `if (!data)` is never true and `[data]` normalises the wrapper → every field empty. The details page then discards it, so **details never refresh**, while still spending AeroDataBox quota every 60 s per viewer.
**Do:** destructure `const { data } = await cachedAeroFetch(...)`; return `[]` when `data` is null; normalise `Array.isArray(data) ? data : [data]`.
Also accept an optional `date=YYYY-MM-DD` query param (validate with `/^\d{4}-\d{2}-\d{2}$/`, default `londonDate()`), so flights on other days can be refreshed and **shared links/reloads for tomorrow's or yesterday's flights still resolve** (Phase 1C depends on this). Check AeroDataBox's `/flights/number/{number}/{date}` semantics (e.g. a `dateLocalRole` param) so a flight is found whether `date` is its local departure or arrival date; prefer `dateLocalRole=Both` if supported.
**Done when:** the handler returns real normalised flights for a valid flight number/date and `[]` otherwise.

### W2. Return errors instead of empty success
**Where:** `/api/timetable` handler and `cachedAeroFetch`.
**Problem:** if AeroDataBox fails / 429s, `aeroFetch` returns `null` and the timetable responds `200 []` → front end shows "No arrivals found". If only one window fails, half the day silently vanishes.
**Do:** make `aeroFetch` surface the upstream status (e.g. return `{ ok:false, status }` or throw). In `/api/timetable`, if **any** window fails, respond `502` JSON `{ "error": "upstream", "status": <n> }` with CORS headers. Same for `/api/flights`. Do not cache failures.
**Done when:** an upstream failure produces a non-2xx with CORS headers; success path unchanged.

### W3. Complete the status map and pass raw status through
**Where:** `AERO_STATUS` (~L60) and `normalizeAeroDataBoxFlight`.
**Problem:** AeroDataBox statuses include `Unknown, Expected, EnRoute, CheckIn, Boarding, GateClosed, Departed, Delayed, Approaching, Arrived, Canceled, CanceledUncertain, Diverted` (verify against docs). Unmapped ones become `"unknown"` — which is why 76/135 arrivals are "unknown".
**Do:** map all of them. Suggested normalised values: `scheduled` (Expected/Unknown-with-times), `checkin`, `boarding`, `gateclosed`, `departed`, `enroute`, `approaching`, `landed` (Arrived/Landed), `delayed`, `cancelled`, `diverted`, `unknown`. Keep `status`/`flight_status` as the normalised value and add `statusRaw: f.status`.
**Done when:** no known AeroDataBox status maps to `unknown`.

### W4. Real "actual" times, derived delay, correct aircraft code
**Where:** `normalizeAeroDataBoxFlight`, `aeroTime`.
**Do:**
- AeroDataBox has no `actualTime`; it has `revisedTime`, `predictedTime`, `runwayTime` (verify). Map `estimatedTime = revisedTime || predictedTime`, `actualTime = runwayTime` (only when present).
- Compute `delay` per segment in minutes = `(estimated||actual) − scheduled` using the `utc` values (parse safely; leave `""` if either is missing). Integer, may be negative (early).
- `aircraft.icaoCode` is currently set to `modeS` (a transponder hex, not a type). Set `icaoCode: ""` (or a real type code if AeroDataBox provides one) and add `modeS` as its own field.
**Done when:** a delayed flight carries a numeric `delay`; the details page no longer shows a hex code next to the aircraft model.

### W5. Remove duplicates
**Where:** `/api/timetable`, after merging AM+PM windows.
**Problem:** the same flight appears twice (window overlap) and as codeshares (`U2 7003` / `EC 7003`).
**Do:** first try `withCodeshared=false` in `params`. Then dedupe the merged array: key = `number + scheduled UTC time` for exact duplicates; then collapse codeshares by key = `other-airport IATA + scheduled UTC time (+ aircraft reg when both have one)`, keeping the operating flight (prefer the record where `f.codeshareStatus` is `IsOperator` if that field exists, otherwise the first) and attach the others as `codeshares: ["EC 7003"]`.
**Done when:** each physical flight appears once; search for the codeshare number still finds it (front end will search `codeshares` — see F4).

### W6. Rolling time window instead of "London today"
**Where:** `/api/timetable` (~L264–282), `londonDate()`.
**Problem:** only 00:00–23:59 today is fetched → no "Tomorrow" section in the evening; late-running flights from yesterday vanish after midnight.
**Do:** compute the current London local hour `H` (via `Intl.DateTimeFormat` with `timeZone: "Europe/London"`), round down to the hour, and fetch two ≤12 h windows: `[H−3h, H+9h)` and `[H+9h, H+21h)`, formatted as local `YYYY-MM-DDTHH:mm` (windows may cross midnight — that's fine for AeroDataBox; verify the endpoint's max span is 12 h). Because windows are hour-aligned, cache keys stay stable for up to an hour; keep the 120 s edge cache. Keep the existing `sleep(1100)` between uncached calls. Keep supporting an explicit `date` param (old behaviour) for backward compatibility.
**Done when:** at 22:00 the response includes flights up to ~19:00 the next day and from ~19:00 the same day.

### W7. Lock down quota abuse
**Do:**
- `/api/timetable`: only allow `iataCode=BRS` (400 otherwise).
- `/api/flights`: validate `flight_iata` against `/^[A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?$/i`.
- Fix the CORS allow-list: `http://cjchiffers.github.io` → `https://cjchiffers.github.io`.

### W8. Put the worker under proper version control
**Do:** add `CloudFlare/wrangler.toml` with `name = "flat-dust-a68a"`, `main = "index.js"`, a current `compatibility_date`. Do **not** add routes or secrets; add a comment that the custom domain is configured in the dashboard and `RAPIDAPI_KEY` is the only secret. Add `CloudFlare/README.md` (≤20 lines): endpoints, response shape, how to `wrangler deploy`, which secrets are required (`RAPIDAPI_KEY` only).

---

## Phase 1B — Front-end correctness (critical)

### F1. Shared, Safari-safe time module
**Create:** `shared/time.js` exposing `window.BrsTime`:
- `parse(value)` → `Date|null`. Handles `Date`, epoch numbers, ISO with/without offset, **and `YYYY-MM-DD HH:MM±HH:MM` by replacing the first space with `T`** (Safari cannot parse the space form). Strings without an offset are treated as UTC (current list behaviour).
- `fmtTime(d)` → `"HH:MM"` in **Europe/London**, 24 h.
- `fmtDay(d)` → e.g. `"Fri 02 Oct"` in Europe/London.
- `londonDateKey(d)` → `YYYY-MM-DD` in Europe/London.
- `minutesBetween(a, b)`.
**Use it everywhere:** replace `parseAviationEdgeTime`, `toDate`, `convertToLondonTime` in `script.js`, and `toDate`, `fmtTime`, `fmtDayMon` in `flight-details.js` (the details page currently formats in **device** time — must be London). Load `shared/time.js` before the page scripts in both HTML files and add it to `APP_SHELL`.
**Done when:** both pages show identical times for the same flight; no `new Date(<api string>)` calls remain outside `shared/time.js` (grep for it).

### F2. Use the correct side of the flight for arrivals  *(critical — confirmed live: 17 not-yet-landed arrivals hidden at 14:49)*
**Where:** `script.js` — `scheduledMs`, `filterFlightsByTime`, `renderList` (`dayKeyOf`, "next" filter, sort).
**Problem:** all use `f.departure.scheduledTime || f.arrival.scheduledTime`. For arrivals that's the **origin's departure time**, so any flight that took off >1 h ago disappears, and sorting/day groups/"Next 4h" are wrong.
**Do:** add a single helper `seg(f, mode)` returning `f.departure` for departures and `f.arrival` for arrivals, and `keyTime(f, mode)` = parsed `seg.actualTime || seg.estimatedTime || seg.scheduledTime`. Use it for sort, day grouping, "Next 4h", and the "hide past" cutoff. `filterFlightsByTime` must take `mode`.
Cutoff rules: hide departures whose key time is >30 min in the past; hide arrivals whose key time is >60 min in the past (people collecting may still be waiting). Flights with no parseable time are kept.
**Done when:** with the cached sample, an arrival departing 11:45 and landing 15:15 is visible at 14:49.

### F3. Show live times and meaningful status on cards
**Where:** `flightCardHtml`, `getFlightStatusString`, `statusTone` in `script.js`; `styles.css`.
**Do:**
- Compute `delayMin` = numeric `seg.delay` if present, else `minutesBetween(seg.scheduledTime, seg.estimatedTime || seg.actualTime)`.
- Time column: if estimated/actual differs from scheduled by ≥ 1 min, show the new time large and the scheduled time small with strikethrough; otherwise show scheduled.
- Status pill, derived from `status` + `delayMin` + mode, in this priority:
  `cancelled` → "Cancelled" (bad) · `diverted` → "Diverted" (bad) · arrivals `landed` → "Landed HH:MM" (good) · departures `departed`/`enroute` → "Departed" (neutral) · `boarding` → "Boarding" (good) · `gateclosed` → "Gate closed" (warn) · `delayMin ≥ 15` → "Delayed · Exp HH:MM" (warn) · `delayMin ≤ −5` (arrivals) → "Early · Exp HH:MM" (good) · arrivals `approaching`/`enroute` → "Expected HH:MM" (neutral) · otherwise "On time" (good).
  Treat old worker values too: `active` = departed/en route.
- **Never show `departure.gate` on arrivals** (it's the origin airport's gate). Only show a gate on departures, and only if present.
- Make the pill text match what the Delayed filter tests (F5).
**Done when:** a departure with estimated 20 min after scheduled shows "Delayed · Exp HH:MM" and the struck-through scheduled time; no arrival card shows a gate.

### F4. De-duplicate on the client too
**Where:** `refreshAll` in `script.js`, right after fetching.
**Do:** apply the same dedupe as W5 (exact `number+scheduled`, then codeshare collapse by other-airport + scheduled time) so the app is correct before the worker is redeployed. Include `codeshares` numbers in the search text blob.

### F5. Fix the quick filters
**Where:** `index.html` `#quickFilters`, `renderList`.
**Do:** Gate is never populated at BRS (0/131) — replace chips with: **All · Next 4h · Delayed · Cancelled**. "Delayed" = `delayMin ≥ 15` or status `delayed`. "Cancelled" = status cancelled/diverted. All use `keyTime(f, mode)`.

### F6. Always render fresh data; auto-refresh
**Where:** `refreshAll`, `hashFlights`, `CACHE_TTL_MS`, `init` in `script.js`.
**Problem:** after a fetch, the list only re-renders if flight *identities* changed (hash ignores times/status), so updated estimates are not shown; there is no periodic refresh.
**Do:** delete `hashFlights` and the `changed` logic — always re-render after a successful fetch (preserve scroll position; `renderList` already rebuilds innerHTML so just don't touch scroll). Add auto-refresh every **120 s** (matches worker edge cache) while `document.visibilityState === "visible"`; on `visibilitychange` to visible, refresh immediately if the last fetch is older than 60 s. Clear the timer when hidden. Guard against overlapping fetches with an in-flight flag. Show "Updated HH:MM" (London) in `#lastRefreshed`.
**Done when:** leaving the page open shows updated times without user action; no requests fire while the tab is hidden.

### F7. Error handling
**Where:** `ensureErrorBanner`, `showError`, `fetchTimetable`, `refreshAll`.
**Do:**
- `ensureErrorBanner` adds a new Retry click listener **every call** → multiple refreshes per tap. Attach the listener only when the element is created.
- Treat non-2xx as an error (already does) — once W2 ships, upstream failure is a 502 and must show the banner, not "No flights found".
- If data is empty **and** there was an error, show the banner, not the empty state.
- Fix the copy "Check your connection / API key" → "Couldn't load flights. Check your connection and try again."

### F8. Details page: fix refresh, use one host, poll responsibly
**Where:** `flight-details.js` — `PROXY_BASE`, `refreshNow`, `fetchBestEffortUpdate`, `normalizeAviationStack`, `fetchRegistrationFallback`, `startAuto`.
**Do:**
- Create `shared/config.js` with `window.BrsConfig = { API_BASE: "https://flightapp-workers.chiffers.com/api", AIRPORT: "BRS" }`. Use it in both pages (remove the unused `API_BASE` const and the hard-coded URL in `fetchTimetable`, and `PROXY_BASE`). Add to `APP_SHELL`, load before page scripts.
- Delete `normalizeAviationStack` (the worker already returns the app shape) — use the response items directly in scoring.
- Pass `date` (London date of the flight's scheduled time on the BRS side) to `/api/flights`.
- Delete `fetchRegistrationFallback` (OpenSky + hexdb) — AeroDataBox already supplies `regNumber`.
- Poll every **60 s**, only while visible (same pattern as F6); refresh immediately on becoming visible.
- `flashStatus`, `setFetching`, `renderStatusBadge`, and parts of `render`/`init` write to elements that don't exist (`statusBadge`, `sourceLine`, `refreshSpin`, `lastUpdated`). Either add a small visible "Updated HH:MM" line under the header (preferred: reuse `#subhead` area or add `#lastUpdated` to the HTML) and wire it, or delete the dead code. Manual "Refresh" must give visible feedback.
**Done when:** with the fixed worker deployed, estimated time changes appear on the details page within 60 s; network panel shows no OpenSky/hexdb/flat-dust calls.

### F9. Details page: show the BRS-relevant side only
**Where:** `renderHeroCard`, `renderOpsBar`, `depInfo`/`arrInfo` in `render`.
**Do:**
- Hero "Gate" pill: departures → `departure.gate`; arrivals → **hide the Gate pill** (origin gate is irrelevant to someone at Bristol). Hero "Belt" pill: arrivals → `arrival.baggage`; departures → **hide**. If the value is empty, show "TBC" rather than "See screens", and keep the pill.
- Ops bar: same rule; for departures also show `checkInDesk` and `terminal` if present.
- `paintHeroStatus` currently shows the same overall status on both the departure and arrival blocks (e.g. "Departed" under the arrival time). Show status only on the BRS-side block, and use the F3 status logic (extract it into a shared function in `shared/status.js` and use it on both pages).
- Countdown: arrivals → "Lands in 23 min" / "Landed 14:52"; departures → "Departs in 1h 05m" / "Departed".

### F10. Housekeeping & security (front end)
- Delete `new/` entirely.
- Remove all Aviation Edge references in front-end code: rename `parseAviationEdgeTime` (superseded by `BrsTime.parse` in F1), and fix comments such as "Aviation Edge timetable", "Aviation Edge uses flight.iataNumber", "Aviation Edge delay is often in minutes", "Aviation Edge / timetables are inconsistent". Comments should say AeroDataBox (via the worker) where a source is relevant.
- `script.js`: remove unused `API_BASE` (after F8), the stray `// replace with your own key` comment, the stale header comment saying "Aviation Edge timetable".
- `styles.css`: delete the empty selector rule (~L486–487), the duplicate `body { font-family: Arial }` override (~L496–499) that clobbers the system font stack, and unused `.star-btn` rules.
- `flight-details.html`: delete the hidden legacy `#flightHero` section and its `els` entries/`renderTimeHero` if nothing visible depends on it; delete `renderStatusBannerAndOps`, `renderStatusBanner` (unused).
- Bump `sw.js` `CACHE_NAME`.

---

## Phase 1C — Share & reload (owner priority)

Requires W1 deployed for links opened on another device; must still work from the local cache before then.

### S1. The URL is the source of truth for the details page
**Problem:** the details page is opened as `flight-details.html?key=flight_<random>` and reads the flight from `sessionStorage`. A reload in the same tab works, but opening the link in a new tab, another browser, another device, or after the browser discards session storage shows "Open this page from the list…". Links cannot be shared.
**Do:**
- New URL format: `flight-details.html?type=arrival&flight=U2%202806&date=2026-10-02` — `type` is `arrival|departure` (BRS side), `flight` is the flight number as shown, `date` is the **London date of the BRS-side scheduled time**. Build it in one shared helper (`BrsUtils.detailsUrl(flight, mode)`, or in `shared/config.js` until R6 exists) and use it from list cards, saved flights, and the share action.
- On load, `init()` reads `type/flight/date` from the URL:
  1. Render immediately from a cache keyed by those params (e.g. `fd:${type}:${flight}:${date}`) if present — fast path only. Use `localStorage` (not just `sessionStorage`) so it also survives a new tab and offline reloads; prune entries older than 48 h.
  2. Always fetch `/api/flights?flight_iata=…&date=…&arr_iata=BRS` (or `dep_iata=BRS`) and pick the best match with `scoreMatch` (flight number + BRS on the correct side + date). Render, and write the result back to the cache.
  3. If nothing matches and there is no cache: show a clear "We couldn't find U2 2806 on Fri 02 Oct" state with a "See all flights" link — never a blank page.
- Keep the URL stable: auto-refresh must never change it. Use `history.replaceState` only to normalise params (e.g. trimmed flight number).
- Back button: `history.back()` only if `document.referrer` is same-origin; otherwise navigate to `index.html` (someone opening a shared link has no history to go back to).
- Backward compatibility: if an old `?key=` URL is opened and its sessionStorage payload exists, derive the new params from the payload and `replaceState` to the new URL; otherwise show the not-found state.
- Set `document.title` to e.g. "U2 2806 Kos → Bristol · BRS Flights" once loaded.
**Done when:** (a) reload keeps the flight; (b) pasting the URL into a private window on another browser loads the flight (with W1 deployed); (c) an invalid/old URL shows the friendly not-found state.

### S2. Service worker must serve deep links offline
**Where:** `sw.js` navigate branch.
**Problem:** the offline fallback is `caches.match(req)`, which keys on the full URL including the query string, so `flight-details.html?type=…` never matches when offline.
**Do:** for navigations, fall back to `caches.match(req, { ignoreSearch: true })`, then to the cached `./flight-details.html` / `./index.html` by pathname. Store HTML under its pathname-only URL rather than one entry per query string. Bump `CACHE_NAME`.
**Done when:** with DevTools offline, reloading a details URL shows the page with the last cached flight data (from S1's cache) and the offline banner.

### S3. Share
**Do:** wire `#shareBtn`, and add a visible share icon button in the details header next to the menu — sharing must not be buried in the menu:
- `navigator.share({ title, text, url })` where `url` is the S1 canonical URL (absolute: `location.origin` + path — never a `?key=` URL) and `text` is status-aware, e.g. "U2 2806 from Kos — expected at Bristol 15:25 (scheduled 15:10)", "FR 1234 to Faro — departs Bristol 07:15", "… — landed 14:52", "… — cancelled".
- Fallback when `navigator.share` is missing or rejects with anything other than `AbortError`: copy the URL (`navigator.clipboard.writeText`, with a hidden-textarea + `execCommand("copy")` fallback) and toast "Link copied".
- Add a toast element to the details page (reuse `.toast` styles from `styles.css`).
- Add a Share action to each saved flight on the list page too.
- Add static Open Graph / Twitter meta to both HTML files (`og:title` "Bristol Airport Flights", `og:description`, `og:image` = the 512 px icon from R3 as an absolute URL on `https://flightapp.chiffers.com/`) so link previews look decent; flight-specific detail travels in the share `text`.
**Done when:** on mobile the native share sheet opens with a working link; on desktop the link is copied and the toast shows; the shared link opens the same flight (S1).

## Phase 2 — Remove or finish half-built features

Default decision (user may override): **remove** the unfinished features; **implement** Add to calendar. (Share is done in Phase 1C.)

### P1. Add to calendar
Wire `#calendarBtn`: generate an `.ics` (VEVENT with UID, DTSTAMP, DTSTART/DTEND in UTC from the BRS-side scheduled time — departures: event = departure time, arrivals: arrival time — SUMMARY "U2 2806 Kos → Bristol", DESCRIPTION with the S1 canonical URL). Download via Blob + `<a download>`. Escape commas/semicolons/newlines per RFC 5545.

### P2. Remove dead features
- Details menu: remove **Focus mode**, **Group mode** (and `#groupModal` markup + CSS), **Notify me**. Remove the unwired pull-to-refresh indicator (`#ptrIndicator` + CSS).
- List page: remove **Security wait** (menu item, panel, functions, `brs_security_samples` usage) and the always-hidden **Install app** button + `initInstall`.
- Details KPIs: remove **Delay trend** chip and its localStorage recording (`recordDelaySample`, `computeDelayTrend`, `delay_hist_*` keys) — it's per-device noise.
- Resulting details menu: Refresh · Auto-refresh toggle · Share · Add to calendar.

### P3. Menu & keyboard behaviour (list page)
List page overflow menu: close on Escape, close after selecting an item, return focus to the button on close. Mirror what the details page already does.

---

## Phase 3 — Pickup & traveller experience

### X1. Promote Saved flights
Replace the chip drawer with a "My flights" section at the top of the list (only rendered when non-empty) showing each saved flight as a normal card with **live** status (look up the current record from the fetched lists by number + scheduled time; fall back to stored data marked "not in current timetable"). Remove saved flights automatically 12 h after their BRS-side time. Move the "Saved flights" entry out of the overflow menu.

### X2. Arrival details tuned for pickups
On arrival details, make the top of the hero answer "when do I need to be there": large "Lands in 23 min" / "Landed 14:52", the expected vs scheduled time, and the status pill. Add a short hint line: "Allow ~20–30 min after landing for passengers to come through" (static text). Do not invent airport URLs; if you add a link, use only `https://www.bristolairport.co.uk/` (homepage).

### X3. Departure details tuned for travellers
Show terminal / check-in desk when present, and a "Departs in …" countdown. Do not fabricate boarding times — the old "boarding = T-30 min" estimate is removed.

### X4. Destination/origin names everywhere
`flight-details.js` uses its own hard-coded 45-entry `airportCodeToCityName` map and geocodes via Open-Meteo. Replace with `window.BrsAirports.getAirportDisplayName` / `getAirportLatLon` (data already in `airports.min.json` with lat/lon). Use those coordinates for the map and weather; only fall back to Open-Meteo geocoding if the airport isn't in the index. Delete the duplicated geocoding cache code in `script.js` (`prefetchAirportsFromFlights` & co.) once the details page no longer needs it.
Weather: departures → destination weather; arrivals → **origin** weather is not useful; show Bristol weather for arrivals (that's what the person collecting cares about) and label it clearly.

---

## Phase 4 — Responsive, accessibility, PWA, performance

### R1. Desktop layout
At `min-width: 1024px`: widen `.app` (e.g. `max-width: 1200px`), show Departures and Arrivals **side by side** (two columns, each independently scrollable list or full-height), hide the segmented tab control, apply search + quick filters to both columns. Keep the current single-column tabbed layout below 1024 px. Details page at ≥1024 px: two-column grid (hero + times on the left; map + weather on the right). Check at 360, 390, 768, 1024, 1440 px widths — no horizontal scroll.

### R2. Accessibility
- Flight cards: currently `<article role="button">` containing a `<button>` (nested interactive). Make the card's flight number/route an `<a href="flight-details.html?...">` using the S1 URL helper and keep the save `<button>` as a sibling; drop the custom Enter/Space keydown handler.
- Save button: `aria-pressed="true|false"` and `aria-label="Save U2 2806"` / "Remove U2 2806 from saved".
- Add visible `:focus-visible` styles for all interactive elements (search input currently has `outline: none`).
- Remove `aria-live` from the whole list containers (it re-announces the entire list on every refresh); announce only "Updated HH:MM" via the existing toast/status region.
- Tabs: link `role="tab"` buttons to panels (`aria-controls`, panels `role="tabpanel"`, `aria-labelledby`), arrow-key navigation.
- `@media (prefers-reduced-motion: reduce)`: disable skeleton shimmer, the map route animation (draw the line instantly), and transitions.
- Status pills must not rely on colour alone (text already carries meaning — keep it that way).

### R3. PWA icons & manifest
`assets/icon-192.png` and `icon-512.png` are both the same 2560×1070 landscape logo (141 KB). Generate proper square icons with `sips` (pad the logo onto a square `#0b1220` canvas, then resize): `icon-192.png` (192×192), `icon-512.png` (512×512), `icon-maskable-512.png` (logo within the central 80% safe zone), `apple-touch-icon.png` (180×180). Downscale `bristol-logo.png` to ~2× its 34 px display size (e.g. 136 px wide). Update `manifest.json` (`purpose: "maskable"` entry, `id`, `scope`, `description`), add `<link rel="apple-touch-icon">` and `<meta name="theme-color">` to both HTML files. Update `APP_SHELL`.

### R4. Airport index size
- Rewrite `airports.min.json` as genuinely minified JSON with only the fields used (`n` name, `c` city, `la`, `lo`) — update `shared/airports.js` accessors accordingly (keep the public API unchanged). Use a short python script; don't hand-edit.
- Stop copying it into `localStorage` in `shared/airports.js` (1.7 MB synchronous write; the service worker already caches it). Bump the storage key and remove the old `brs_airport_index_v1` entry on load.
- Keep it in `APP_SHELL` only if the minified file is < ~400 KB; otherwise lazy-cache it on first fetch instead of precaching.

### R5. Service worker
- Remove the `respondWith(fetch(req))` for non-GET (just `return`).
- Remove `<meta http-equiv="Cache-Control"/Pragma/Expires>` from both HTML files (ineffective; SW network-first already handles HTML freshness).
- Bump `CACHE_NAME`.

### R6. Shared utilities
Move duplicated helpers (`escapeHtml`, `safeGet/SetLocal/Session`, `flattenObject`, `pickAny*`, `deriveIdentity`) into `shared/utils.js` (`window.BrsUtils`) and use from both pages. Prefer the stricter `escapeHtml` (handles `null`). Remove the now-unused copies.

---

## Final verification checklist (run before handing back)

Static checks:
- `grep -rn "new Date(" *.js shared/` → only inside `shared/time.js` (and `new Date()` for "now").
- `grep -rni "flat-dust\|opensky\|hexdb\|normalizeAviationStack" --exclude=AUDIT_PLAN.md .` → no hits.
- `grep -rni "aviation.\?edge\|AVIATION_EDGE" --exclude=AUDIT_PLAN.md .` → no hits (code, comments, worker).
- Every path in `sw.js` `APP_SHELL` exists; every `<script src>` / `<link href>` in both HTML files exists.
- `python3 -c "import json;json.load(open('airports.min.json'))"` succeeds.

Manual (serve with `python3 -m http.server 8000`, test at 390 px and 1440 px):
- Arrivals tab shows flights currently in the air, sorted by arrival time, with expected times and no origin gates.
- Delayed / Cancelled / Next 4h filters return sensible results; search finds a codeshare number.
- No duplicate flights.
- Leave the list open 2+ minutes → "Updated HH:MM" advances; switch tab away → no requests.
- Open a flight, reload → same flight. Copy the URL into a new private window → page loads the flight. Open an old `?key=` URL → redirect or friendly not-found.
- Offline: reload a details URL → page and last-known flight data still show.
- Share: native sheet on mobile, "Link copied" on desktop; the shared URL has `type/flight/date` and no `key`.
- Add to calendar works; removed features are gone from menus.
- Offline (DevTools): list shows cached data with the offline banner; details shows last known data.
- Keyboard-only: tab through list, open a flight, save a flight, open/close the menu with Escape.

Report back to the user: what was done per task, anything skipped and why, any AeroDataBox fields you could not verify, and the user-only actions listed in section 0.
