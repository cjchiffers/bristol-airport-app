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


# ----------------------------------------------------------------------------- share previews
def test_share_link_uses_the_preview_address_when_the_worker_supports_it(page, base_url, api):
    api.features = {"tiles": True, "history": True, "preview": True}
    open_flight(page, base_url, api, "U2 2806", "arrival")
    page.wait_for_function("window.BrsConfig.features.preview === true")
    page.evaluate("window.__shared=null; navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }")
    page.click("#shareIconBtn")
    url = page.evaluate("window.__shared.url")
    f = api.find("U2 2806", "arrival")[0]
    date = f["arrival"]["scheduledTime"][:10]
    assert url == f"https://flightapp-workers.chiffers.com/s/arrival/U2%202806/{date}?p=Kos", url


def test_share_link_falls_back_to_the_app_url_with_an_older_worker(page, base_url, api):
    api.features = {}                                           # an older worker: no preview support
    open_flight(page, base_url, api, "U2 2806", "arrival")
    page.wait_for_function("window.BrsConfig.featuresReady !== null")
    page.evaluate("window.BrsConfig.featuresReady")
    page.evaluate("window.__shared=null; navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }")
    page.click("#shareIconBtn")
    assert page.evaluate("window.__shared.url") == page.url


# ----------------------------------------------------------------------------- incoming aircraft
def inbound_stub(api, payload, seen=None):
    def handler(route, json_resp):
        if seen is not None:
            seen.append(urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query))
        json_resp(route, payload)
    api.extra["/api/inbound"] = handler
    api.features = {"tiles": True, "history": True, "inbound": True}


def test_late_incoming_aircraft_warns_a_departing_passenger(page, base_url, api):
    seen = []
    inbound_stub(api, {"available": True, "reg": "G-UZHA", "turnaroundMin": 30, "additionalDelayMin": 15, "inbound": {
        "number": "U2 7076", "from": "AMS", "to": "BRS", "status": "approaching", "landed": False,
        "scheduledArrival": "2026-10-04 15:25+01:00", "estimatedArrival": "2026-10-04 16:00+01:00", "actualArrival": "", "delay": 35}}, seen)
    open_flight(page, base_url, api, "U2 7075", "departure")
    page.wait_for_selector("#inboundCard:not([hidden])")
    assert page.inner_text("#inboundLine") == "Your aircraft is operating U2 7076 from Amsterdam, which is due 16:00 (35 min late)."
    assert page.inner_text("#inboundEffect") == "This could delay your departure by about 15 minutes."
    assert "is-warn" in page.get_attribute("#inboundCard", "class")
    assert seen[0]["type"] == ["departure"] and seen[0]["flight_iata"] == ["U2 7075"] and len(seen) == 1


def test_inbound_for_a_pickup_talks_about_the_origin_airport(page, base_url, api):
    inbound_stub(api, {"available": True, "reg": "G-ATRX", "turnaroundMin": 30, "additionalDelayMin": 40, "inbound": {
        "number": "U2 2805", "from": "ATH", "to": "BCN", "status": "approaching", "landed": False,
        "scheduledArrival": "2026-10-04 12:00+01:00", "estimatedArrival": "2026-10-04 12:40+01:00", "actualArrival": "", "delay": 40}})
    open_flight(page, base_url, api, "EZY 51", "arrival")
    page.wait_for_selector("#inboundCard:not([hidden])")
    assert page.inner_text("#inboundLine").startswith("This aircraft’s previous flight, U2 2805 (Athens → Barcelona), is due 12:40 (40 min late)")
    assert "may leave Barcelona about 40 minutes late" in page.inner_text("#inboundEffect")


def test_landed_inbound_is_calm_and_cancelled_inbound_is_flagged(page, base_url, api):
    base = {"available": True, "reg": "G-UZHA", "turnaroundMin": 30, "additionalDelayMin": 0}
    inbound_stub(api, {**base, "inbound": {"number": "U2 7076", "from": "AMS", "to": "BRS", "status": "landed", "landed": True,
                                            "scheduledArrival": "2026-10-04 15:25+01:00", "estimatedArrival": "", "actualArrival": "2026-10-04 15:20+01:00", "delay": -5}})
    open_flight(page, base_url, api, "U2 7075", "departure")
    page.wait_for_selector("#inboundCard:not([hidden])")
    assert "landed at 15:20" in page.inner_text("#inboundLine") and page.inner_text("#inboundEffect") == ""
    assert "is-warn" not in page.get_attribute("#inboundCard", "class")

    inbound_stub(api, {**base, "inbound": {"number": "U2 7076", "from": "AMS", "to": "BRS", "status": "cancelled", "landed": False,
                                            "scheduledArrival": "2026-10-04 15:25+01:00", "estimatedArrival": "", "actualArrival": "", "delay": ""}})
    open_flight(page, base_url, api, "U2 7075", "departure")
    page.wait_for_selector("#inboundCard:not([hidden])")
    assert "was cancelled" in page.inner_text("#inboundLine") and "is-bad" in page.get_attribute("#inboundCard", "class")


def test_inbound_is_not_requested_when_it_cannot_help(page, base_url, api):
    seen = []
    inbound_stub(api, {"available": False, "reason": "no_inbound_found"}, seen)
    # departed flight: nothing to warn about
    open_flight(page, base_url, api, "FR 8296", "departure")
    page.wait_for_timeout(500)
    assert seen == [] and page.is_hidden("#inboundCard")
    # no registration known yet
    api.departures[0]["aircraft"]["regNumber"] = ""
    open_flight(page, base_url, api, "U2 7075", "departure")
    page.wait_for_timeout(500)
    assert seen == []
    # nothing found: card stays hidden
    api.departures[0]["aircraft"]["regNumber"] = "G-UZHA"
    open_flight(page, base_url, api, "U2 7075", "departure")
    page.wait_for_timeout(500)
    assert len(seen) == 1 and page.is_hidden("#inboundCard")


