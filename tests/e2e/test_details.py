import json
import re
import urllib.parse
from datetime import datetime, timedelta, timezone

import pytest

from conftest import wait_details, wait_list, flight, london


def url_for(base_url, f, side=None):
    side = side or f["type"]
    date = f[side]["scheduledTime"][:10]
    return f"{base_url}/flight-details.html?type={side}&flight={urllib.parse.quote(f['flight']['iataNumber'])}&date={date}"


def open_flight(pg, base_url, api, number, side):
    f = api.find(number, side)[0]
    pg.goto(url_for(base_url, f, side))
    wait_details(pg)
    return f


# ----------------------------------------------------------------------------- hero, per direction
def test_arrival_shows_belt_not_gate_and_a_countdown(page, base_url, api):
    open_flight(page, base_url, api, "U2 2806", "arrival")
    assert page.is_visible("#heroBeltItem") and not page.is_visible("#heroGateItem")
    assert page.inner_text("#heroBaggage") == "TBC"
    assert re.fullmatch(r"Lands in \d+ min|Lands in \d+h( \d\d)?m?", page.inner_text("#heroCountdownText")), page.inner_text("#heroCountdownText")
    assert re.search(r"Delayed · Exp \d\d:\d\d", page.inner_text("#heroArrDelay")), "status only on the Bristol side"
    assert not page.is_visible("#heroDepDelay")
    assert page.inner_text("#heroDepCity") == "Kos"             # friendly name from the airport index


def test_departure_shows_gate_terminal_and_checkin_not_belt(page, base_url, api):
    open_flight(page, base_url, api, "U2 7075", "departure")
    assert page.is_visible("#heroGateItem") and not page.is_visible("#heroBeltItem")
    assert page.inner_text("#heroGate") == "A4"
    ops = page.inner_text("#opsBar")
    assert "Terminal" in ops and "1" in ops and "201-215" in ops
    assert re.match(r"Departs in ", page.inner_text("#heroCountdownText"))
    kv = page.inner_text("#depKv") + page.inner_text("#arrKv")
    assert "Gate" in page.inner_text("#depKv") and "Belt" not in kv, "only Bristol-side gate/belt rows"


def test_arrival_kv_panels_hide_the_origins_terminal_and_gate(page, base_url, api):
    api.arrivals[2]["departure"].update(gate="D28", terminal="1")      # origin airport values
    open_flight(page, base_url, api, "U2 2806", "arrival")
    assert "D28" not in page.inner_text("body")
    assert "Belt" in page.inner_text("#arrKv")


def test_pickup_helper_gives_a_likely_out_window_and_is_hidden_for_departures(page, base_url, api):
    open_flight(page, base_url, api, "U2 2806", "arrival")
    hint = page.inner_text("#heroHint")
    m = re.match(r"Likely out (\d\d):(\d\d)–(\d\d):(\d\d) · passengers usually take 20–30 minutes", hint)
    assert m, hint
    f = api.find("U2 2806", "arrival")[0]
    live = f["arrival"]["estimatedTime"][11:16]                 # best-known landing time (London)
    h, mi = map(int, live.split(":"))
    start = (h * 60 + mi + 20) % 1440
    assert f"{start // 60:02d}:{start % 60:02d}" == f"{m.group(1)}:{m.group(2)}"
    open_flight(page, base_url, api, "U2 7075", "departure")
    assert not page.is_visible("#heroHint") and not page.is_visible("#wakeBtn")


