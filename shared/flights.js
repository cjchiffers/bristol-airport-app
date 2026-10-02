/* shared/flights.js — Bristol Airport Flights App
   Flight helpers shared by the list page and the details page:
   which side of a flight matters at BRS, live times, delay, status text,
   de-duplication, shareable details URLs, and a small per-flight cache.
   Needs: BrsTime. Exposes: window.BrsFlights
*/
"use strict";

(function(){
  const T = window.BrsTime;

  // ---------- Mode helpers ----------
  // "mode" is the BRS-side direction: departures show the departure segment, arrivals the arrival segment.
  function isDep(mode){ return /^dep/i.test(String(mode || "")); }
  function normMode(mode){ return isDep(mode) ? "departure" : "arrival"; }

  function flightNo(f){
    return String(f?.flight?.iataNumber || f?.flight_iata || f?.flightNumber || f?.flight?.number || "").trim();
  }
  function normFlightNo(s){
    return String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
  }
  function sameFlightNo(a, b){
    const x = String(a || "").toUpperCase().replace(/\s+/g, "");
    const y = String(b || "").toUpperCase().replace(/\s+/g, "");
    return !!x && x === y;
  }

  /** The segment that happens at Bristol. */
  function seg(f, mode){
    return (isDep(mode) ? f?.departure : f?.arrival) || {};
  }
  /** The segment at the other end (origin for arrivals, destination for departures). */
  function otherSeg(f, mode){
    return (isDep(mode) ? f?.arrival : f?.departure) || {};
  }

  function scheduledTime(f, mode){ return T.parse(seg(f, mode).scheduledTime); }

  /** Best-known time at Bristol: actual, else estimated, else scheduled. */
  function keyTime(f, mode){
    const s = seg(f, mode);
    return T.parse(s.actualTime || s.estimatedTime || s.scheduledTime);
  }

  /** Minutes late (+) / early (−) at Bristol, or null when unknown. */
  function delayMin(f, mode){
    const s = seg(f, mode);
    const raw = s.delay;
    if (raw !== "" && raw != null && Number.isFinite(Number(raw))) return Math.round(Number(raw));
    return T.minutesBetween(s.scheduledTime, s.actualTime || s.estimatedTime);
  }

  // ---------- Status ----------
  /** -> { key, text, tone: "good"|"warn"|"bad"|"neutral" } for the BRS side of the flight. */
  function statusInfo(f, mode){
    const dep = isDep(mode);
    const s = seg(f, mode);
    const st = String(f?.status || f?.flight_status || "").toLowerCase();
    const d = delayMin(f, mode);
    const liveTime = T.fmtTime(s.actualTime || s.estimatedTime);
    const exp = liveTime ? ` · Exp ${liveTime}` : "";

    if (st.includes("cancel")) return { key: "cancelled", text: "Cancelled", tone: "bad" };
    if (st === "diverted")     return { key: "diverted", text: "Diverted", tone: "bad" };

    if (!dep && st === "landed") {
      const t = T.fmtTime(s.actualTime || s.estimatedTime || s.scheduledTime);
      return { key: "landed", text: t ? `Landed ${t}` : "Landed", tone: "good" };
    }
    // "active" is what the older worker called departed / en route
    if (dep && (st === "departed" || st === "enroute" || st === "active" || st === "landed")) {
      return { key: "departed", text: "Departed", tone: "neutral" };
    }
    if (st === "boarding")   return { key: "boarding", text: "Boarding", tone: "good" };
    if (st === "gateclosed") return { key: "gateclosed", text: "Gate closed", tone: "warn" };
    if (dep && st === "checkin") return { key: "checkin", text: "Check-in open", tone: "neutral" };

    if ((d != null && d >= 15) || st === "delayed") {
      return { key: "delayed", text: `Delayed${exp}`, tone: "warn" };
    }
    if (!dep && d != null && d <= -5) {
      return { key: "early", text: `Early${exp}`, tone: "good" };
    }
    if (!dep && (st === "approaching" || st === "enroute" || st === "active")) {
      const t = liveTime || T.fmtTime(s.scheduledTime);
      return { key: "expected", text: t ? `Expected ${t}` : "En route", tone: "neutral" };
    }
    return { key: "ontime", text: "On time", tone: "good" };
  }

  // ---------- De-duplication ----------
  // The same flight can appear twice, and airlines such as easyJet list one flight under two
  // numbers (U2 7003 / EC 7003). Keep one entry; the other numbers go in `codeshares`.
  const PREFERRED_AIRLINES = new Set(["U2"]);

  function numberPart(n){
    const s = String(n || "").trim().toUpperCase();
    const m = s.match(/^[A-Z0-9]{2,3}\s+(\d+)/) || s.match(/^[A-Z0-9]{2}(\d+)/);
    return m ? m[1] : "";
  }

  function dedupe(list, mode){
    const own = (f) => seg(f, mode);
    const oth = (f) => otherSeg(f, mode);

    const exact = new Map();
    for (const f of (list || [])) {
      const key = `${flightNo(f)}|${own(f).scheduledTime || ""}`;
      if (!exact.has(key)) exact.set(key, f);
    }

    const groups = new Map();
    for (const f of exact.values()) {
      const key = `${oth(f).iataCode || ""}|${own(f).scheduledTime || ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }

    const rank = (f) =>
      (f.codeshareStatus === "IsOperator" ? 100 : 0) +
      (PREFERRED_AIRLINES.has(f?.airline?.iataCode) ? 10 : 0) +
      (f?.aircraft?.regNumber ? 1 : 0);

    const same = (a, b) => {
      if (a.codeshareStatus === "IsCodeshared" || b.codeshareStatus === "IsCodeshared") return true;
      const ra = a?.aircraft?.regNumber, rb = b?.aircraft?.regNumber;
      if (ra && rb && ra === rb) return true;
      const na = numberPart(flightNo(a));
      return !!na && na === numberPart(flightNo(b));
    };

    const out = [];
    for (const members of groups.values()) {
      const clusters = [];
      for (const f of members) {
        const c = clusters.find((cl) => same(cl[0], f));
        if (c) c.push(f); else clusters.push([f]);
      }
      for (const cl of clusters) {
        cl.sort((a, b) => rank(b) - rank(a));
        const keep = cl[0];
        const names = new Set(Array.isArray(keep.codeshares) ? keep.codeshares : []);
        for (const x of cl.slice(1)) {
          names.add(flightNo(x));
          for (const n of (Array.isArray(x.codeshares) ? x.codeshares : [])) names.add(n);
        }
        names.delete(flightNo(keep));
        names.delete("");
        out.push(Object.assign({}, keep, { codeshares: Array.from(names) }));
      }
    }
    return out;
  }

  // ---------- Shareable details URL ----------
  /** London date of the BRS-side scheduled time, "YYYY-MM-DD". */
  function dateKey(f, mode){
    const d = scheduledTime(f, mode) || keyTime(f, mode) || new Date();
    return T.londonDateKey(d);
  }

  /** Identity used in the details URL and cache: { type, flight, date }. */
  function routeOf(f, mode){
    return { type: normMode(mode), flight: normFlightNo(flightNo(f)), date: dateKey(f, mode) };
  }

  function urlFor(route){
    const u = new URL("flight-details.html", window.location.href);
    u.search = "";
    u.hash = "";
    u.searchParams.set("type", route.type);
    u.searchParams.set("flight", route.flight);
    u.searchParams.set("date", route.date);
    return u.href.replace(/\+/g, "%20");
  }

  /** Absolute details URL for a flight, e.g. https://…/flight-details.html?type=arrival&flight=U2%202806&date=2026-10-02 */
  function detailsUrl(f, mode){
    return urlFor(routeOf(f, mode));
  }

  // ---------- Per-flight cache (localStorage, so reloads / new tabs / offline still work) ----------
  const CACHE_PREFIX = "brs_fd:";
  const CACHE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

  function cacheKey(route){
    return `${CACHE_PREFIX}${route.type}:${normFlightNo(route.flight)}:${route.date}`;
  }

  function pruneCache(){
    try {
      const now = Date.now();
      const drop = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(CACHE_PREFIX)) continue;
        let ts = 0;
        try { ts = Number(JSON.parse(localStorage.getItem(k))?.ts) || 0; } catch { /* corrupt entry */ }
        if (now - ts > CACHE_MAX_AGE_MS) drop.push(k);
      }
      drop.forEach((k) => localStorage.removeItem(k));
    } catch { /* storage unavailable */ }
  }

  function saveCached(route, flight){
    try {
      localStorage.setItem(cacheKey(route), JSON.stringify({ ts: Date.now(), flight }));
      pruneCache();
    } catch { /* storage full or unavailable */ }
  }

  /** -> { ts, flight } | null */
  function loadCached(route){
    try {
      const raw = localStorage.getItem(cacheKey(route));
      if (!raw) return null;
      const x = JSON.parse(raw);
      return x && x.flight ? { ts: Number(x.ts) || 0, flight: x.flight } : null;
    } catch { return null; }
  }

  /** Remember the flight so the details page can paint instantly, then return its URL. */
  function prepareDetails(f, mode){
    const route = routeOf(f, mode);
    saveCached(route, f);
    return urlFor(route);
  }

  // ---------- Sharing ----------
  function cityOf(iata){
    const A = window.BrsAirports;
    return (A && A.getAirportDisplayName) ? A.getAirportDisplayName(iata, "city") : String(iata || "");
  }

  /** Status-aware one-liner, e.g. "U2 2806 from Kos — expected at Bristol 15:25 (scheduled 15:10)". */
  function shareText(f, mode){
    const dep = isDep(mode);
    const no = flightNo(f) || "Flight";
    const place = cityOf(otherSeg(f, mode).iataCode);
    const s = seg(f, mode);
    const sched = T.fmtTime(s.scheduledTime);
    const live = T.fmtTime(s.actualTime || s.estimatedTime);
    const info = statusInfo(f, mode);
    const head = place && place !== "—" ? `${no} ${dep ? "to" : "from"} ${place}` : no;
    const changed = live && sched && live !== sched;

    if (info.key === "cancelled" || info.key === "diverted") return `${head} — ${info.text.toLowerCase()}`;
    if (!dep && info.key === "landed") return `${head} — ${info.text.charAt(0).toLowerCase()}${info.text.slice(1)}`;
    if (dep && info.key === "departed") return `${head} — departed Bristol${live ? ` ${live}` : ""}`;

    const when = live || sched;
    if (!when) return head;
    const base = dep ? `departs Bristol ${when}` : `expected at Bristol ${when}`;
    return `${head} — ${base}${changed ? ` (scheduled ${sched})` : ""}`;
  }

  async function copyText(text){
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through to the textarea fallback */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch { return false; }
  }

  /** Native share sheet where available, otherwise copy the link. -> "shared" | "copied" | "cancelled" | "failed" */
  async function shareLink({ title, text, url }){
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return "shared";
      } catch (e) {
        if (e && e.name === "AbortError") return "cancelled";
        // any other failure: fall back to copying the link
      }
    }
    return (await copyText(url)) ? "copied" : "failed";
  }

  /**
   * Share a flight: builds title/text/url and shows feedback via toast(msg).
   * `url` overrides the generated link (the details page passes the URL it is showing).
   * Note: no awaiting before navigator.share — iOS Safari requires it to run inside the tap.
   */
  async function shareFlight(f, mode, toast, url){
    const type = normMode(mode);
    const payload = {
      title: `${flightNo(f) || "Flight"} · Bristol Airport`,
      text: shareText(f, type),
      url: url || detailsUrl(f, type),
    };
    const r = await shareLink(payload);
    if (toast) {
      if (r === "copied") toast("Link copied");
      else if (r === "failed") toast("Couldn’t share — copy the page address instead");
    }
    return r;
  }

  window.BrsFlights = {
    isDep, normMode, flightNo, normFlightNo, sameFlightNo,
    seg, otherSeg, scheduledTime, keyTime, delayMin, statusInfo,
    dedupe, dateKey, routeOf, urlFor, detailsUrl,
    cacheKey, saveCached, loadCached, prepareDetails,
    shareText, shareLink, shareFlight,
  };
})();
