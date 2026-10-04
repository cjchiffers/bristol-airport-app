import urllib.parse
from datetime import datetime, timedelta, timezone

import pytest

from conftest import wait_details, wait_list

# A stand-in for the browser's push machinery (Chromium can't talk to FCM from a test).
PUSH_STUB = """
(() => {
  const st = window.__push = { permissionRequests: 0, subscribeCalls: [], sub: null, result: 'granted' };
  const REMEMBER = '__fakePushSub';   // a real browser keeps its subscription across page loads
  window.PushManager = window.PushManager || function PushManager() {};
  const fake = { endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint',
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPfakeKeyfakeKeyfakeKeyfakeKeyfakeKeyfakeKeyfakeKeyfakeKeyfakeKeyfakeKeyfakeKeyfakeKe', auth: 'fakeAuthSecret16bY' } }; } };
  if (sessionStorage.getItem(REMEMBER)) st.sub = fake;
  const pm = {
    async getSubscription() { return st.sub; },
    async subscribe(opts) { st.subscribeCalls.push(Array.from(new Uint8Array(opts.applicationServerKey))); st.sub = fake; sessionStorage.setItem(REMEMBER, '1'); return fake; },
  };
  Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', { configurable: true, get() { return pm; } });
  const N = function Notification() {};
  N.permission = 'default';
  N.requestPermission = async () => { st.permissionRequests++; N.permission = st.result; return st.result; };
  window.Notification = N;
})();
"""

IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"


def url_for(base_url, f, side):
    return f"{base_url}/flight-details.html?type={side}&flight={urllib.parse.quote(f['flight']['iataNumber'])}&date={f[side]['scheduledTime'][:10]}"


def open_flight(pg, base_url, api, number, side):
    pg.goto(url_for(base_url, api.find(number, side)[0], side))
    wait_details(pg)


@pytest.fixture
def enabled(api):
    api.features = {"tiles": True, "history": True, "push": True}
    return api


@pytest.fixture
def ctx(new_context, enabled):
    c = new_context(sw=True)         # push needs a service worker registration
    c.add_init_script(PUSH_STUB)
    return c


def bell_visible(pg):
    """Whether the bell is shown once the page has finished deciding. (Waits for the worker feature probe, then
    gives the page a moment to react; positive cases return as soon as the bell appears.)"""
    pg.evaluate("window.BrsConfig.featuresReady")
    try:
        pg.wait_for_selector("#notifyIconBtn", state="visible", timeout=1500)
        return True
    except Exception:
        return False


def test_bell_only_appears_when_the_worker_supports_notifications(new_context, base_url, api):
    for features, expected in (({"tiles": True}, False), ({"tiles": True, "push": False}, False), ({"tiles": True, "push": True}, True)):
        api.features = features
        ctx = new_context(sw=True)
        ctx.add_init_script(PUSH_STUB)
        pg = ctx.new_page()
        open_flight(pg, base_url, api, "U2 2806", "arrival")
        assert bell_visible(pg) is expected, features


def test_bell_hidden_when_the_browser_cannot_do_push(new_context, base_url, enabled):
    ctx = new_context(sw=True)     # no PUSH_STUB: headless Chromium here has no usable push, and Notification is replaced below
    ctx.add_init_script("delete window.PushManager; delete window.Notification;")
    pg = ctx.new_page()
    open_flight(pg, base_url, enabled, "U2 2806", "arrival")
    assert not bell_visible(pg)


def test_following_a_flight_asks_permission_subscribes_and_tells_the_worker(ctx, base_url, enabled):
    pg = ctx.new_page()
    open_flight(pg, base_url, enabled, "U2 2806", "arrival")
    assert bell_visible(pg) and pg.get_attribute("#notifyIconBtn", "aria-pressed") == "false"
    pg.click("#notifyIconBtn")
    pg.wait_for_function("document.getElementById('notifyIconBtn').getAttribute('aria-pressed') === 'true'")
    assert pg.evaluate("window.__push.permissionRequests") == 1
    sent_key = pg.evaluate("window.__push.subscribeCalls[0]")
    import base64
    assert bytes(sent_key) == base64.urlsafe_b64decode(enabled.push["publicKey"] + "=="), "subscribed with the worker's VAPID public key"
    path, body = enabled.push["posts"][-1]
    assert path == "/api/push/subscribe"
    assert body["subscription"]["endpoint"].startswith("https://fcm.googleapis.com/")
    f = enabled.find("U2 2806", "arrival")[0]
    assert body["flight"] == {"type": "arrival", "number": "U2 2806", "date": f["arrival"]["scheduledTime"][:10], "place": "Kos"}
    assert pg.inner_text("#toast") == "We’ll notify you about U2 2806"
    assert "Notifications are on" in pg.get_attribute("#notifyIconBtn", "title")