def test_keep_screen_on_uses_the_wake_lock_and_reacquires(new_context, base_url, api):
    ctx = new_context()
    ctx.add_init_script("""
      window.__wl = { requests: 0, releases: 0, active: null };
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        window.__wl.requests++;
        const l = new EventTarget(); l.released = false;
        l.release = async () => { window.__wl.releases++; l.released = true; l.dispatchEvent(new Event('release')); };
        window.__wl.active = l; return l; } } });
    """)
    pg = ctx.new_page()
    open_flight(pg, base_url, api, "U2 2806", "arrival")
    assert pg.is_visible("#wakeBtn") and pg.get_attribute("#wakeBtn", "aria-pressed") == "false"
    pg.click("#wakeBtn")
    assert pg.evaluate("window.__wl.requests") == 1 and pg.get_attribute("#wakeBtn", "aria-pressed") == "true"
    # the browser drops the lock when the tab is hidden; coming back must re-request it
    pg.evaluate("window.__wl.active.dispatchEvent(new Event('release'))")
    pg.evaluate("Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_function("window.__wl.requests === 2")
    pg.click("#wakeBtn")
    assert pg.evaluate("window.__wl.releases") >= 1 and pg.get_attribute("#wakeBtn", "aria-pressed") == "false"


def test_wake_button_not_offered_when_unsupported(new_context, base_url, api):
    ctx = new_context()
    ctx.add_init_script("Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined }); delete Navigator.prototype.wakeLock;")
    pg = ctx.new_page()
    open_flight(pg, base_url, api, "U2 2806", "arrival")
    assert not pg.is_visible("#wakeBtn")


# ----------------------------------------------------------------------------- reload / share links
def test_reload_keeps_the_flight_and_a_new_device_can_open_the_link(page, base_url, api, new_context):
    f = open_flight(page, base_url, api, "FR 750", "arrival")
    url = page.url
    page.reload()
    wait_details(page)
    assert page.url == url and page.inner_text("#heroFlightNumber") == "FR 750"
    other = new_context().new_page()                           # fresh storage = another device
    other.goto(url)
    wait_details(other)
    assert other.inner_text("#heroFlightNumber") == "FR 750"
    assert "FR 750" in other.title()


def test_share_uses_the_native_sheet_with_a_status_aware_message(page, base_url, api):
    open_flight(page, base_url, api, "U2 2806", "arrival")
    page.evaluate("window.__shared=null; navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }")
    page.click("#shareIconBtn")
    shared = page.evaluate("window.__shared")
    assert shared["url"] == page.url, "shares exactly the page's own canonical URL (never a ?key= URL)"
    assert re.fullmatch(r"U2 2806 from Kos — expected at Bristol \d\d:\d\d \(scheduled \d\d:\d\d\)", shared["text"]), shared["text"]
    assert shared["title"].startswith("U2 2806")


def test_share_falls_back_to_copying_the_link(new_context, base_url, api):
    ctx = new_context()
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=base_url)
    pg = ctx.new_page()
    open_flight(pg, base_url, api, "U2 2806", "arrival")
    pg.evaluate("Object.defineProperty(navigator,'share',{value:undefined,configurable:true})")
    pg.click("#shareIconBtn")
    pg.wait_for_function("document.getElementById('toast').textContent === 'Link copied'")
    assert pg.evaluate("navigator.clipboard.readText()") == pg.url


def test_cancelled_share_does_not_copy_anything(page, base_url, api):
    open_flight(page, base_url, api, "U2 2806", "arrival")
    page.evaluate("(() => { navigator.share = () => Promise.reject(Object.assign(new Error('x'), {name:'AbortError'})); })()")
    page.click("#shareIconBtn")
    page.wait_for_timeout(300)
    assert page.inner_text("#toast") == ""


def test_unknown_flight_and_incomplete_links_show_a_friendly_page(page, base_url):
    page.goto(base_url + "/flight-details.html?type=arrival&flight=ZZ%209999&date=2026-10-02")
    page.wait_for_selector("#notFound:not([hidden])")
    assert "ZZ 9999" in page.inner_text("#notFoundMsg") and page.is_visible("a:has-text('See all flights')")
    page.goto(base_url + "/flight-details.html")
    page.wait_for_selector("#notFound:not([hidden])")
    assert page.inner_text("#notFoundTitle") == "Flight link incomplete" and not page.is_visible("#notFoundRetry")


def test_old_key_links_are_upgraded_to_the_new_url_format(page, base_url, api):
    f = api.find("U2 2806", "arrival")[0]
    page.goto(base_url + "/index.html")
    page.evaluate("(p) => sessionStorage.setItem('flight_old', JSON.stringify(p))", {"flight": f, "context": {"mode": "arrival"}})
    page.goto(base_url + "/flight-details.html?key=flight_old")
    wait_details(page)
    assert "type=arrival" in page.url and "flight=U2%202806" in page.url and "key=" not in page.url


