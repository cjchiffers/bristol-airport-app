# Tests

| Suite | Command | What it covers |
|---|---|---|
| Unit + worker (Node ≥ 22) | `npm test` | `shared/*.js` logic (times, status, de-dup, share URLs, calendar, aircraft, airport names) and the Cloudflare worker (access control, last-good fallback, quota, history, tiles, …) |
| Browser (Python + Playwright) | `pip install -r tests/e2e/requirements.txt && playwright install chromium && python -m pytest tests/e2e` | The real pages in Chromium against a fake backend: list, details, share/reload, saved flights, history, map tiles, accessibility, layouts |

The browser tests fake every network call (`tests/e2e/conftest.py`) and build flights relative to "now", so they never go stale and need no internet or API keys.

The worker tests import `CloudFlare/index.js`; that folder is git-ignored, so they skip themselves when it is absent (e.g. on CI).
