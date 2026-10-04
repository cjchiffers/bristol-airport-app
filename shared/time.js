/* shared/time.js — Bristol Airport Flights App
   The only place that turns API time strings into Dates, and formats them (Europe/London).
   Safari cannot parse "2026-10-02 15:25+01:00" (space instead of "T"), so we normalise first.
   Exposes: window.BrsTime
*/
"use strict";

(function(){
  const TZ = "Europe/London";

  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dayFmt  = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short" });
  const keyFmt  = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

  const HAS_OFFSET = /\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[zZ]|[+-]\d{2}:?\d{2})$/;

  function valid(d){ return d instanceof Date && Number.isFinite(d.getTime()) ? d : null; }

  /** Date | epoch (s or ms) | ISO string with or without offset | "YYYY-MM-DD HH:MM±HH:MM" -> Date or null. */
  function parse(value){
    if (value == null || value === "") return null;
    if (value instanceof Date) return valid(value);
    if (typeof value === "number") return valid(new Date(value < 2e10 ? value * 1000 : value));
    if (typeof value !== "string") return null;

    let s = value.trim();
    if (!s) return null;
    if (/^\d{10,13}$/.test(s)) return parse(Number(s));

    // "2026-10-02 15:25+01:00" -> "2026-10-02T15:25+01:00"
    s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+(?=\d)/, "$1T");
    // "+0100" -> "+01:00"
    s = s.replace(/(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})(\d{2})$/, "$1$2:$3");
    // No offset at all: treat as UTC so results don't depend on the viewer's timezone.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !HAS_OFFSET.test(s)) s += "Z";

    return valid(new Date(s));
  }

  function fmtTime(value){
    const d = parse(value);
    return d ? timeFmt.format(d) : "";
  }

  /** e.g. "Fri 02 Oct" */
  function fmtDay(value){
    const d = parse(value);
    if (!d) return "";
    const p = {};
    for (const x of dayFmt.formatToParts(d)) p[x.type] = x.value;
    return `${p.weekday} ${p.day} ${p.month === "Sept" ? "Sep" : p.month}`;   // newer ICU says "Sept"
  }

  /** London calendar date as "YYYY-MM-DD" */
  function londonDateKey(value){
    const d = parse(value);
    if (!d) return "";
    const p = {};
    for (const x of keyFmt.formatToParts(d)) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
  }

  /** Whole minutes from a to b (b - a), or null if either is unparseable. */
  function minutesBetween(a, b){
    const d1 = parse(a), d2 = parse(b);
    if (!d1 || !d2) return null;
    return Math.round((d2.getTime() - d1.getTime()) / 60000);
  }

  window.BrsTime = { TZ, parse, fmtTime, fmtDay, londonDateKey, minutesBetween };
})();
