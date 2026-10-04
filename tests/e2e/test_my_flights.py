import json
from datetime import datetime, timedelta, timezone

from conftest import wait_list, flight


def star(pg, list_id, number):
    pg.locator(f"#{list_id} .flight-card", has_text=number).first.locator(".save-btn").click()


def saved(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('starredFlights_v1') || '[]')")


def open_list(pg, base_url):
    pg.goto(base_url + "/index.html")
    wait_list(pg)


def test_two_flights_can_be_saved_and_only_those_are_starred(page, base_url):
    """Regression: every saved flight had an empty identity, so one star made ALL stars look saved
    and saving a second flight removed the first."""
    open_list(page, base_url)
    assert page.is_hidden("#myFlights")
    star(page, "departureList", "U2 7075")
    page.click('.seg-btn[data-tab="arrivals"]')
    star(page, "arrivalList", "U2 2806")
    ids = [s["id"]["flightNo"] for s in saved(page)]
    assert sorted(ids) == ["U2 2806", "U2 7075"]
    starred = page.locator("#arrivalList .save-btn.saved").count()
    assert starred == 1, "only the flight I starred is starred"
    assert page.locator("#myFlightsList .flight-card").count() == 2


def test_saved_flights_survive_reload_and_show_live_status(page, base_url):
    open_list(page, base_url)
    page.click('.seg-btn[data-tab="arrivals"]')
    star(page, "arrivalList", "U2 2806")
    page.reload()
    wait_list(page)
    card = page.locator("#myFlightsList .flight-card").first
    assert "U2 2806" in card.inner_text() and "Delayed" in card.inner_text()
    assert card.locator(".save-btn").get_attribute("aria-pressed") == "true"


def test_unsaving_from_my_flights_updates_the_lists(page, base_url):
    open_list(page, base_url)
    star(page, "departureList", "U2 7075")
    assert page.locator("#departureList .save-btn.saved").count() == 1
    page.locator("#myFlightsList .save-btn").first.click()
    assert page.is_hidden("#myFlights")
    assert page.locator("#departureList .save-btn.saved").count() == 0
    assert saved(page) == []


def test_saved_flight_missing_from_timetable_is_marked_but_kept(page, base_url, api):
    open_list(page, base_url)
    star(page, "departureList", "U2 7075")
    api.departures = [f for f in api.departures if f["flight"]["iataNumber"] != "U2 7075"]
    page.click("#overflowBtn")
    page.click("#refreshBtn")
    page.wait_for_function("document.getElementById('myFlightsList').textContent.includes('Not in the current timetable')")
    assert "U2 7075" in page.inner_text("#myFlightsList")


def test_expired_saved_flights_are_removed_automatically(page, base_url, api):
    open_list(page, base_url)
    star(page, "departureList", "U2 7075")
    old = flight("OLD 1", "departure", "AMS", at=-13 * 60)                     # 13 hours ago
    page.evaluate("""(f) => { const l = JSON.parse(localStorage.getItem('starredFlights_v1'));
        l.push({ id: {flightNo: 'OLD 1', dep: 'BRS', arr: 'AMS', schedDep: f.departure.scheduledTime, schedArr: ''}, context: {mode: 'departure'}, flight: f });
        localStorage.setItem('starredFlights_v1', JSON.stringify(l)); }""", old)
    page.reload()
    wait_list(page)
    assert [s["id"]["flightNo"] for s in saved(page)] == ["U2 7075"]


def test_old_saved_items_with_empty_identity_are_repaired(page, base_url, api):
    open_list(page, base_url)
    f = api.departures[0]
    page.evaluate("(f) => localStorage.setItem('starredFlights_v1', JSON.stringify([{ id: {flightNo:'',dep:'',arr:'',schedDep:'',schedArr:''}, context: {mode:'departure'}, flight: f }]))", f)
    page.reload()
    wait_list(page)
    assert saved(page)[0]["id"]["flightNo"] == "U2 7075"
    assert page.locator("#departureList .save-btn.saved").count() == 1, "just that flight, not every flight"


def test_share_from_my_flights_uses_the_details_url(page, base_url):
    open_list(page, base_url)
    star(page, "departureList", "U2 7075")
    page.evaluate("window.__s = null; navigator.share = (d) => { window.__s = d; return Promise.resolve(); }")
    page.locator("#myFlightsList .share-btn").first.click()
    d = page.evaluate("window.__s")
    assert "flight-details.html?type=departure&flight=U2%207075" in d["url"] and "departs Bristol" in d["text"]
