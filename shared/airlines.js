/* shared/airlines.js — Bristol Airport Flights App
   Airline code + logo helpers.
   Exposes: window.BrsAirlines
*/
"use strict";

(function(){
  function likelyAirlineCode(airlineIata, flightNo){
    const raw = String(airlineIata || "").trim().toUpperCase();
    if(raw && /^[A-Z0-9]{2,3}$/.test(raw)) return raw;

    const f = String(flightNo || "").trim().toUpperCase();
    if(f.length >= 2){
      const first2 = f.slice(0,2);
      if(/^[A-Z0-9]{2}$/.test(first2)) return first2;
    }
    const m = f.match(/^[A-Z]{2,3}/);
    return m ? m[0].slice(0,3) : "";
  }

  function airlineInitialsFrom(code, flightNo){
    const c = String(code || "").trim().toUpperCase();
    if(c && /^[A-Z0-9]{2,3}$/.test(c)) return c.slice(0,3);

    const f = String(flightNo || "").trim().toUpperCase();
    if(f.length >= 2){
      const first2 = f.slice(0,2);
      if(/^[A-Z0-9]{2}$/.test(first2)) return first2;
    }
    return "—";
  }

  function getLogoUrls(code){
    const c = String(code || "").trim().toUpperCase();
    if(!c) return [];
    return [
      // Kiwi CDN (often most complete)
      `https://images.kiwi.com/airlines/64/${encodeURIComponent(c)}.png`,
      `https://images.kiwi.com/airlines/32/${encodeURIComponent(c)}.png`,
      // Google Flights CDN (works for many)
      `https://www.gstatic.com/flights/airline_logos/70px/${encodeURIComponent(c)}.png`,
      // Airhex fallback
      `https://content.airhex.com/content/logos/airlines_${encodeURIComponent(c)}_200_200_s.png`,
    ];
  }

  function getAirlineLogoUrl(code){
    // Keep existing list behavior: single URL (fast)
    const urls = getLogoUrls(code);
    return urls[2] || urls[0] || null; // prefer gstatic if present
  }

  function setImgWithFallback(imgEl, urls, onSuccess){
    if(!imgEl || !urls || !urls.length) return;

    let idx = 0;

    const show = () => {
      if(typeof onSuccess === "function") onSuccess();
    };

    const tryNext = () => {
      idx += 1;
      if(idx >= urls.length) return;
      attachAndSet(urls[idx]);
    };

    const attachAndSet = (src) => {
      imgEl.onload = () => show();
      imgEl.onerror = () => tryNext();

      if(imgEl.src !== src) imgEl.src = src;

      // If cached and already complete, show immediately.
      if(imgEl.complete && imgEl.naturalWidth > 0) show();
    };

    attachAndSet(urls[idx]);
  }

  window.BrsAirlines = {
    likelyAirlineCode,
    airlineInitialsFrom,
    getLogoUrls,
    getAirlineLogoUrl,
    setImgWithFallback,
  };
})();
