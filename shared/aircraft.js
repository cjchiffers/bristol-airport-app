/* shared/aircraft.js — Bristol Airport Flights App
   A side-view illustration of the aircraft (inline SVG, nose pointing right):
   - proportions, engines and winglets follow the aircraft MODEL (A320 family, 737 NG/MAX, ATR 72, E-jets, 787 …),
   - the tail is painted in the AIRLINE's colours and carries the airline's logo.
   It is an illustration, not a photo of the actual aircraft.
   Exposes: window.BrsAircraft
*/
"use strict";

(function(){
  // ------------------------------------------------------------------------------------------------ classification
  /** Coarse type used for labels and fallbacks: narrowbody | regional | turboprop | widebody | widebody4. */
  function kindFor(modelText){
    const m = String(modelText || "").toLowerCase();
    if (!m.trim()) return "narrowbody";

    if (/\b(atr|dash ?8|dhc|q ?400|saab|fokker ?50|f50|jetstream|beech|cessna|pilatus|twin otter)\b/.test(m)) return "turboprop";
    if (/(embraer|erj|\be[-\s]?(1[79]\d|2\d\d)\b|crj|canadair|avro|\brj\d{2,3}\b|bae ?146|dornier|\bsaab 2000)/.test(m)) return "regional";
    if (/(\b747|\b767|\b777|\b787|dreamliner|\ba3(00|10|30|40|50|80)|\bdc-?10|\bmd-?11|\bl-?1011)/.test(m)) {
      return /(\b747|\ba340|\ba380)/.test(m) ? "widebody4" : "widebody";
    }
    return "narrowbody";
  }

  const LABELS = {
    narrowbody: "narrow-body jet",
    widebody: "wide-body jet",
    widebody4: "four-engine wide-body jet",
    regional: "regional jet",
    turboprop: "turboprop",
  };

  // ------------------------------------------------------------------------------------------------ model specs
  // Geometry in a 400 x 140 box, nose to the right. L = fuselage length, fine = length/diameter (real ratio),
  // wing.le = where the wing root's leading edge sits (fraction of L back from the nose), engines.t = how far along the
  // wing leading edge the engine hangs (0 root … 1 tip). Variants below scale length / swap engines and winglets.
  const SPECS = {
    a320: { L: 344, fine: 9.0, nose: 58, drop: .22, tail: 92, up: .50,
            fin: { h: 44, base: 86, sweep: 50, tip: 28 }, wing: { le: .405, root: 56, sweep: 78, drop: 33, tip: 15, winglet: "fence" },
            engines: [{ t: .30, w: 40, h: 19, style: "turbofan" }], win: 8.2 },
    b737: { L: 336, fine: 10.0, nose: 56, drop: .20, tail: 90, up: .50,
            fin: { h: 44, base: 82, sweep: 48, tip: 27 }, wing: { le: .41, root: 54, sweep: 76, drop: 31, tip: 14, winglet: "blended" },
            engines: [{ t: .29, w: 38, h: 18, style: "b737" }], win: 8.0 },
    a220: { L: 300, fine: 10.2, nose: 54, drop: .22, tail: 82, up: .50,
            fin: { h: 42, base: 74, sweep: 42, tip: 26 }, wing: { le: .43, root: 48, sweep: 62, drop: 28, tip: 13, winglet: "blended" },
            engines: [{ t: .30, w: 38, h: 23, style: "gtf" }], win: 7.6 },
    b757: { L: 362, fine: 12.2, nose: 60, drop: .20, tail: 100, up: .50,
            fin: { h: 44, base: 90, sweep: 50, tip: 28 }, wing: { le: .40, root: 56, sweep: 70, drop: 30, tip: 14, winglet: "blended" },
            engines: [{ t: .30, w: 42, h: 20, style: "turbofan" }], win: 8.6 },
    b767: { L: 350, fine: 9.2, nose: 58, drop: .26, tail: 96, up: .52,
            fin: { h: 46, base: 88, sweep: 52, tip: 28 }, wing: { le: .40, root: 62, sweep: 80, drop: 32, tip: 15, winglet: "none" },
            engines: [{ t: .30, w: 46, h: 24, style: "big" }], win: 8.4 },
    b787: { L: 366, fine: 10.8, nose: 56, drop: .34, tail: 100, up: .55,
            fin: { h: 46, base: 92, sweep: 50, tip: 30 }, wing: { le: .40, root: 60, sweep: 92, drop: 34, tip: 12, winglet: "raked" },
            engines: [{ t: .30, w: 52, h: 25, style: "big" }], win: 9.2 },
    b777: { L: 376, fine: 11.8, nose: 60, drop: .30, tail: 104, up: .52,
            fin: { h: 50, base: 98, sweep: 54, tip: 32 }, wing: { le: .42, root: 66, sweep: 96, drop: 36, tip: 14, winglet: "raked" },
            engines: [{ t: .31, w: 62, h: 30, style: "big" }], win: 9.2 },
    a330: { L: 356, fine: 10.2, nose: 58, drop: .26, tail: 98, up: .52,
            fin: { h: 48, base: 90, sweep: 52, tip: 28 }, wing: { le: .41, root: 62, sweep: 84, drop: 34, tip: 15, winglet: "sharklet" },
            engines: [{ t: .31, w: 50, h: 24, style: "big" }], win: 8.6 },
    a350: { L: 368, fine: 11.2, nose: 58, drop: .32, tail: 100, up: .55,
            fin: { h: 48, base: 92, sweep: 52, tip: 30 }, wing: { le: .40, root: 62, sweep: 90, drop: 34, tip: 12, winglet: "raked" },
            engines: [{ t: .31, w: 54, h: 26, style: "big" }], win: 9.0, mask: true },
    b747: { L: 384, fine: 10.8, nose: 62, drop: .28, tail: 108, up: .52, hump: true,
            fin: { h: 52, base: 100, sweep: 56, tip: 32 }, wing: { le: .43, root: 70, sweep: 100, drop: 38, tip: 14, winglet: "fence" },
            engines: [{ t: .24, w: 48, h: 24, style: "big" }, { t: .58, w: 44, h: 22, style: "big" }], win: 9.4 },
    a380: { L: 384, fine: 8.8, nose: 62, drop: .30, tail: 104, up: .52, double: true,
            fin: { h: 52, base: 100, sweep: 56, tip: 34 }, wing: { le: .44, root: 76, sweep: 96, drop: 38, tip: 16, winglet: "fence" },
            engines: [{ t: .24, w: 50, h: 26, style: "big" }, { t: .56, w: 46, h: 24, style: "big" }], win: 8.4 },
    a340: { L: 376, fine: 11.0, nose: 60, drop: .26, tail: 104, up: .52,
            fin: { h: 48, base: 94, sweep: 52, tip: 30 }, wing: { le: .42, root: 66, sweep: 96, drop: 36, tip: 14, winglet: "fence" },
            engines: [{ t: .26, w: 46, h: 23, style: "big" }, { t: .56, w: 44, h: 22, style: "big" }], win: 9.0 },
    ejet: { L: 322, fine: 10.4, nose: 52, drop: .22, tail: 88, up: .50,
            fin: { h: 40, base: 76, sweep: 42, tip: 24 }, wing: { le: .42, root: 46, sweep: 62, drop: 26, tip: 12, winglet: "blended" },
            engines: [{ t: .28, w: 34, h: 17, style: "turbofan" }], win: 7.8 },
    e2:   { L: 322, fine: 10.4, nose: 52, drop: .22, tail: 88, up: .50,
            fin: { h: 40, base: 76, sweep: 42, tip: 24 }, wing: { le: .42, root: 46, sweep: 62, drop: 26, tip: 12, winglet: "raked" },
            engines: [{ t: .28, w: 34, h: 21, style: "gtf" }], win: 7.8 },
    erj:  { L: 296, fine: 12.4, nose: 48, drop: .18, tail: 86, up: .50, rear: true,
            fin: { h: 38, base: 66, sweep: 36, tip: 22 }, wing: { le: .45, root: 40, sweep: 46, drop: 22, tip: 11, winglet: "none" },
            engines: [{ rear: true, w: 32, h: 14, style: "turbofan" }], win: 7.4 },
    crj:  { L: 330, fine: 13.2, nose: 52, drop: .18, tail: 96, up: .52, rear: true, ttail: true,
            fin: { h: 42, base: 70, sweep: 38, tip: 24 }, wing: { le: .45, root: 40, sweep: 48, drop: 22, tip: 11, winglet: "blended" },
            engines: [{ rear: true, w: 34, h: 15, style: "turbofan" }], win: 7.0 },
    atr:  { L: 292, fine: 9.4, nose: 40, drop: .10, tail: 78, up: .50, ttail: true, high: true, props: 4,
            fin: { h: 52, base: 66, sweep: 34, tip: 20 }, wing: { le: .40, root: 46, sweep: 12, drop: -10, tip: 22, winglet: "none" },
            engines: [{ t: .0, w: 66, h: 17, style: "prop" }], win: 6.4 },
    q400: { L: 304, fine: 11.4, nose: 44, drop: .10, tail: 84, up: .52, ttail: true, high: true, props: 6,
            fin: { h: 50, base: 70, sweep: 36, tip: 20 }, wing: { le: .42, root: 44, sweep: 12, drop: -10, tip: 20, winglet: "none" },
            engines: [{ t: .0, w: 72, h: 18, style: "prop" }], win: 6.8 },
    turbo:{ L: 250, fine: 9.6, nose: 36, drop: .10, tail: 66, up: .50, ttail: true, high: true, props: 3,
            fin: { h: 40, base: 56, sweep: 28, tip: 18 }, wing: { le: .42, root: 38, sweep: 8, drop: -9, tip: 18, winglet: "none" },
            engines: [{ t: .0, w: 54, h: 15, style: "prop" }], win: 6.2 },
  };

  /** Which spec for a model text, with the variant tweaks (length, engines, winglets). */
  function familyFor(modelText){
    const raw = String(modelText || "");
    const m = raw.toLowerCase();
    const kind = kindFor(raw);
    const out = (key, tweak = {}) => ({ key, kind, ...tweak });

    if (/\bq ?400|dash ?8|dhc-?8/.test(m)) return out("q400");
    if (/\batr\b/.test(m)) return out("atr");
    if (kind === "turboprop") return out("turbo");

    if (/\ba3(18|19|20|21)\b/.test(m) || /\ba32\d/.test(m)) {
      const neo = /neo/.test(m), sharklets = neo || /sharklet/.test(m);
      const scale = /a318/.test(m) ? .88 : /a319/.test(m) ? .94 : /a321/.test(m) ? 1.1 : 1;
      return out("a320", { scale, engines: neo ? [{ t: .30, w: 44, h: 22, style: "turbofan" }] : null, winglet: sharklets ? "sharklet" : "fence" });
    }
    if (/737/.test(m)) {
      const max = /max/.test(m);
      const scale = /-?(600|700)\b|737-?7\b/.test(m) ? .93 : /-?(900|9)\b|max ?(9|10)\b/.test(m) ? 1.07 : 1;
      return out("b737", { scale, engines: max ? [{ t: .29, w: 42, h: 20, style: "b737" }] : null, winglet: max ? "split" : "blended" });
    }
    if (/a220|cs[13]00|c ?series/.test(m)) return out("a220");
    if (/757/.test(m)) return out("b757");
    if (/767/.test(m)) return out("b767");
    if (/787|dreamliner/.test(m)) return out("b787", { scale: /-?8\b/.test(m) ? .92 : /-?10\b/.test(m) ? 1.04 : 1 });
    if (/777/.test(m)) return out("b777", { scale: /-?(200|2)\b/.test(m) ? .93 : 1 });
    if (/a35\d/.test(m)) return out("a350", { scale: /1000/.test(m) ? 1.04 : 1 });
    if (/a330|a300|a310/.test(m)) return out("a330", { scale: /a330-?2|200/.test(m) ? .95 : 1 });
    if (/747/.test(m)) return out("b747");
    if (/a380/.test(m)) return out("a380");
    if (/a340/.test(m)) return out("a340");

    if (kind === "regional") {
      if (/crj|canadair/.test(m)) return out("crj");
      if (/rj ?145|erj|embraer ?14\d|emb ?14/.test(m)) return out("erj");
      if (/e2\b|-e2|e[-\s]?(175|190|195)-?e2/.test(m)) return out("e2");
      const scale = /(190|e190)/.test(m) ? 1.04 : /(195|e195)/.test(m) ? 1.08 : /(170|e170)/.test(m) ? .94 : 1;
      return out("ejet", { scale });
    }
    // unknown narrow-body: the generic 737/A320 shape
    return out("a320", { scale: 1, engines: null, winglet: "blended", generic: true });
  }

  // ------------------------------------------------------------------------------------------------ airline liveries
  // Tail colour (and a second accent) in the airline's brand colours. Where an airline isn't listed the tail is a neutral
  // slate and the airline's own logo identifies it. Keyed by IATA code; names are matched as a fallback.
  const LIVERIES = {
    U2: { tail: "#FF6600", stripe: "#FF6600", engine: "#FF6600", name: /easyjet/i },
    EC: { tail: "#FF6600", stripe: "#FF6600", engine: "#FF6600" },
    FR: { tail: "#073590", stripe: "#F1C933", engine: "#073590", name: /ryanair/i },
    LS: { tail: "#E4002B", stripe: "#E4002B", engine: "#E4002B", name: /jet2/i },
    BY: { tail: "#FFFFFF", stripe: "#D40E14", name: /\btui\b/i, tailLine: true },
    BA: { tail: "#0A3D8F", stripe: "#EB2226", name: /british airways/i },
    KL: { tail: "#00A1DE", stripe: "#00A1DE", name: /\bklm\b/i },
    EI: { tail: "#00A859", stripe: "#00A859", name: /aer lingus/i },
    EN: { tail: "#00A859", stripe: "#00A859" },
    W6: { tail: "#C6007E", stripe: "#C6007E", name: /wizz/i },
    W9: { tail: "#C6007E", stripe: "#C6007E" },
    LH: { tail: "#05164D", stripe: "#05164D", name: /lufthansa/i },
    AF: { tail: "#002157", stripe: "#ED2939", name: /air france/i },
    VS: { tail: "#E10A0A", stripe: "#E10A0A", name: /virgin atlantic/i },
    EK: { tail: "#D71921", stripe: "#C8A862", name: /emirates/i },
    QR: { tail: "#5C0632", stripe: "#5C0632", name: /qatar/i },
    TK: { tail: "#C8102E", stripe: "#C8102E", name: /turkish/i },
    DY: { tail: "#D81939", stripe: "#D81939", name: /norwegian/i },
    VY: { tail: "#FFCC00", stripe: "#4A4A4A", name: /vueling/i },
    IB: { tail: "#D7192D", stripe: "#D7192D", name: /iberia/i },
    LX: { tail: "#E30613", stripe: "#E30613", name: /swiss/i },
    OS: { tail: "#E30613", stripe: "#E30613", name: /austrian/i },
    AC: { tail: "#F01428", stripe: "#F01428", name: /air canada/i },
    DL: { tail: "#003366", stripe: "#C8102E", name: /delta/i },
    UA: { tail: "#0033A0", stripe: "#0033A0", name: /united/i },
    AY: { tail: "#0B1560", stripe: "#0B1560", name: /finnair/i },
  };
  const NEUTRAL = { tail: "#5F7CA3", stripe: "#5F7CA3" };

  /** { tail, stripe, engine?, known } for an airline (IATA code and/or name). */
  function liveryFor(iata, name){
    const code = String(iata || "").trim().toUpperCase();
    if (LIVERIES[code]) return { ...LIVERIES[code], known: true };
    for (const v of Object.values(LIVERIES)) if (v.name && v.name.test(String(name || ""))) return { ...v, known: true };
    return { ...NEUTRAL, known: false };
  }

  // ------------------------------------------------------------------------------------------------ drawing
  const n1 = (v) => Math.round(v * 10) / 10;
  let uidCounter = 0;

  function lerp(a, b, t){ return a + (b - a) * t; }

  /** Engine pod: pylon, rounded body, a dark intake ring at the front and a soft highlight. (cx, cy) is its centre. */
  function nacelle(cx, cy, w, h, style, liv, uid){
    const x = cx - w / 2, y = cy - h / 2;
    const bodyFill = liv.engine ? `style="fill:${liv.engine}"` : `style="fill:url(#ace${uid})"`;
    const r = style === "b737" ? h * .42 : h * .5;
    const pylon = `<path class="ac-pylon" d="M${n1(x + w * .34)} ${n1(y - h * .30)} L${n1(x + w * .74)} ${n1(y - h * .30)} L${n1(x + w * .70)} ${n1(y + h * .40)} L${n1(x + w * .38)} ${n1(y + h * .40)} Z"/>`;
    const body = `<rect class="ac-engine" ${bodyFill} x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(r)}"/>`;
    const fan = style === "gtf" || style === "big" ? .50 : .44;
    const inlet = `<ellipse class="ac-inlet" cx="${n1(x + w - h * .20)}" cy="${n1(cy)}" rx="${n1(h * .22)}" ry="${n1(h * fan)}"/>`
                + `<ellipse class="ac-dark" cx="${n1(x + w - h * .17)}" cy="${n1(cy)}" rx="${n1(h * .12)}" ry="${n1(h * (fan - .12))}"/>`;
    const hi = `<path class="ac-shine" d="M${n1(x + h * .55)} ${n1(y + h * .24)} L${n1(x + w - h * .62)} ${n1(y + h * .24)}"/>`;
    return pylon + body + inlet + hi;
  }

  function winglet(kind, T1, T2, liv){
    // T1 = tip leading edge, T2 = tip trailing edge. Winglets rise from the tip in the airline's colour.
    const fill = `style="fill:${liv.tail}"`;
    const x1 = T1.x, x2 = T2.x, y = T1.y;
    switch (kind) {
      case "sharklet":
      case "blended":
        return `<path class="ac-winglet" ${fill} d="M${n1(x2 + 3)} ${n1(y + 1)} L${n1(x1 + 1)} ${n1(y)} Q${n1(x1 - 2)} ${n1(y - 5)} ${n1(x1 - 5)} ${n1(y - 10)} L${n1(x1 - 8)} ${n1(y - 10)} Q${n1(x2 + 3)} ${n1(y - 4)} ${n1(x2 + 3)} ${n1(y + 1)} Z"/>`;
      case "split":
        return `<path class="ac-winglet" ${fill} d="M${n1(x2 + 2)} ${n1(y + 1)} L${n1(x1 + 1)} ${n1(y)} L${n1(x1 - 5)} ${n1(y - 11)} L${n1(x1 - 9)} ${n1(y - 11)} Z"/>`
             + `<path class="ac-winglet" ${fill} d="M${n1(x2 + 4)} ${n1(y + 1)} L${n1(x1 - 1)} ${n1(y + 1)} L${n1(x1 - 5)} ${n1(y + 7)} L${n1(x2 + 7)} ${n1(y + 6)} Z"/>`;
      case "fence":
        return `<path class="ac-winglet" ${fill} d="M${n1(x2 + 3)} ${n1(y + 1)} L${n1(x1 - 1)} ${n1(y)} L${n1(x1 - 3)} ${n1(y - 6)} L${n1(x1 - 7)} ${n1(y - 6)} Z"/>`;
      case "raked":                                           // 787/777/A350: the tip itself is swept, no separate winglet
        return `<path class="ac-wing" d="M${n1(x2 + 1)} ${n1(y + 1)} L${n1(x1)} ${n1(y)} L${n1(x2 - 14)} ${n1(y + 4)} Q${n1(x2 - 12)} ${n1(y + 6)} ${n1(x2 - 6)} ${n1(y + 5)} Z"/>`;
      default:
        return "";
    }
  }

  function windowsRow(xFrom, xTo, y, step, w, hgt){
    let out = "";
    for (let x = xFrom; x <= xTo; x += step) out += `<rect x="${n1(x - w / 2)}" y="${n1(y - hgt / 2)}" width="${w}" height="${hgt}" rx="${n1(w * .45)}"/>`;
    return out;
  }

  /** Draw one aircraft. fam = a family (from familyFor), liv = livery, uid = unique id suffix for the gradients. */
  function drawAircraft(fam, liv, uid){
    const base = SPECS[fam.key] || SPECS.a320;
    const S = { ...base };
    if (fam.engines) S.engines = fam.engines;
    S.wing = { ...base.wing, ...(fam.winglet ? { winglet: fam.winglet } : {}) };
    const scale = fam.scale || 1;
    const L = base.L * scale, d = L / base.fine * 1.1, h = d / 2;     // a touch chunkier than life: friendlier
    const cx = 200, yc = 100;                                        // positioned and fitted into the box afterwards
    const x0 = cx - L / 2, x1 = cx + L / 2;
    const top = yc - h, bot = yc + h;
    const noseLen = S.nose, tailLen = S.tail;
    let minY = top, maxY = bot;

    // ---- fuselage: rounded nose, level back, underside sweeping up into a blunt tail cone
    const tailEndTop = yc - h * .62, tailEndBot = yc - h * .16;
    const upStart = x0 + tailLen;
    const fuselage =
      `M${n1(x0)} ${n1(tailEndTop)} ` +
      `C${n1(x0 + tailLen * .30)} ${n1(yc - h * .86)} ${n1(x0 + tailLen * .62)} ${n1(top)} ${n1(x0 + tailLen * .95)} ${n1(top)} ` +
      `L${n1(x1 - noseLen)} ${n1(top)} ` +
      `C${n1(x1 - noseLen * .30)} ${n1(top)} ${n1(x1)} ${n1(yc - h * .50)} ${n1(x1)} ${n1(yc + h * S.drop - h * .10)} ` +
      `C${n1(x1)} ${n1(yc + h * .58)} ${n1(x1 - noseLen * .28)} ${n1(bot)} ${n1(x1 - noseLen * .80)} ${n1(bot)} ` +
      `L${n1(upStart)} ${n1(bot)} ` +
      `C${n1(x0 + tailLen * .55)} ${n1(bot)} ${n1(x0 + tailLen * .16)} ${n1(yc + h * .30)} ${n1(x0)} ${n1(tailEndBot)} ` +
      `Q${n1(x0 - 3)} ${n1((tailEndTop + tailEndBot) / 2)} ${n1(x0)} ${n1(tailEndTop)} Z`;

    let hump = "";
    if (S.hump) {                                             // 747: the upper-deck bulge behind the cockpit
      const hx0 = x1 - noseLen - 76, hx1 = x1 - noseLen + 16;
      hump = `<path class="ac-fuse" style="fill:url(#acf${uid})" d="M${n1(hx0)} ${n1(top + 2)} C${n1(hx0 + 14)} ${n1(top - 10)} ${n1(hx1 - 30)} ${n1(top - 13)} ${n1(hx1 - 8)} ${n1(top - 9)} C${n1(hx1 + 6)} ${n1(top - 6)} ${n1(hx1 + 10)} ${n1(top)} ${n1(hx1 + 14)} ${n1(top + 4)} L${n1(hx0)} ${n1(top + 4)} Z"/>`;
      minY = top - 13;
    }

    // ---- tail fin: swept, rounded corners, tinted in the airline colour
    const fb2 = x0 + tailLen * .10, fb1 = fb2 + S.fin.base;
    const finTop = top - S.fin.h;
    const tipFront = fb1 - S.fin.sweep, tipRear = tipFront - S.fin.tip;
    minY = Math.min(minY, finTop - (S.ttail ? 6 : 1));
    const fin = `M${n1(fb1)} ${n1(top + 4)} L${n1(tipFront + 3)} ${n1(finTop + 6)} Q${n1(tipFront + 1)} ${n1(finTop)} ${n1(tipFront - 5)} ${n1(finTop)} L${n1(tipRear + 2)} ${n1(finTop)} Q${n1(tipRear - 2)} ${n1(finTop)} ${n1(tipRear - 2.5)} ${n1(finTop + 5)} L${n1(fb2)} ${n1(yc - h * .80)} Z`;
    const rudder = `M${n1(tipRear - 2.5)} ${n1(finTop + 5)} L${n1(tipRear + 7)} ${n1(finTop + 1)} L${n1(fb2 + 11)} ${n1(top + 3)} L${n1(fb2)} ${n1(yc - h * .80)} Z`;
    // horizontal stabiliser: a small swept slab peeking out behind the fin base (a T-tail sits up on the fin instead)
    const stab = S.ttail
      ? `<path class="ac-wing" d="M${n1(tipFront + 10)} ${n1(finTop - 3)} L${n1(tipRear - 16)} ${n1(finTop - 3)} Q${n1(tipRear - 19)} ${n1(finTop + 1)} ${n1(tipRear - 14)} ${n1(finTop + 5)} L${n1(tipFront + 4)} ${n1(finTop + 5)} Z"/>`
      : `<path class="ac-wing" d="M${n1(x0 + tailLen * .80)} ${n1(yc - h * .52)} L${n1(x0 + tailLen * .96)} ${n1(yc - h * .40)} L${n1(x0 + tailLen * .22)} ${n1(yc + h * .10)} Q${n1(x0 - 4)} ${n1(yc + h * .08)} ${n1(x0 - 2)} ${n1(yc - h * .06)} Z"/>`;
    const fcx = (fb1 + tipFront + tipRear + fb2) / 4 + 1, fcy = (top + finTop) / 2 + 4;
    const badgeR = Math.min(15, S.fin.h * .36);

    // ---- wing + engines
    let wingSvg = "", engineSvg = "", wingletSvg = "", wingTop = "";
    const W = S.wing;
    if (base.high) {                                          // high-wing turboprop: wing and engines along the top of the fuselage
      const xle = x1 - W.le * L, yr = top - 1;
      wingSvg = `<path class="ac-wing" d="M${n1(xle)} ${n1(yr + 6)} L${n1(xle - W.root)} ${n1(yr + 6)} L${n1(xle - W.root - W.sweep)} ${n1(yr - 5)} Q${n1(xle - W.root - W.sweep + 4)} ${n1(yr - 8)} ${n1(xle - W.sweep + 4)} ${n1(yr - 6)} Z"/>`;
      minY = Math.min(minY, yr - 8);
      for (const e of S.engines) {
        const ex = xle + 14 - e.w / 2, ey = yr - 3;
        const px = ex + e.w + 3, pr = h + 8;
        engineSvg += `<rect class="ac-engine" style="fill:url(#ace${uid})" x="${n1(ex)}" y="${n1(ey - e.h / 2)}" width="${n1(e.w)}" height="${n1(e.h)}" rx="${n1(e.h * .5)}"/>`
          + `<path class="ac-shine" d="M${n1(ex + 8)} ${n1(ey - e.h * .22)} L${n1(ex + e.w - 10)} ${n1(ey - e.h * .22)}"/>`
          + `<ellipse class="ac-prop" cx="${n1(px)}" cy="${n1(ey)}" rx="3.4" ry="${n1(pr)}"/>`;
        const blades = base.props || 4;
        for (let i = 0; i < blades; i++) {
          const a = (i / blades) * Math.PI - Math.PI / 2 + .28;
          engineSvg += `<path class="ac-blade" d="M${n1(px)} ${n1(ey)} L${n1(px + Math.cos(a) * 1.4)} ${n1(ey + Math.sin(a) * pr)}"/>`
                     + `<path class="ac-blade" d="M${n1(px)} ${n1(ey)} L${n1(px - Math.cos(a) * 1.4)} ${n1(ey - Math.sin(a) * pr)}"/>`;
        }
        engineSvg += `<ellipse class="ac-hub" cx="${n1(px)}" cy="${n1(ey)}" rx="2.6" ry="2.6"/>`;
        minY = Math.min(minY, ey - pr); maxY = Math.max(maxY, ey + pr);
      }
    } else {
      // The wing sits in front of the fuselage's lower half and sweeps back and down to a rounded tip.
      const xle = x1 - W.le * L, yr = yc + h * .42;
      const R1 = { x: xle, y: yr }, R2 = { x: xle - W.root * 1.15, y: yr + 7 };
      const T1 = { x: xle - W.sweep * 1.05, y: bot + W.drop * .95 }, T2 = { x: xle - W.sweep * 1.05 - W.tip * 1.5, y: bot + W.drop * .95 + 3 };
      wingSvg = `<path class="ac-wing" style="fill:url(#acw${uid})" d="M${n1(R1.x)} ${n1(R1.y)} L${n1(T1.x)} ${n1(T1.y)} Q${n1(T1.x - 3)} ${n1(T1.y + 4)} ${n1(T2.x)} ${n1(T2.y)} L${n1(R2.x)} ${n1(R2.y)} Z"/>`
              + `<path class="ac-flap" d="M${n1(lerp(R2.x, T2.x, .10))} ${n1(lerp(R2.y, T2.y, .10) - 1)} L${n1(lerp(R2.x, T2.x, .86))} ${n1(lerp(R2.y, T2.y, .86) - 1)}"/>`;
      wingletSvg = winglet(W.winglet, T1, T2, liv);
      maxY = Math.max(maxY, T2.y + 3);
      for (const e of S.engines) {
        if (e.rear) {                                           // engine pod on the rear fuselage
          const ex = x0 + tailLen * .80, ey = yc - h * .12;
          engineSvg += nacelle(ex, ey, e.w, e.h, "turbofan", liv, uid);
          continue;
        }
        const ex = lerp(R1.x, T1.x, e.t), ey = lerp(R1.y, T1.y, e.t);
        const cxE = ex + e.w * .16, cyE = ey + e.h * .72;       // hangs below and ahead of the leading edge
        engineSvg += nacelle(cxE, cyE, e.w, e.h, e.style, liv, uid);
        maxY = Math.max(maxY, cyE + e.h / 2);
      }
    }

    // ---- details: windows, cockpit, doors, cheatline
    const winY = yc - h * .28;
    const wFrom = x0 + tailLen * .95, wTo = x1 - noseLen * 1.0, ww = d > 34 ? 2.8 : 2.4, wh = d > 34 ? 3.6 : 3.1;
    let windows = windowsRow(wFrom, wTo, winY, S.win, ww, wh);
    if (S.double) windows += windowsRow(wFrom + 6, wTo - 10, winY - h * .5, S.win, ww, wh);
    const cockpit = `<path class="ac-cockpit" d="M${n1(x1 - noseLen * .52)} ${n1(yc - h * .60)} L${n1(x1 - noseLen * .24)} ${n1(yc - h * .54)} Q${n1(x1 - noseLen * .08)} ${n1(yc - h * .40)} ${n1(x1 - noseLen * .06)} ${n1(yc - h * .14)} L${n1(x1 - noseLen * .28)} ${n1(yc - h * .22)} Q${n1(x1 - noseLen * .44)} ${n1(yc - h * .30)} ${n1(x1 - noseLen * .52)} ${n1(yc - h * .60)} Z"/>`
                  + `<path class="ac-shine" d="M${n1(x1 - noseLen * .46)} ${n1(yc - h * .52)} L${n1(x1 - noseLen * .26)} ${n1(yc - h * .47)}"/>`;
    const door = (x) => `<rect class="ac-door" x="${n1(x)}" y="${n1(yc - h * .64)}" width="4" height="${n1(h * .82)}" rx="2"/>`;
    const doors = door(x1 - noseLen - 9) + door(x0 + tailLen * .88);
    const sY = yc + h * .26;
    const stripe = `<path class="ac-stripe" style="stroke:${liv.stripe}" d="M${n1(x0 + tailLen * .62)} ${n1(sY + 2)} Q${n1(cx)} ${n1(sY - 1)} ${n1(x1 - noseLen * .62)} ${n1(sY - 4)}"/>`;

    const finSvg = `<path class="ac-tail" style="fill:${liv.tail}" d="${fin}"/><path class="ac-rudder" d="${rudder}"/>`
      + `<path class="ac-tail-shade" d="M${n1(fb2 + 9)} ${n1(yc - h * .78)} L${n1(tipRear + 6)} ${n1(finTop + 4)}"/>`;
    const badge = `<g class="ac-logo-group">`
      + `<circle class="ac-logo-badge" cx="${n1(fcx)}" cy="${n1(fcy)}" r="${n1(badgeR)}"/>`
      + `<text class="ac-logo-text" x="${n1(fcx)}" y="${n1(fcy + badgeR * .28)}" text-anchor="middle" font-size="${n1(badgeR * .78)}"></text>`
      + `<image class="ac-logo" x="${n1(fcx - badgeR * .74)}" y="${n1(fcy - badgeR * .74)}" width="${n1(badgeR * 1.48)}" height="${n1(badgeR * 1.48)}" preserveAspectRatio="xMidYMid meet" opacity="0"/>`
      + `</g>`;

    const defs = `<defs>`
      + `<linearGradient id="acf${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f1f5fb"/><stop offset="1" stop-color="#d3dcea"/></linearGradient>`
      + `<linearGradient id="acw${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe3ef"/><stop offset="1" stop-color="#bac7da"/></linearGradient>`
      + `<linearGradient id="ace${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7fc"/><stop offset="1" stop-color="#c3cfe1"/></linearGradient>`
      + `</defs>`;

    // fit the whole aircraft (tall tails, big wings) inside the 400 x 128 box, centred
    const hgt = (maxY - minY) + 10, wid = L + 12;
    const k = Math.min(1, 394 / wid, 112 / hgt);
    const tx = cx - cx * k, ty = (128 - hgt * k) / 2 - (minY - 1) * k;
    return `${defs}
      <g transform="translate(${n1(tx)} ${n1(ty)}) scale(${n1(k * 1000) / 1000})">
      <ellipse class="ac-shadow" cx="${n1(cx + 4)}" cy="${n1(maxY + 6)}" rx="${n1(L * .38)}" ry="3.6"/>
      ${stab}
      ${finSvg}
      ${hump}
      <path class="ac-fuse" style="fill:url(#acf${uid})" d="${fuselage}"/>
      ${stripe}
      ${windows ? `<g class="ac-win">${windows}</g>` : ""}${doors}${cockpit}
      ${badge}
      ${wingSvg}${wingletSvg}${engineSvg}
      </g>`;
  }

  // ------------------------------------------------------------------------------------------------ public API
  /** Full SVG markup. `what` is a model text, a family object from familyFor(), or a kind string. */
  function svg(what, opts = {}){
    const fam = typeof what === "object" && what ? what
      : (SPECS[what] ? { key: what, kind: kindFor("") }
      : ({ narrowbody: familyFor(""), regional: { key: "ejet", kind: "regional" }, turboprop: { key: "atr", kind: "turboprop" },
           widebody: { key: "b787", kind: "widebody" }, widebody4: { key: "b747", kind: "widebody4" } }[what] || familyFor(what)));
    const liv = opts.livery || liveryFor(opts.iata, opts.name);
    const uid = ++uidCounter;
    return `<svg class="ac-svg" viewBox="0 0 400 128" focusable="false" aria-hidden="true">${drawAircraft(fam, liv, uid)}</svg>`;
  }

  function label(kind){ return LABELS[kind] || LABELS.narrowbody; }

  /**
   * Draw into `el`: the right shape for the model, in the airline's colours, with the airline's logo on the tail.
   * Returns the family used. The logo loads in the background (falls back to the airline code if it can't).
   */
  function render(el, { modelText, iata, name } = {}){
    if (!el) return null;
    const fam = familyFor(modelText);
    const liv = liveryFor(iata, name);
    el.innerHTML = svg(fam, { livery: liv });

    const code = String(iata || "").trim().toUpperCase();
    const text = el.querySelector(".ac-logo-text");
    const image = el.querySelector("image.ac-logo");
    if (text) text.textContent = code;                       // shown until (unless) the logo loads
    const A = window.BrsAirlines;
    if (code && image && A && A.getLogoUrls && A.setImgWithFallback && typeof Image !== "undefined") {
      const probe = new Image();
      A.setImgWithFallback(probe, A.getLogoUrls(code), () => {
        image.setAttribute("href", probe.src);
        image.setAttribute("opacity", "1");
        if (text) text.textContent = "";
      });
    }
    el.dataset.aircraftFamily = fam.key;
    el.dataset.livery = liv.known ? code : "";
    return fam;
  }

  window.BrsAircraft = { kindFor, familyFor, liveryFor, svg, render, label, SPECS };
})();
