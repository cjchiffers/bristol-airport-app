/* shared/install.js — Bristol Airport Flights App
   "Install app" support.
   - Chrome/Edge/Android: captures the browser's install prompt and replays it when the user asks.
   - iPhone/iPad Safari has no prompt API, so we show the manual "Add to Home Screen" steps.
   Exposes: window.BrsInstall
*/
"use strict";

(function(){
  let deferred = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });

  function isStandalone(){
    return !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true);
  }

  /** iPhone / iPad (incl. iPadOS posing as a Mac) in Safari — the only iOS browser that can add to the Home Screen. */
  function isIosSafari(){
    const ua = navigator.userAgent || "";
    const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua);
    return iOS && safari;
  }

  function canPrompt(){ return !!deferred; }
  /** Should the UI offer an install option at all? */
  function available(){ return !isStandalone() && (canPrompt() || isIosSafari()); }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();       // we show our own menu item instead of the browser's mini-infobar
    deferred = e;
    notify();
  });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });

  /** Ask to install. Resolves "accepted" | "dismissed" | "ios" (instructions shown) | "unavailable". */
  async function install(){
    if (deferred) {
      const ev = deferred;
      deferred = null;                       // a prompt can only be used once
      try {
        await ev.prompt();
        const choice = await ev.userChoice;
        notify();
        return choice && choice.outcome === "accepted" ? "accepted" : "dismissed";
      } catch { notify(); return "dismissed"; }
    }
    if (isIosSafari() && !isStandalone()) {
      const dlg = document.getElementById("iosInstall");
      if (dlg && typeof dlg.showModal === "function") { dlg.showModal(); return "ios"; }
      if (dlg) { dlg.setAttribute("open", ""); return "ios"; }
    }
    return "unavailable";
  }

  function onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); }

  window.BrsInstall = { isStandalone, isIosSafari, canPrompt, available, install, onChange };
})();
