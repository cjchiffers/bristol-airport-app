import re
import urllib.parse

from conftest import wait_list, wait_details


def test_every_external_link_goes_to_the_airports_own_site_and_is_safe(page, base_url):
    page.goto(base_url + "/getting-here.html")
    links = page.locator("a[href^='http']").all()
    assert len(links) >= 12
    for a in links:
        href = a.get_attribute("href")
        assert urllib.parse.urlparse(href).hostname == "www.bristolairport.co.uk", href
        assert a.get_attribute("target") == "_blank" and "noopener" in a.get_attribute("rel"), href
    assert page.is_visible("#pickup") and page.is_visible("#fly") and page.is_visible("#transport")
    assert "not run by Bristol Airport" in page.inner_text("body"), "must not look official"


def test_menu_links_to_the_page_and_no_horizontal_scroll(page, base_url):
    page.goto(base_url + "/index.html")
    wait_list(page)
    page.click("#overflowBtn")
    page.click("#hereLink")
    page.wait_for_url("**/getting-here.html")
    assert not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")


def test_flight_page_points_pickups_and_travellers_to_the_right_section(page, base_url, api):
    for number, side, anchor in (("U2 2806", "arrival", "#pickup"), ("U2 7075", "departure", "#fly")):
        f = api.find(number, side)[0]
        page.goto(f"{base_url}/flight-details.html?type={side}&flight={urllib.parse.quote(number)}&date={f[side]['scheduledTime'][:10]}")
        wait_details(page)
        assert page.get_attribute("#heroInfoLink", "href") == "getting-here.html" + anchor
