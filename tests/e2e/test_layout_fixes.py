"""Regression tests for visual bugs reported on real phones: unreadable menu, struck-through time running off
the card, and the airline row layout."""
import re
import urllib.parse
from datetime import datetime, timedelta, timezone

import pytest

from conftest import flight, london, wait_details, wait_list

LIGHT, DARK = "light", "dark"


def luminance(rgb):
    def c(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)


def contrast(a, b):
    hi, lo = sorted([luminance(a), luminance(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def parse_rgb(s):
    m = re.match(r"rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)", s.strip())
    assert m, f"unexpected colour format: {s}"
    return (int(m[1]), int(m[2]), int(m[3])), float(m[4]) if m[4] is not None else 1.0


def moved_flight(api, number="U2 2806"):
    """An arrival that took off late AND is landing late: both sides show a moved time."""
    now = datetime.now(timezone.utc)
    f = api.find(number, "arrival")[0]
    f["departure"]["scheduledTime"] = london(now - timedelta(hours=2, minutes=30))
    f["departure"]["estimatedTime"] = london(now - timedelta(hours=1, minutes=35))
    f["arrival"]["scheduledTime"] = london(now + timedelta(minutes=30))
    f["arrival"]["estimatedTime"] = london(now + timedelta(minutes=85))
    f["status"] = "approaching"
    return f


def open_details(pg, base_url, f):
    pg.goto(f"{base_url}/flight-details.html?type=arrival&flight={urllib.parse.quote(f['flight']['iataNumber'])}&date={f['arrival']['scheduledTime'][:10]}")
    wait_details(pg)
    pg.wait_for_timeout(300)


# ------------------------------------------------------------------------------------------------- menus
@pytest.mark.parametrize("scheme", [LIGHT, DARK])
@pytest.mark.parametrize("where", ["list", "details"])
def test_three_dot_menu_is_readable_and_opaque(new_context, base_url, api, scheme, where):
    pg = new_context(scheme=scheme).new_page()
    if where == "list":
        pg.goto(base_url + "/index.html")
        wait_list(pg)
        pg.click("#overflowBtn")
        menu, items = "#overflowMenu", "#overflowMenu .menu-item:not([hidden])"
    else:
        open_details(pg, base_url, moved_flight(api))
        pg.click("#overflowDetailsBtn")
        menu, items = "#detailsMenu", "#detailsMenu .menu-item"
    pg.wait_for_selector(f"{menu}.open")
    (bg, alpha) = parse_rgb(pg.evaluate(f"getComputedStyle(document.querySelector('{menu}')).backgroundColor"))
    assert alpha == 1.0, "menu must be opaque, or page text shows through it"
    assert pg.evaluate(f"getComputedStyle(document.querySelector('{menu}')).backdropFilter") in ("none", "")
    n = pg.locator(items).count()
    assert n >= 2
    for i in range(n):
        fg, _ = parse_rgb(pg.evaluate(f"getComputedStyle(document.querySelectorAll('{items}')[{i}]).color"))
        ratio = contrast(fg, bg)
        assert ratio >= 7, f"{scheme} {where} menu item {i}: contrast {ratio:.1f}:1 (text {fg} on {bg})"
    # and it really is drawn on top of the page
    box = pg.locator(menu).bounding_box()
    top = pg.evaluate(f"document.elementFromPoint({box['x'] + box['width'] / 2}, {box['y'] + 20}).closest('.menu') !== null")
    assert top, "menu is covered by other content"


@pytest.mark.parametrize("scheme", [LIGHT, DARK])
def test_brand_logo_is_visible_on_the_header_in_both_themes(new_context, base_url, scheme):
    pg = new_context(scheme=scheme).new_page()
    pg.goto(base_url + "/index.html")
    wait_list(pg)
    (bg, alpha) = parse_rgb(pg.evaluate("getComputedStyle(document.querySelector('.brand-logo')).backgroundColor"))
    assert alpha == 1.0 and contrast(bg, (13, 19, 100)) > 7, "navy logo needs a light tile behind it"


# ------------------------------------------------------------------------------------------------- hero
@pytest.mark.parametrize("width", [320, 360, 375, 390, 414, 430])
def test_late_flight_times_never_run_off_the_card(new_context, base_url, api, width):
    pg = new_context(width=width, height=800).new_page()
    f = moved_flight(api)
    open_details(pg, base_url, f)
    assert pg.inner_text("#heroDepTimeOld") and pg.inner_text("#heroArrTimeOld"), "test needs struck-through times on both sides"
    assert not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), "page scrolls sideways"
    card = pg.locator("#heroCard").bounding_box()
    over = pg.evaluate("""() => { const card = document.getElementById('heroCard').getBoundingClientRect(); const bad = [];
        for (const el of document.querySelectorAll('#heroCard *')) { const r = el.getBoundingClientRect();
          if (r.width && r.right > card.right + 0.5) bad.push(el.id || el.className || el.tagName); } return bad; }""")
    assert over == [], f"overflowing the hero card at {width}px: {over}"
    # the cards on the list page too
    pg.goto(base_url + "/index.html")
    wait_list(pg)
    pg.click('.seg-btn[data-tab="arrivals"]')
    over = pg.evaluate("""() => { const bad = []; for (const card of document.querySelectorAll('#arrivalList .flight-card')) { const c = card.getBoundingClientRect();
        for (const el of card.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width && r.right > c.right + 0.5) bad.push(el.className || el.tagName); } } return bad; }""")
    assert over == [], f"overflowing a list card at {width}px: {over}"


def test_airline_row_is_one_line_with_a_bigger_logo(new_context, base_url, api):
    ctx = new_context(width=390)
    pg = ctx.new_page()
    open_details(pg, base_url, moved_flight(api))
    pg.wait_for_function("document.getElementById('heroAirlineInitials').style.opacity === '1' || document.getElementById('heroAirlineLogo').style.opacity === '1'")
    logo = pg.locator(".hero-logo").bounding_box()
    name = pg.locator("#heroAirlineName").bounding_box()
    num = pg.locator("#heroFlightNumber").bounding_box()
    assert logo["width"] >= 44 and logo["height"] >= 44, "logo is bigger than the old 34px"
    centre = lambda b: b["y"] + b["height"] / 2
    assert abs(centre(logo) - centre(name)) < 6 and abs(centre(logo) - centre(num)) < 6, "logo, airline and flight number share one line"
    assert 0 <= name["x"] - (logo["x"] + logo["width"]) <= 14, "airline name sits right next to the logo"
    assert 0 <= num["x"] - (name["x"] + name["width"]) <= 24, "flight number sits right next to the airline name"
    assert pg.inner_text("#heroAirlineName") == "easyJet" and pg.inner_text("#heroFlightNumber") == "U2 2806"


def test_long_airline_names_do_not_break_the_row(new_context, base_url, api):
    api.arrivals[2]["airline"]["name"] = "Scandinavian Airlines International Services"
    pg = new_context(width=320).new_page()
    open_details(pg, base_url, moved_flight(api))
    assert not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    name = pg.locator("#heroAirlineName").bounding_box()
    card = pg.locator("#heroCard").bounding_box()
    assert name["x"] + name["width"] <= card["x"] + card["width"] + 0.5