def test_following_is_remembered_across_reload_and_can_be_turned_off(ctx, base_url, enabled):
    pg = ctx.new_page()
    open_flight(pg, base_url, enabled, "U2 2806", "arrival")
    pg.click("#notifyIconBtn")
    pg.wait_for_function("document.getElementById('notifyIconBtn').getAttribute('aria-pressed') === 'true'")
    pg.reload()
    wait_details(pg)
    pg.wait_for_function("document.getElementById('notifyIconBtn').getAttribute('aria-pressed') === 'true'")
    pg.click("#notifyIconBtn")
    pg.wait_for_function("document.getElementById('notifyIconBtn').getAttribute('aria-pressed') === 'false'")
    assert enabled.push["posts"][-1][0] == "/api/push/unsubscribe"
    assert pg.inner_text("#toast") == "Notifications off for U2 2806"
    pg.reload()
    wait_details(pg)
    pg.wait_for_timeout(500)
    assert pg.get_attribute("#notifyIconBtn", "aria-pressed") == "false"


def test_each_flight_is_followed_separately(ctx, base_url, enabled):
    pg = ctx.new_page()
    open_flight(pg, base_url, enabled, "U2 2806", "arrival")
    pg.click("#notifyIconBtn")
    pg.wait_for_function("document.getElementById('notifyIconBtn').getAttribute('aria-pressed') === 'true'")
    open_flight(pg, base_url, enabled, "FR 750", "arrival")
    assert bell_visible(pg) and pg.get_attribute("#notifyIconBtn", "aria-pressed") == "false"


def test_blocked_permission_is_explained_and_nothing_is_sent(ctx, base_url, enabled):
    pg = ctx.new_page()
    open_flight(pg, base_url, enabled, "U2 2806", "arrival")
    pg.evaluate("window.__push.result = 'denied'")
    pg.click("#notifyIconBtn")
    pg.wait_for_function("document.getElementById('toast').textContent.includes('blocked')")
    assert pg.get_attribute("#notifyIconBtn", "aria-pressed") == "false" and enabled.push["posts"] == []
    assert "blocked" in pg.get_attribute("#notifyIconBtn", "title")


def test_server_limit_and_failures_are_reported_kindly(ctx, base_url, enabled):
    pg = ctx.new_page()
    open_flight(pg, base_url, enabled, "U2 2806", "arrival")
    enabled.push["status"] = 429
    pg.click("#notifyIconBtn")
    pg.wait_for_function("document.getElementById('toast').textContent === 'You can follow up to 10 flights'")
    assert pg.get_attribute("#notifyIconBtn", "aria-pressed") == "false"
    enabled.push["status"] = 500
    pg.click("#notifyIconBtn")
    pg.wait_for_function("document.getElementById('toast').textContent.startsWith('Couldn’t turn on notifications')")
    assert pg.get_attribute("#notifyIconBtn", "aria-pressed") == "false", "a failed attempt must not look as if it worked"


def test_no_bell_for_flights_with_nothing_left_to_announce(ctx, base_url, enabled):
    pg = ctx.new_page()
    for number, side in (("BA 123", "arrival"), ("FR 999", "arrival"), ("FR 8296", "departure")):   # landed, cancelled, already departed
        open_flight(pg, base_url, enabled, number, side)
        assert not bell_visible(pg), number


def test_arrival_still_en_route_can_be_followed(ctx, base_url, enabled):
    pg = ctx.new_page()
    enabled.find("FR 750", "arrival")[0]["status"] = "departed"          # left the origin: on its way to Bristol
    open_flight(pg, base_url, enabled, "FR 750", "arrival")
    assert bell_visible(pg)


def test_iphone_in_safari_is_guided_to_add_to_home_screen_instead(new_context, base_url, enabled):
    ctx = new_context(sw=True, user_agent=IPHONE_UA, is_mobile=True, has_touch=True)
    ctx.add_init_script("delete window.PushManager; delete window.Notification; window.__perm = 0;")
    pg = ctx.new_page()
    open_flight(pg, base_url, enabled, "U2 2806", "arrival")
    assert bell_visible(pg), "visible so iPhone users learn how to enable it"
    pg.click("#notifyIconBtn")
    pg.wait_for_selector("#iosInstall[open]")
    assert "Add to Home Screen first" in pg.inner_text("#iosInstall") and enabled.push["posts"] == []
