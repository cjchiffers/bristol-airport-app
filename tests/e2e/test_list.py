import re
from datetime import datetime, timedelta, timezone

import pytest

from conftest import wait_list, flight


def cards(pg, list_id):
    return pg.locator(f"#{list_id} .flight-card")


def card(pg, list_id, number):
    return pg.locator(f"#{list_id} .flight-card", has_text=number).first


def open_list(pg, base_url):
    pg.goto(base_url + "/index.html")
    wait_list(pg)


def go_arrivals(pg):
    pg.click('.seg-btn[data-tab="arrivals"]')


def test_arrivals_in_the_air_are_listed_by_landing_time(page, base_url):
    """Regression: arrivals were hidden/sorted by the ORIGIN's departure time."""
    open_list(page, base_url)
    go_arrivals(page)
    texts = cards(page, "arrivalList").all_inner_texts()
    flat = " ".join(texts)
    for n in ("KL 1083", "U2 2806", "FR 750", "BA 123", "EZY 51"):
        assert n in flat, f"{n} missing from arrivals"
    order = [re.search(r"[A-Z0-9]{2,3} \d{1,4}", t).group(0) for t in texts]
    assert order.index("BA 123") < order.index("KL 1083") < order.index("U2 2806"), order  # landing order, not take-off


def test_status_pills_and_live_times(page, base_url):
    open_list(page, base_url)
    go_arrivals(page)
    assert re.search(r"Delayed · Exp \d\d:\d\d", card(page, "arrivalList", "U2 2806").inner_text())
    assert re.search(r"Early · Exp \d\d:\d\d", card(page, "arrivalList", "FR 750").inner_text())
    assert re.search(r"Landed \d\d:\d\d", card(page, "arrivalList", "BA 123").inner_text())
    assert "Cancelled" in card(page, "arrivalList", "FR 999").inner_text()
    assert card(page, "arrivalList", "U2 2806").locator(".time-old").count() == 1, "scheduled time struck through when moved"
    assert card(page, "arrivalList", "EZY 51").locator(".time-old").count() == 0
    assert "Departed" in card(page, "departureList", "FR 8296").inner_text()


def test_arrival_cards_never_show_a_gate(page, base_url):
    """The only gate in the data is the ORIGIN airport's, which is meaningless to someone at Bristol."""
    open_list(page, base_url)
    go_arrivals(page)
    assert "Gate" not in page.inner_text("#arrivalList")


def test_quick_filters(page, base_url):
    open_list(page, base_url)
    go_arrivals(page)
    page.click('.chip-btn[data-filter="delayed"]')
    assert [t.split("\n")[0] for t in cards(page, "arrivalList").all_inner_texts()] == ["U2 2806"]
    page.click('.chip-btn[data-filter="cancelled"]')
    assert [t.split("\n")[0] for t in cards(page, "arrivalList").all_inner_texts()] == ["FR 999"]
    page.click('.chip-btn[data-filter="next"]')
    nums = " ".join(cards(page, "arrivalList").all_inner_texts())
    assert "U2 2806" in nums and "TOM 77" not in nums, "Next 4h excludes tomorrow's flight"
    page.click('.chip-btn[data-filter="all"]')
    assert cards(page, "arrivalList").count() == 7
    assert [b.get_attribute("data-filter") for b in page.locator(".chip-btn").all()] == ["all", "next", "delayed", "cancelled"]


def test_search_finds_codeshare_numbers_and_city_names(page, base_url):
    open_list(page, base_url)
    go_arrivals(page)
    page.fill("#searchInput", "EC 2806")
    page.wait_for_timeout(400)
    assert cards(page, "arrivalList").count() == 1 and "U2 2806" in cards(page, "arrivalList").first.inner_text()
    page.fill("#searchInput", "amsterdam")
    page.wait_for_timeout(400)
    assert "KL 1083" in cards(page, "arrivalList").first.inner_text()
    page.fill("#searchInput", "zzzz-no-such")
    page.wait_for_timeout(400)
    assert page.is_visible("#arrEmpty")


def test_card_is_a_real_link_to_a_shareable_url(page, base_url):
    open_list(page, base_url)
    go_arrivals(page)
    link = card(page, "arrivalList", "U2 2806").locator("a.fc-link")
    href = link.get_attribute("href")
    assert re.fullmatch(r".*/flight-details\.html\?type=arrival&flight=U2%202806&date=\d{4}-\d{2}-\d{2}", href), href
    link.focus()
    page.keyboard.press("Enter")                    # keyboard users can open a flight
    page.wait_for_url("**/flight-details.html*")
    assert "flight=U2%202806" in page.url
    assert not page.errors