def test_back_button_goes_to_the_list_when_opened_from_a_shared_link(page, base_url, api):
    open_flight(page, base_url, api, "U2 2806", "arrival")        # direct open: no same-origin referrer
    page.click("#backBtn")
    page.wait_for_url("**/index.html")


def test_deep_link_reloads_offline_via_the_service_worker(new_context, base_url, api):
    ctx = new_context()
    pg = ctx.new_page()
    pg.goto(base_url + "/index.html")
    wait_list(pg)
    pg.evaluate("navigator.serviceWorker.ready.then(() => 1)")
    pg.wait_for_timeout(1200)
    f = open_flight(pg, base_url, api, "U2 2806", "arrival")
    pg.wait_for_timeout(500)
    ctx.set_offline(True)
    pg.reload()
    pg.wait_for_selector("#heroFlightNumber", timeout=15000)
    assert pg.inner_text("#heroFlightNumber") == "U2 2806"


# ----------------------------------------------------------------------------- refresh behaviour
def test_details_polls_every_minute_only_while_visible_and_shows_connection_issues(new_context, base_url, api):
    ctx = new_context()
    pg = ctx.new_page()
    pg.clock.install()
    open_flight(pg, base_url, api, "U2 2806", "arrival")
    n = api.calls["flights"]
    pg.clock.run_for(61_000)
    pg.wait_for_timeout(300)
    assert api.calls["flights"] - n == 1
    pg.evaluate("Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
    n = api.calls["flights"]
    pg.clock.run_for(300_000)
    pg.wait_for_timeout(300)
    assert api.calls["flights"] == n
    api.flights_status = 502
    pg.evaluate("Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_selector("#netBanner", state="visible")
    assert "Connection issue" in pg.inner_text("#netBanner") and pg.inner_text("#heroFlightNumber") == "U2 2806"
    api.flights_status = 200
    pg.click("#overflowDetailsBtn")
    pg.click("#refreshBtn")
    pg.wait_for_selector("#netBanner", state="hidden")


def test_stale_worker_data_is_labelled_on_the_details_page(page, base_url, api):
    api.stale_from = datetime.now(timezone.utc) - timedelta(minutes=9)
    open_flight(page, base_url, api, "U2 2806", "arrival")
    assert page.inner_text("#updatedLine").startswith("Live feed delayed — showing data from ")


# ----------------------------------------------------------------------------- calendar
def test_add_to_calendar_downloads_a_valid_ics(new_context, base_url, api):
    ctx = new_context(accept_downloads=True)
    pg = ctx.new_page()
    f = open_flight(pg, base_url, api, "U2 7075", "departure")
    pg.click("#overflowDetailsBtn")
    with pg.expect_download() as dl:
        pg.click("#calendarBtn")
    d = dl.value
    assert d.suggested_filename.endswith(".ics") and "U27075" in d.suggested_filename
    ics = open(d.path()).read().replace("\r\n", "\n")
    assert ics.startswith("BEGIN:VCALENDAR\nVERSION:2.0") and ics.rstrip().endswith("END:VCALENDAR")
    assert "SUMMARY:U2 7075 Bristol → Amsterdam" in ics and "LOCATION:Bristol Airport (BRS)" in ics
    unfolded = ics.replace("\n ", "")
    assert re.search(r"DTSTART:\d{8}T\d{6}Z", unfolded) and "UID:departure-U27075-" in unfolded
    assert all(len(line.encode()) <= 75 for line in ics.split("\n")), "RFC 5545 line folding"


# ----------------------------------------------------------------------------- aircraft graphic
@pytest.mark.parametrize("model,label", [
    ("Airbus A320", "narrow-body jet"), ("Embraer 175", "regional jet"), ("ATR 72", "turboprop"),
    ("Boeing 787-9", "wide-body jet"), ("Boeing 747-8", "four-engine wide-body jet"), ("", "narrow-body jet"),
])
def test_aircraft_illustration_matches_the_model(page, base_url, api, model, label):
    api.arrivals[2]["aircraft"]["modelText"] = model
    open_flight(page, base_url, api, "U2 2806", "arrival")
    assert page.is_visible("#aircraftArt") and page.locator("#aircraftArt svg").count() == 1
    assert f"Illustration of a {label}" in page.get_attribute("#aircraftArt", "aria-label")


def test_aircraft_transponder_hex_is_not_shown_as_a_type_code(page, base_url, api):
    api.arrivals[2]["aircraft"].update(modelText="Airbus A320", icaoCode="406A3F")
    open_flight(page, base_url, api, "U2 2806", "arrival")
    assert page.inner_text("#aircraftType") == "Airbus A320"


# ----------------------------------------------------------------------------- history
HIST = lambda: {"flight": "U2 2806", "type": "arrival", "from": "2026-09-26", "to": "2026-10-02", "rows": [
    {"date": "2026-10-02", "scheduled": "2026-10-02 22:05+01:00", "actual": "2026-10-02 22:17+01:00", "delay": 12, "status": "landed"},
    {"date": "2026-10-01", "scheduled": "2026-10-01 22:05+01:00", "actual": "2026-10-01 22:02+01:00", "delay": -3, "status": "landed"},
    {"date": "2026-09-30", "scheduled": "2026-09-30 22:05+01:00", "actual": "2026-09-30 22:40+01:00", "delay": 35, "status": "landed"},
    {"date": "2026-09-29", "scheduled": "2026-09-29 22:05+01:00", "actual": "", "delay": "", "status": "cancelled"},
    {"date": "2026-09-28", "scheduled": "2026-09-28 22:05+01:00", "actual": "2026-09-28 22:05+01:00", "delay": 0, "status": "landed"}],
    "stats": {"flights": 5, "cancelled": 1, "measured": 4, "avgDelay": 11, "onTime": 3}}


def test_history_is_loaded_only_when_opened_then_cached_in_the_page(page, base_url, api):
    api.history = HIST()
    open_flight(page, base_url, api, "U2 2806", "arrival")
    assert api.calls["history"] == 0
    page.click("#historyCard summary")
    page.wait_for_selector(".history-table")
    assert api.calls["history"] == 1
    assert page.inner_text(".history-summary") == "Average 11 min late · 3 of 4 within 15 min · 1 cancelled"
    rows = [r.inner_text().replace("\t", " | ") for r in page.locator(".history-table tbody tr").all()]
    assert "+12 min" in rows[0] and "3 min early" in rows[1] and "Cancelled" in rows[3] and "On time" in rows[4]
    assert "Sep" in rows[2] and "Sept" not in rows[2], "3-letter month"
    assert page.locator(".history-table th").nth(2).inner_text() == "Landed"
    page.click("#historyCard summary")
    page.click("#historyCard summary")
    assert api.calls["history"] == 1, "closing and reopening must not refetch"


def test_history_failure_is_friendly_and_retry_works(page, base_url, api):
    open_flight(page, base_url, api, "U2 2806", "arrival")
    page.click("#historyCard summary")
    page.wait_for_selector("#historyRetry")
    assert "isn’t available right now" in page.inner_text("#historyBody")
    api.history = HIST()
    page.click("#historyRetry")
    page.wait_for_selector(".history-table")


def test_departure_history_says_departed(page, base_url, api):
    h = HIST(); h["type"] = "departure"
    api.history = h
    open_flight(page, base_url, api, "U2 7075", "departure")
    page.click("#historyCard summary")
    page.wait_for_selector(".history-table")
    assert page.locator(".history-table th").nth(2).inner_text() == "Departed"
    q = urllib.parse.parse_qs(urllib.parse.urlparse(page.evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('/api/history')).pop()")).query)
    assert q["dep_iata"] == ["BRS"] and "arr_iata" not in q


# ----------------------------------------------------------------------------- map tiles
@pytest.mark.parametrize("scheme,style", [("light", "rastertiles/voyager"), ("dark", "dark_all")])
def test_map_tiles_come_from_our_worker_never_directly_from_carto(new_context, base_url, api, scheme, style):
    ctx = new_context(scheme=scheme, dsf=2)
    pg = ctx.new_page()
    direct = []
    pg.on("request", lambda r: direct.append(r.url) if "cartocdn.com" in r.url else None)
    open_flight(pg, base_url, api, "U2 2806", "arrival")
    if not pg.evaluate("!!window.L"):
        pytest.skip("Leaflet (CDN) not reachable in this environment")
    pg.wait_for_timeout(1500)
    assert api.calls["tiles"], "map requested tiles"
    mine = [u for u in api.calls["tiles"] if "/api/tiles/" in u]
    assert mine and all(f"/api/tiles/{style}/" in u and u.endswith("@2x.png") for u in mine), mine[:2]
    assert not direct and not any("key=" in u for u in api.calls["tiles"]), "the CARTO key never reaches the browser"


def test_map_falls_back_to_openstreetmap_when_the_worker_cannot_serve_tiles(page, base_url, api):
    api.tiles_ok = False
    open_flight(page, base_url, api, "U2 2806", "arrival")
    if not page.evaluate("!!window.L"):
        pytest.skip("Leaflet (CDN) not reachable in this environment")
    page.wait_for_timeout(2000)
    assert any("tile.openstreetmap.org" in u for u in api.calls["tiles"]), "fell back to OSM tiles"
    assert page.evaluate("[...document.querySelectorAll('.leaflet-tile')].some(t => t.src.includes('openstreetmap') && t.complete && t.naturalWidth > 0)")


# ----------------------------------------------------------------------------- dark-mode readability
def _contrast(a, b):
    def lum(rgb):
        def c(v):
            v /= 255
            return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        r, g, bl = rgb
        return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(bl)
    hi, lo = sorted([lum(a), lum(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


@pytest.mark.parametrize("scheme", ["dark", "light"])
def test_gate_and_belt_pills_are_readable(new_context, base_url, api, scheme):
    from collections import Counter
    from PIL import Image
    import io
    api.departures[0]["departure"]["gate"] = "A4,A2"
    api.arrivals[2]["arrival"]["baggage"] = "3"
    ctx = new_context(scheme=scheme, dsf=2)
    pg = ctx.new_page()
    for number, side, sels in (("U2 7075", "departure", ["#heroGate", ".kv-line--gate .kv-v"]), ("U2 2806", "arrival", ["#heroBaggage", ".kv-line--belt .kv-v"])):
        open_flight(pg, base_url, api, number, side)
        for sel in sels:
            el = pg.locator(sel).first
            el.scroll_into_view_if_needed()
            pg.wait_for_timeout(200)
            im = Image.open(io.BytesIO(pg.screenshot(clip=el.bounding_box()))).convert("RGB")
            px = list(im.getdata())
            bg = Counter(px).most_common(1)[0][0]
            glyph = max(px, key=lambda c: _contrast(c, bg))
            assert _contrast(bg, glyph) >= 4.5, f"{scheme} {sel}: contrast {_contrast(bg, glyph):.1f}"


# ----------------------------------------------------------------------------- page frame
@pytest.mark.parametrize("width,height", [(360, 740), (390, 844), (820, 1000), (1440, 900)])
def test_details_page_has_no_horizontal_scroll(new_context, base_url, api, width, height):
    pg = new_context(width=width, height=height).new_page()
    open_flight(pg, base_url, api, "U2 2806", "arrival")
    assert not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    if width >= 1024:
        a, b = pg.locator(".details-col").nth(0).bounding_box(), pg.locator(".details-col").nth(1).bounding_box()
        assert b["x"] > a["x"] + a["width"] - 4, "two columns on desktop"


def test_background_glow_does_not_tile_when_scrolling(new_context, base_url, api):
    from PIL import Image
    import io
    pg = new_context(width=390, height=700).new_page()
    open_flight(pg, base_url, api, "U2 2806", "arrival")
    h = pg.evaluate("document.documentElement.scrollHeight")
    assert h > 1400, "page must be long enough to scroll twice"
    samples = []
    for y in (700, 1100, h):
        pg.evaluate(f"window.scrollTo(0,{y})")
        pg.wait_for_timeout(150)
        im = Image.open(io.BytesIO(pg.screenshot())).convert("RGB")
        samples.append(im.getpixel((2, 120)))               # page edge near the top of the viewport
    assert len(set(samples)) == 1, f"background changes while scrolling (tiling): {samples}"