def test_inbound_not_requested_from_an_older_worker(page, base_url, api):
    seen = []
    inbound_stub(api, {"available": True}, seen)
    api.features = {"tiles": True, "history": True}            # worker without the inbound route
    open_flight(page, base_url, api, "U2 7075", "departure")
    page.wait_for_timeout(600)
    assert seen == [] and page.is_hidden("#inboundCard")


def test_inbound_failure_is_silent(page, base_url, api):
    def handler(route, json_resp):
        json_resp(route, {"error": "upstream", "status": 429}, 502)
    api.extra["/api/inbound"] = handler
    api.features = {"tiles": True, "history": True, "inbound": True}
    open_flight(page, base_url, api, "U2 7075", "departure")
    page.wait_for_timeout(600)
    assert page.is_hidden("#inboundCard") and page.inner_text("#heroFlightNumber") == "U2 7075"
    assert not page.errors


# ----------------------------------------------------------------------------- live aircraft position
MARKER_SPY = """
(() => { let real; Object.defineProperty(window, 'L', { configurable: true, get() { return real; }, set(v) {
  real = v;
  if (v && v.marker && !v.__spied) { v.__spied = true; const orig = v.marker;
    v.marker = function (...a) { const m = orig.apply(this, a); (window.__markers = window.__markers || []).push(m); return m; }; } } }); })();
"""


def with_position(api, number="FR 750", minutes_ago=2, **over):
    f = api.find(number, "arrival")[0]
    reported = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
    f["position"] = {"lat": 49.5, "lon": -4.25, "altitudeFt": 36012, "speedKt": 441, "trackDeg": 128.4, "vsiFpm": 0, "reportedAt": reported, **over}
    return f


def plane_latlng(pg):
    return pg.evaluate("""() => { const m = (window.__markers || []).filter(x => x.options && x.options.interactive === false).pop();
                                  if (!m) return null; const p = m.getLatLng(); return [p.lat, p.lng]; }""")


def open_via_list(pg, base_url, number):
    pg.goto(base_url + "/index.html")
    wait_list(pg)
    pg.click('.seg-btn[data-tab="arrivals"]')
    pg.locator("#arrivalList .flight-card", has_text=number).first.locator("a.fc-link").click()
    pg.wait_for_url("**/flight-details.html*")
    wait_details(pg)


def test_airborne_flight_shows_live_position_and_places_the_plane(new_context, base_url, api):
    ctx = new_context()
    ctx.add_init_script(MARKER_SPY)
    pg = ctx.new_page()
    with_position(api)
    open_via_list(pg, base_url, "FR 750")                            # list caches the flight, so its status is known
    pg.wait_for_selector("#liveInfo:not([hidden])")
    assert pg.inner_text("#liveInfo") == "In flight · 36,000 ft · 441 kt · position 2 min ago"
    assert api.calls["flights_queries"][0].get("live") == ["1"], "asked for the live position because the flight is airborne"
    pg.wait_for_function("(window.__markers || []).some(m => m.options && m.options.interactive === false)")
    pg.wait_for_function("(() => { const m = (window.__markers||[]).filter(x => x.options && x.options.interactive === false).pop(); const p = m && m.getLatLng(); return p && Math.abs(p.lat - 49.5) < 1e-6 && Math.abs(p.lng + 4.25) < 1e-6; })()", timeout=8000)
    lat, lon = plane_latlng(pg)
    assert (round(lat, 3), round(lon, 3)) == (49.5, -4.25), "plane sits on its real position, not on the route animation"


def test_shared_link_to_an_airborne_flight_asks_again_for_the_position(page, base_url, api):
    with_position(api)
    open_flight(page, base_url, api, "FR 750", "arrival")            # no cache: first fetch can't know it is airborne
    page.wait_for_selector("#liveInfo:not([hidden])", timeout=8000)
    lives = [q.get("live") for q in api.calls["flights_queries"]]
    assert lives[0] is None and ["1"] in lives, lives
    assert lives.count(["1"]) == 1, "asks once, not in a loop"


def test_no_live_request_or_line_for_a_flight_that_has_not_left(new_context, base_url, api):
    ctx = new_context()
    pg = ctx.new_page()
    f = api.find("EZY 51", "arrival")[0]                              # status: scheduled
    f["position"] = {"lat": 40, "lon": 0, "altitudeFt": 1, "speedKt": 1, "trackDeg": 0, "reportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    open_via_list(pg, base_url, "EZY 51")
    pg.wait_for_timeout(500)
    assert all("live" not in q for q in api.calls["flights_queries"]) and pg.is_hidden("#liveInfo")


def test_stale_or_landed_positions_are_not_shown(page, base_url, api):
    with_position(api, minutes_ago=40)                                 # last report too old
    open_flight(page, base_url, api, "FR 750", "arrival")
    page.wait_for_timeout(800)
    assert page.is_hidden("#liveInfo")
    with_position(api, minutes_ago=1)
    api.find("FR 750", "arrival")[0]["status"] = "landed"              # landed: position is meaningless
    open_flight(page, base_url, api, "FR 750", "arrival")
    page.wait_for_timeout(800)
    assert page.is_hidden("#liveInfo")


def test_missing_altitude_and_speed_are_left_out_of_the_line(page, base_url, api):
    with_position(api, altitudeFt=None, speedKt=None)
    open_flight(page, base_url, api, "FR 750", "arrival")
    page.wait_for_selector("#liveInfo:not([hidden])", timeout=8000)
    assert page.inner_text("#liveInfo") == "In flight · position 2 min ago"