def test_codeshares_are_merged_by_the_page_too(page, base_url, api):
    """The page de-duplicates as well, so it is correct against an older worker that doesn't."""
    twin = flight("EC 2806", "arrival", "KGS", at=30, delay=15, status="approaching", airline=("EC", "EasyJet Europe"))
    api.arrivals.append(twin)
    open_list(page, base_url)
    go_arrivals(page)
    nums = [t.split("\n")[0] for t in cards(page, "arrivalList").all_inner_texts()]
    assert nums.count("U2 2806") == 1 and "EC 2806" not in nums


@pytest.mark.parametrize("width,height", [(360, 740), (390, 844), (768, 1024), (1024, 768), (1440, 900)])
def test_no_horizontal_scroll_and_layout_by_width(new_context, base_url, width, height):
    ctx = new_context(width=width, height=height)
    pg = ctx.new_page()
    open_list(pg, base_url)
    assert not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    desktop = width >= 1024
    assert pg.is_visible(".segmented") != desktop
    assert pg.is_visible("#departureList") and pg.is_visible("#arrivalList") == desktop
    if desktop:
        d, a = pg.locator("#tab-departures").bounding_box(), pg.locator("#tab-arrivals").bounding_box()
        assert abs(d["y"] - a["y"]) < 4 and a["x"] > d["x"] + d["width"] - 4, "columns sit side by side"


def test_tabs_are_keyboard_accessible(page, base_url):
    open_list(page, base_url)
    page.focus("#seg-departures")
    page.keyboard.press("ArrowRight")
    assert page.get_attribute("#seg-arrivals", "aria-selected") == "true"
    assert page.get_attribute("#seg-departures", "tabindex") == "-1"
    page.keyboard.press("ArrowLeft")
    assert page.get_attribute("#seg-departures", "aria-selected") == "true"


def test_menu_closes_with_escape_and_returns_focus(page, base_url):
    open_list(page, base_url)
    page.click("#overflowBtn")
    assert page.is_visible("#overflowMenu")
    page.keyboard.press("Escape")
    assert not page.is_visible("#overflowMenu")
    assert page.evaluate("document.activeElement.id") == "overflowBtn"


def test_failed_first_load_shows_error_not_an_empty_list_and_retry_recovers(page, base_url, api):
    api.timetable_status = 502
    page.goto(base_url + "/index.html")
    page.wait_for_selector("#errorBanner:not([hidden])")
    assert "Couldn’t load flights" in page.inner_text("#errorBannerMsg")
    assert not page.is_visible("#depEmpty") and page.locator(".skeleton").count() == 0
    api.timetable_status = 200
    before = api.calls["timetable"]
    page.click("#errorBannerRetry")
    wait_list(page)
    assert api.calls["timetable"] - before == 2, "one tap = one refresh (listeners must not stack)"
    assert page.is_hidden("#errorBanner")


def test_failed_refresh_keeps_the_existing_list(page, base_url, api):
    open_list(page, base_url)
    api.timetable_status = 502
    page.click("#overflowBtn")
    page.click("#refreshBtn")
    page.wait_for_selector("#errorBanner:not([hidden])")
    assert "last data we have" in page.inner_text("#errorBannerMsg")
    assert cards(page, "departureList").count() > 0


def test_live_feed_delayed_note_when_worker_serves_last_good_copy(page, base_url, api):
    api.stale_from = datetime.now(timezone.utc) - timedelta(minutes=17)
    open_list(page, base_url)
    txt = page.inner_text("#lastRefreshed")
    assert txt.startswith("Live feed delayed — data from "), txt
    assert "is-stale" in page.get_attribute("#lastRefreshed", "class")
    assert cards(page, "departureList").count() > 0, "data still shown"


def test_auto_refresh_runs_while_visible_and_stops_when_hidden(new_context, base_url, api):
    ctx = new_context()
    pg = ctx.new_page()
    pg.clock.install()
    pg.goto(base_url + "/index.html")
    wait_list(pg)
    n = api.calls["timetable"]
    pg.clock.run_for(125_000)
    pg.wait_for_timeout(300)
    assert api.calls["timetable"] - n == 2, "dep+arr refreshed after ~2 minutes"
    pg.evaluate("Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
    n = api.calls["timetable"]
    pg.clock.run_for(600_000)
    pg.wait_for_timeout(300)
    assert api.calls["timetable"] == n, "no requests while the tab is hidden"
    pg.evaluate("Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_timeout(500)
    assert api.calls["timetable"] - n == 2, "refreshes straight away on return when data is stale"


def test_times_are_london_time_whatever_the_viewers_timezone(new_context, base_url, api):
    ctx = new_context(timezone_id="America/New_York")
    pg = ctx.new_page()
    open_list(pg, base_url)
    f = api.departures[0]
    expected = f["departure"]["scheduledTime"][11:16]       # London wall-clock time sent by the worker
    assert expected in card(pg, "departureList", f["flight"]["iataNumber"]).inner_text()
