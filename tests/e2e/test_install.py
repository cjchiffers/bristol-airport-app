from conftest import wait_list

IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
IPHONE_CHROME_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1"


def open_menu(pg):
    pg.click("#overflowBtn")


def test_install_option_hidden_when_nothing_to_install(page, base_url):
    page.goto(base_url + "/index.html")
    wait_list(page)
    open_menu(page)
    assert not page.is_visible("#installBtn")


def test_install_option_triggers_the_browser_prompt(page, base_url):
    page.goto(base_url + "/index.html")
    wait_list(page)
    page.evaluate("""() => {
        window.__prompted = 0;
        const e = new Event('beforeinstallprompt', { cancelable: true });
        e.prompt = async () => { window.__prompted++; };
        e.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(e);
        window.__defaultPrevented = e.defaultPrevented;
    }""")
    assert page.evaluate("window.__defaultPrevented") is True, "browser's own mini-infobar is suppressed"
    open_menu(page)
    assert page.is_visible("#installBtn")
    page.click("#installBtn")
    page.wait_for_function("window.__prompted === 1")
    page.wait_for_function("document.getElementById('toast').textContent === 'Installing…'")
    page.evaluate("window.dispatchEvent(new Event('appinstalled'))")
    open_menu(page)
    assert not page.is_visible("#installBtn"), "no install option once installed"


def test_iphone_safari_gets_add_to_home_screen_steps(new_context, base_url):
    ctx = new_context(user_agent=IPHONE_UA, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(base_url + "/index.html")
    wait_list(pg)
    open_menu(pg)
    assert pg.is_visible("#installBtn")
    pg.click("#installBtn")
    pg.wait_for_selector("#iosInstall[open]")
    assert "Add to Home Screen" in pg.inner_text("#iosInstall")
    pg.click("#iosInstall button")
    assert pg.locator("#iosInstall[open]").count() == 0


def test_other_ios_browsers_get_no_misleading_option(new_context, base_url):
    """Chrome/Firefox on iOS cannot add to the Home Screen, so don't offer it."""
    ctx = new_context(user_agent=IPHONE_CHROME_UA, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(base_url + "/index.html")
    wait_list(pg)
    open_menu(pg)
    assert not pg.is_visible("#installBtn")
