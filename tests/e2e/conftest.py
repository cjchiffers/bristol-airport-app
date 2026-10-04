"""Browser tests for the app. The whole backend is faked (see FakeApi), so tests are fast, offline-safe and
use times relative to "now" — fixtures can never go stale.

Run:  pip install -r tests/e2e/requirements.txt && playwright install chromium && pytest tests/e2e
"""
import base64
import functools
import http.server
import os
import io
import json
import socketserver
import threading
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
LONDON = ZoneInfo("Europe/London")
MIN = timedelta(minutes=1)


# --------------------------------------------------------------------------- static server
class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # keep test output clean
        pass


@pytest.fixture(scope="session")
def base_url():
    handler = functools.partial(_Quiet, directory=str(ROOT))
    class QuietServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True
        request_queue_size = 256      # the default (5) drops connections when a page loads many scripts at once on a busy machine

        def handle_error(self, request, client_address):   # browsers abort connections mid-test; that's not an error
            pass

    srv = QuietServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


# --------------------------------------------------------------------------- data builders
def london(dt):
    """'2026-10-03 20:20+01:00' — the format the worker sends."""
    loc = dt.astimezone(LONDON)
    off = loc.utcoffset()
    h = int(off.total_seconds() // 3600)
    return loc.strftime("%Y-%m-%d %H:%M") + f"{'+' if h >= 0 else '-'}{abs(h):02d}:00"


def png_bytes(color=(120, 160, 200)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (256, 256), color).save(buf, "PNG")
    return buf.getvalue()


def flight(number, side="arrival", other="KGS", at=0, delay=0, status="scheduled", reg="G-UZHA",
           model="Airbus A320", airline=("U2", "easyJet"), gate="", belt="", terminal="", desk="",
           codeshares=(), actual=False, now=None):
    """A flight in the shape the worker returns. `at` = scheduled minutes from now (at Bristol)."""
    now = now or datetime.now(timezone.utc)
    sched = now + at * MIN
    live = sched + delay * MIN
    home = dict(iataCode="BRS", scheduledTime=london(sched),
                estimatedTime=london(live) if (delay or status in ("approaching", "enroute")) else "",
                actualTime=london(live) if actual else "", delay=delay if delay else "",
                terminal=terminal, gate=gate, baggage=belt, checkInDesk=desk)
    far_t = sched + (-3 if side == "arrival" else 3) * timedelta(hours=1)
    far = dict(iataCode=other, scheduledTime=london(far_t), estimatedTime="", actualTime="", delay="",
               terminal="", gate="", baggage="", checkInDesk="")
    return {
        "type": side, "status": status, "flight_status": status, "statusRaw": "",
        "departure": far if side == "arrival" else home,
        "arrival": home if side == "arrival" else far,
        "flight": {"iataNumber": number, "icaoNumber": "", "number": number},
        "aircraft": {"regNumber": reg, "modelText": model, "modeS": "", "iataCode": "", "icaoCode": ""},
        "airline": {"iataCode": airline[0], "icaoCode": "", "name": airline[1]},
        "codeshareStatus": "", "codeshares": list(codeshares), "codeshared": None,
    }


def default_board(now=None):
    now = now or datetime.now(timezone.utc)
    f = lambda *a, **k: flight(*a, now=now, **k)
    arrivals = [
        f("BA 123", "arrival", "LHR", at=-25, delay=5, status="landed", actual=True, airline=("BA", "British Airways"), reg="G-EUPT"),
        f("KL 1083", "arrival", "AMS", at=-5, delay=0, status="approaching", model="Embraer 175", airline=("KL", "KLM"), reg="PH-EXH"),
        f("U2 2806", "arrival", "KGS", at=30, delay=15, status="approaching", codeshares=["EC 2806"]),
        f("FR 750", "arrival", "PRG", at=45, delay=-6, status="enroute", model="Boeing 737-800", airline=("FR", "Ryanair"), reg="EI-DCL"),
        f("FR 999", "arrival", "DUB", at=120, status="cancelled", model="Boeing 737-800", airline=("FR", "Ryanair"), reg="EI-DCM"),
        f("TOM 77", "arrival", "PMI", at=26 * 60 - 120, status="scheduled", model="Boeing 787-9", airline=("BY", "TUI"), reg="G-TUIA"),
        f("EZY 51", "arrival", "BCN", at=180, status="scheduled", model="ATR 72", airline=("U2", "easyJet"), reg="G-ATRX"),
    ]
    departures = [
        f("U2 7075", "departure", "AMS", at=60, gate="A4", terminal="1", desk="201-215"),
        f("LS 1889", "departure", "TFS", at=120, delay=20, status="scheduled", airline=("LS", "Jet2"), reg="G-JZHA", model="Boeing 737-800"),
        f("FR 8296", "departure", "ALC", at=-10, status="departed", airline=("FR", "Ryanair"), reg="EI-DCL", model="Boeing 737-800"),
    ]
    return arrivals, departures


# --------------------------------------------------------------------------- fake backend
class FakeApi:
    """Everything the page talks to, controllable from a test."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.arrivals, self.departures = default_board()
        self.features = {"tiles": True, "history": True}
        self.timetable_status = 200       # != 200 -> JSON error with that status (502)
        self.stale_from = None            # datetime -> respond with X-Data-Stale headers
        self.flights_status = 200
        self.history = None               # dict, or None -> 502
        self.tiles_ok = True
        self.extra = {}                   # per-feature stubs (inbound, ...)
        self.push = {"enabled": True, "status": 200, "posts": [],
                     "publicKey": base64.urlsafe_b64encode(b"\x04" + os.urandom(64)).decode().rstrip("=")}
        self.calls = {"timetable": 0, "flights": 0, "flights_queries": [], "history": 0, "tiles": [], "health": 0, "other": []}

    # ---- helpers
    def all_flights(self):
        return self.arrivals + self.departures

    def find(self, number, side):
        n = number.replace(" ", "").upper()
        return [f for f in self.all_flights() if f["type"] == side and f["flight"]["iataNumber"].replace(" ", "").upper() == n]

    # ---- routing
    def install(self, context):
        cors = {"access-control-allow-origin": "*", "access-control-expose-headers": "X-Data-Stale, X-Data-Updated"}

        def json_resp(route, body, status=200, extra=None):
            route.fulfill(status=status, content_type="application/json", headers={**cors, **(extra or {})}, body=json.dumps(body))

        def health(route):
            self.calls["health"] += 1
            json_resp(route, {"ok": True, "features": self.features})

        def timetable(route):
            self.calls["timetable"] += 1
            if self.timetable_status != 200:
                return json_resp(route, {"error": "upstream", "status": 429}, 502)
            q = urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query)
            data = self.arrivals if q.get("type", ["departure"])[0] == "arrival" else self.departures
            extra = {}
            if self.stale_from:
                extra = {"X-Data-Stale": "1", "X-Data-Updated": self.stale_from.astimezone(timezone.utc).isoformat()}
            json_resp(route, data, 200, extra)

        def flights(route):
            self.calls["flights"] += 1
            if self.flights_status != 200:
                return json_resp(route, {"error": "upstream"}, 502)
            q = urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query)
            self.calls["flights_queries"].append(q)
            side = "arrival" if "arr_iata" in q else "departure"
            extra = {}
            if self.stale_from:
                extra = {"X-Data-Stale": "1", "X-Data-Updated": self.stale_from.astimezone(timezone.utc).isoformat()}
            json_resp(route, self.find(q.get("flight_iata", [""])[0], side), 200, extra)

        def history(route):
            self.calls["history"] += 1
            if self.history is None:
                return json_resp(route, {"error": "upstream", "status": 403}, 502)
            json_resp(route, self.history)

        def tiles(route):
            self.calls["tiles"].append(route.request.url)
            if self.tiles_ok:
                route.fulfill(status=200, content_type="image/png", headers=cors, body=png_bytes())
            else:
                route.fulfill(status=404, body="Not found", headers=cors)

        def other_api(route):
            """Feature routes (inbound, push, share preview…) are stubbed by tests through api.extra."""
            path = urllib.parse.urlparse(route.request.url).path
            self.calls["other"].append((route.request.method, path))
            if path == "/api/push/config":
                return json_resp(route, {"enabled": self.push["enabled"], "publicKey": self.push["publicKey"] if self.push["enabled"] else None})
            if path in ("/api/push/subscribe", "/api/push/unsubscribe"):
                self.push["posts"].append((path, json.loads(route.request.post_data or "{}")))
                return json_resp(route, {"ok": self.push["status"] == 200} if self.push["status"] == 200 else {"error": "x"}, self.push["status"])
            for prefix, handler in self.extra.items():
                if path.startswith(prefix):
                    return handler(route, json_resp)
            json_resp(route, {"error": "not found"}, 404)

        context.route("**/api/health*", health)
        context.route("**/api/timetable*", timetable)
        context.route("**/api/flights*", flights)
        context.route("**/api/history*", history)
        context.route("**/api/tiles/**", tiles)
        context.route("**/api/inbound*", other_api)
        context.route("**/api/push/**", other_api)

        # External services the details page uses: answered locally so tests don't need the internet.
        today = datetime.now(timezone.utc).date()
        days = [(today + timedelta(days=i)).isoformat() for i in range(5)]
        context.route("https://api.open-meteo.com/**", lambda r: r.fulfill(status=200, content_type="application/json", headers=cors, body=json.dumps({
            "timezone": "Europe/London",
            "daily": {"time": days, "weathercode": [3, 61, 3, 1, 0], "temperature_2m_max": [18, 17, 19, 20, 21],
                      "temperature_2m_min": [12, 11, 10, 11, 12], "apparent_temperature_max": [16] * 5,
                      "apparent_temperature_min": [10] * 5, "precipitation_sum": [0, 2, 0, 0, 0],
                      "precipitation_probability_max": [10, 60, 5, 0, 0], "windspeed_10m_max": [20] * 5,
                      "uv_index_max": [2] * 5, "sunrise": [d + "T07:12" for d in days], "sunset": [d + "T18:44" for d in days]}})))
        context.route("https://geocoding-api.open-meteo.com/**", lambda r: r.fulfill(status=200, content_type="application/json", headers=cors, body='{"results":[]}'))
        context.route("https://*.tile.openstreetmap.org/**", lambda r: (self.calls["tiles"].append(r.request.url), r.fulfill(status=200, content_type="image/png", body=png_bytes((200, 200, 200))))[1])
        for pat in ("https://www.gstatic.com/**", "https://images.kiwi.com/**", "https://content.airhex.com/**"):
            context.route(pat, lambda r: r.fulfill(status=404, body=""))


@pytest.fixture
def api():
    return FakeApi()


# --------------------------------------------------------------------------- browser
@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def new_context(browser, api):
    """Factory: new_context(width=390, height=844, scheme='light', dsf=1, sw=False, **kw).
    The service worker is blocked unless sw=True: most tests don't need it, and installing its offline cache in every
    fresh browser context only adds work (and flakiness on a busy machine)."""
    made = []

    def make(width=390, height=844, scheme="light", dsf=1, sw=False, **kw):
        ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=dsf,
                                  color_scheme=scheme, locale="en-GB",
                                  service_workers="allow" if sw else "block", **kw)
        api.install(ctx)
        made.append(ctx)
        ctx.on("page", _attach_logging)
        return ctx

    yield make
    for c in made:
        c.close()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    setattr(item, "rep_" + rep.when, rep)


_logged_pages = []


@pytest.fixture(autouse=True)
def _dump_browser_log_on_failure(request):
    """When a browser test fails, print what the page said (console + JS errors): the quickest way to see why."""
    _logged_pages.clear()
    yield
    rep = getattr(request.node, "rep_call", None)
    if rep is not None and rep.failed:
        for i, pg in enumerate(_logged_pages):
            lines = getattr(pg, "console_log", [])
            if lines:
                print(f"\n--- browser log (page {i + 1}, {pg.url}) ---")
                print("\n".join(lines[-40:]))


def _attach_logging(pg):
    pg.errors = []
    pg.console_log = []
    pg.on("pageerror", lambda e: (pg.errors.append(str(e)), pg.console_log.append(f"PAGEERROR {e}")))
    pg.on("console", lambda m: pg.console_log.append(f"{m.type}: {m.text}"))
    pg.on("requestfailed", lambda r: pg.console_log.append(f"REQUEST FAILED {r.url} {r.failure}"))
    _logged_pages.append(pg)
    return pg


@pytest.fixture
def page(new_context):
    return new_context().new_page()         # logging is attached by the context's "page" event


def wait_list(pg, fresh=True):
    """Wait until the list page shows flights (and, if fresh, the network refresh has finished)."""
    pg.wait_for_selector(".flight-card:not(.skeleton)", timeout=20000)
    if fresh:
        pg.wait_for_function("!document.getElementById('lastRefreshed').textContent.includes('cached') && document.getElementById('lastRefreshed').textContent !== ''", timeout=20000)


def wait_details(pg):
    pg.wait_for_selector("#updatedLine", timeout=20000)
    pg.wait_for_function("document.getElementById('updatedLine').textContent !== '' && !document.getElementById('updatedLine').textContent.startsWith('Updating')", timeout=20000)
