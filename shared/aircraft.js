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

  /** The nacelle (engine pod) with pylon, inlet and a highlight. (cx, cy) is its centre; style changes the shape. */
  function nacelle(cx, cy, w, h, style, liv, wingUnderY){
    const x = cx - w / 2, y = cy - h / 2;
    const col = liv.engine ? `style="fill:${liv.engine}"` : "";
    // pylon: from the wing's underside down to the top of the pod
    const pylon = `<path class="ac-pylon" d="M${n1(x + w * .30)} ${n1(Math.min(wingUnderY, y))} L${n1(x + w * .78)} ${n1(Math.min(wingUnderY, y))} L${n1(x + w * .70)} ${n1(y + h * .35)} L${n1(x + w * .36)} ${n1(y + h * .35)} Z"/>`;
    let body, inlet, hi;
    if (style === "b737") {                                   // 737: flattened underside, sits tight under the wing
      body = `<path class="ac-engine" ${col} d="M${n1(x + h * .5)} ${n1(y)} L${n1(x + w - h * .45)} ${n1(y)} Q${n1(x + w)} ${n1(y)} ${n1(x + w)} ${n1(y + h * .5)} Q${n1(x + w)} ${n1(y + h)} ${n1(x + w - h * .45)} ${n1(y + h)} L${n1(x + h * .5)} ${n1(y + h * .92)} Q${n1(x)} ${n1(y + h * .8)} ${n1(x)} ${n1(y + h * .5)} Q${n1(x)} ${n1(y)} ${n1(x + h * .5)} ${n1(y)} Z"/>`;
    } else if (style === "gtf") {                             // big fan, short pod
      body = `<rect class="ac-engine" ${col} x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(h * .46)}"/>`;
    } else {                                                  // turbofan / big
      body = `<rect class="ac-engine" ${col} x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(h * .5)}"/>`;
    }
    inlet = `<ellipse class="ac-dark" cx="${n1(x + w - h * .22)}" cy="${n1(cy)}" rx="${n1(h * .2)}" ry="${n1(h * .36)}"/>`;
    hi = `<path class="ac-shine" d="M${n1(x + h * .5)} ${n1(y + h * .22)} L${n1(x + w - h * .6)} ${n1(y + h * .22)}"/>`;
    return pylon + body + inlet + hi;
  }

  function winglet(kind, T1, T2, liv){
    // T1 = tip leading edge, T2 = tip trailing edge (the wing tip chord)
    const fill = `style="fill:${liv.tail}"`;
    const x1 = T1.x, x2 = T2.x, y = T1.y;
    switch (kind) {
      case "sharklet":
        return `<path class="ac-winglet" ${fill} d="M${n1(x2 + 1)} ${n1(y)} L${n1(x1)} ${n1(y)} Q${n1(x1 - 3)} ${n1(y - 6)} ${n1(x1 - 6)} ${n1(y - 12)} L${n1(x1 - 10)} ${n1(y - 12)} Q${n1(x2 + 3)} ${n1(y - 5)} ${n1(x2 + 1)} ${n1(y)} Z"/>`;
      case "blended":
        return `<path class="ac-winglet" ${fill} d="M${n1(x2 + 2)} ${n1(y)} L${n1(x1)} ${n1(y)} Q${n1(x1 - 4)} ${n1(y - 5)} ${n1(x1 - 7)} ${n1(y - 11)} L${n1(x1 - 11)} ${n1(y - 11)} Q${n1(x2 + 4)} ${n1(y - 6)} ${n1(x2 + 2)} ${n1(y)} Z"/>`;
      case "split":
        return `<path class="ac-winglet" ${fill} d="M${n1(x2 + 1)} ${n1(y)} L${n1(x1)} ${n1(y)} L${n1(x1 - 6)} ${n1(y - 13)} L${n1(x1 - 10)} ${n1(y - 13)} Z"/>`
             + `<path class="ac-winglet" ${fill} d="M${n1(x2 + 3)} ${n1(y)} L${n1(x1 - 2)} ${n1(y)} L${n1(x1 - 6)} ${n1(y + 6)} L${n1(x2 + 6)} ${n1(y + 5)} Z"/>`;
      case "raked":
        return `<path class="ac-wing" d="M${n1(x2)} ${n1(y)} L${n1(x1)} ${n1(y)} L${n1(x2 - 16)} ${n1(y + 3)} L${n1(x2 - 14)} ${n1(y + 4)} Z"/>`;
      case "fence":
        return `<path class="ac-winglet" ${fill} d="M${n1(x2 + 3)} ${n1(y)} L${n1(x1 - 1)} ${n1(y)} L${n1(x1 - 3)} ${n1(y - 6)} L${n1(x1 - 7)} ${n1(y - 6)} Z"/>`;
      default:
        return "";
    }
  }

  function windowsRow(xFrom, xTo, y, step, r){
    let out = "";
    for (let x = xFrom; x <= xTo; x += step) out += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${r}"/>`;
    return out;
  }

  /** Draw one aircraft. spec = a SPECS entry (already tweaked), liv = livery, uid = unique id suffix for gradients. */
  function drawAircraft(fam, liv, uid){
    const base = SPECS[fam.key] || SPECS.a320;
    const S = { ...base };
    if (fam.engines) S.engines = fam.engines;
    S.wing = { ...base.wing, ...(fam.winglet ? { winglet: fam.winglet } : {}) };
    const scale = fam.scale || 1;
    const L = base.L * scale, d = L / base.fine, h = d / 2;
    const cx = 200, yc = base.high ? 74 : 70;
    const x0 = cx - L / 2, x1 = cx + L / 2;
    const top = yc - h, bot = yc + h;
    const noseLen = S.nose, tailLen = S.tail;

    // ---- fuselage
    // Nose: a rounded bluff cone. Tail: the top line stays level to near the end, the underside sweeps up in the
    // last stretch, and the very end is blunt (the APU exhaust) rather than a needle.
    const tailEndTop = yc - h * .66, tailEndBot = yc - h * .20;
    const upStart = x0 + tailLen;                          // where the underside starts rising
    const fuselage =
      `M${n1(x0)} ${n1(tailEndTop)} ` +
      `C${n1(x0 + tailLen * .30)} ${n1(yc - h * .84)} ${n1(x0 + tailLen * .62)} ${n1(top)} ${n1(x0 + tailLen * .95)} ${n1(top)} ` +
      `L${n1(x1 - noseLen)} ${n1(top)} ` +
      `C${n1(x1 - noseLen * .38)} ${n1(top)} ${n1(x1)} ${n1(yc - h * .52)} ${n1(x1)} ${n1(yc + h * S.drop - h * .12)} ` +
      `C${n1(x1)} ${n1(yc + h * .52)} ${n1(x1 - noseLen * .30)} ${n1(bot)} ${n1(x1 - noseLen * .82)} ${n1(bot)} ` +
      `L${n1(upStart)} ${n1(bot)} ` +
      `C${n1(x0 + tailLen * .55)} ${n1(bot)} ${n1(x0 + tailLen * .16)} ${n1(yc + h * .30)} ${n1(x0)} ${n1(tailEndBot)} Z`;

    let hump = "";
    if (S.hump) {                                             // 747: the upper deck bulge behind the cockpit
      const hx0 = x1 - noseLen - 70, hx1 = x1 - noseLen + 14;
      hump = `<path class="ac-fuse" d="M${n1(hx0)} ${n1(top + 1)} C${n1(hx0 + 12)} ${n1(top - 9)} ${n1(hx1 - 28)} ${n1(top - 11)} ${n1(hx1 - 8)} ${n1(top - 8)} C${n1(hx1 + 4)} ${n1(top - 5)} ${n1(hx1 + 8)} ${n1(top + 1)} ${n1(hx1 + 12)} ${n1(top + 4)} L${n1(hx0)} ${n1(top + 4)} Z"/>`;
    }

    // ---- tail
    const finBase2 = x0 + tailLen * .12, finBase1 = finBase2 + S.fin.base;
    const finTop = top - S.fin.h;
    const tipFront = finBase1 - S.fin.sweep, tipRear = tipFront - S.fin.tip;
    const fin = `M${n1(finBase1)} ${n1(top + 1)} L${n1(tipFront)} ${n1(finTop)} L${n1(tipRear)} ${n1(finTop)} L${n1(finBase2)} ${n1(yc - h * .86)} Z`;
    const stabY = S.ttail ? finTop : yc - h * .62;
    const stab = S.ttail
      ? `<path class="ac-wing" d="M${n1(tipFront + 8)} ${n1(finTop - 2)} L${n1(tipRear - 14)} ${n1(finTop - 2)} L${n1(tipRear - 12)} ${n1(finTop + 4)} L${n1(tipFront + 4)} ${n1(finTop + 4)} Z"/>`
      : `<path class="ac-wing" d="M${n1(x0 + tailLen * .92)} ${n1(stabY + 4)} L${n1(x0 + tailLen * 1.02)} ${n1(stabY + 8)} L${n1(x0 + tailLen * .5)} ${n1(stabY + 20)} L${n1(x0 + tailLen * .2)} ${n1(stabY + 18)} Z"/>`;
    // the logo goes on the middle of the fin
    const fcx = (finBase1 + tipFront + tipRear + finBase2) / 4, fcy = (top + finTop) / 2 + 3;
    const badgeR = Math.min(13.5, S.fin.h * .3);

    // ---- wing + engines
    let wingSvg = "", engineSvg = "", wingletSvg = "";
    const W = S.wing;
    if (base.high) {                                          // high-wing turboprop: wing and engines sit along the top of the fuselage
      const xle = x1 - W.le * L, yr = top - 2;
      wingSvg = `<path class="ac-wing" d="M${n1(xle)} ${n1(yr + 5)} L${n1(xle - W.root)} ${n1(yr + 5)} L${n1(xle - W.root - W.sweep)} ${n1(yr - 4)} L${n1(xle - W.sweep)} ${n1(yr - 4)} Z"/>`;
      for (const e of S.engines) {
        const ex = xle + 14 - e.w / 2, ey = yr - 2;                        // nacelle on the wing, reaching well forward
        const px = ex + e.w + 3;
        engineSvg += `<rect class="ac-engine" x="${n1(ex)}" y="${n1(ey - e.h / 2)}" width="${n1(e.w)}" height="${n1(e.h)}" rx="${n1(e.h * .45)}"/>`
          + `<ellipse class="ac-dark" cx="${n1(ex + e.w - 3)}" cy="${n1(ey)}" rx="2" ry="${n1(e.h * .30)}"/>`
          + `<ellipse class="ac-prop" cx="${n1(px)}" cy="${n1(ey)}" rx="3.2" ry="${n1(h + 8)}"/>`;
        const blades = base.props || 4;
        for (let i = 0; i < blades; i++) {
          const a = (i / blades) * Math.PI - Math.PI / 2 + .28;
          engineSvg += `<path class="ac-blade" d="M${n1(px)} ${n1(ey)} L${n1(px + Math.cos(a) * 1.4)} ${n1(ey + Math.sin(a) * (h + 8))}"/>`
                     + `<path class="ac-blade" d="M${n1(px)} ${n1(ey)} L${n1(px - Math.cos(a) * 1.4)} ${n1(ey - Math.sin(a) * (h + 8))}"/>`;
        }
        engineSvg += `<ellipse class="ac-hub" cx="${n1(px)}" cy="${n1(ey)}" rx="2.4" ry="2.4"/>`;
      }
    } else {
      // The root sits well up inside the fuselage so a decent amount of wing shows below it, swept back and down to the tip.
      const xle = x1 - W.le * L, yr = yc + h * .22;
      const R1 = { x: xle, y: yr }, R2 = { x: xle - W.root * 1.12, y: yr + 10 };
      const T1 = { x: xle - W.sweep, y: yc + h * .5 + W.drop * 1.12 }, T2 = { x: xle - W.sweep - W.tip * 1.25, y: yc + h * .5 + W.drop * 1.12 + 2 };
      wingSvg = `<path class="ac-wing" d="M${n1(R1.x)} ${n1(R1.y)} L${n1(R2.x)} ${n1(R2.y)} L${n1(T2.x)} ${n1(T2.y)} L${n1(T1.x)} ${n1(T1.y)} Z"/>`
              + `<path class="ac-flap" d="M${n1(lerp(R2.x, T2.x, .08))} ${n1(lerp(R2.y, T2.y, .08))} L${n1(lerp(R2.x, T2.x, .85))} ${n1(lerp(R2.y, T2.y, .85))}"/>`;
      wingletSvg = winglet(W.winglet, T1, T2, liv);
      for (const e of S.engines) {
        if (e.rear) {                                           // engine pod on the rear fuselage
          const ex = x0 + tailLen * .78, ey = yc - h * .08;
          engineSvg += `<path class="ac-pylon" d="M${n1(ex - e.w * .1)} ${n1(ey - e.h * .1)} L${n1(ex + e.w * .6)} ${n1(ey - e.h * .1)} L${n1(ex + e.w * .5)} ${n1(ey - e.h * .6)} L${n1(ex + e.w * .05)} ${n1(ey - e.h * .5)} Z"/>`
            + `<rect class="ac-engine" x="${n1(ex - e.w / 2 + 4)}" y="${n1(ey - e.h / 2)}" width="${n1(e.w)}" height="${n1(e.h)}" rx="${n1(e.h / 2)}"/>`
            + `<ellipse class="ac-dark" cx="${n1(ex + e.w / 2 + 1)}" cy="${n1(ey)}" rx="${n1(e.h * .2)}" ry="${n1(e.h * .36)}"/>`;
          continue;
        }
        const ex = lerp(R1.x, T1.x, e.t), ey = lerp(R1.y, T1.y, e.t);
        const wingUnder = ey + 2;
        const style = e.style;
        // the pod hangs below and ahead of the leading edge; 737-style pods sit tighter to the wing
        const cxE = ex + e.w * .10 + 4, cyE = ey + e.h * (style === "b737" ? .30 : .38) + 2;
        engineSvg += nacelle(cxE, cyE, e.w, e.h, style, liv, wingUnder);
      }
    }

    // ---- details: windows, cockpit, doors, livery lines
    const winY = yc - h * .30;
    const wFrom = x0 + tailLen * .95, wTo = x1 - noseLen * 1.02, wr = d > 34 ? 1.7 : 1.45;
    let windows = windowsRow(wFrom, wTo, winY, S.win, wr);
    if (S.double) windows += windowsRow(wFrom + 6, wTo - 10, winY - h * .5, S.win, wr) ;
    const cockpit = `<path class="ac-cockpit${S.mask ? " ac-mask" : ""}" d="M${n1(x1 - noseLen * .50)} ${n1(yc - h * .62)} L${n1(x1 - noseLen * .22)} ${n1(yc - h * .55)} Q${n1(x1 - noseLen * .09)} ${n1(yc - h * .40)} ${n1(x1 - noseLen * .07)} ${n1(yc - h * .16)} L${n1(x1 - noseLen * .26)} ${n1(yc - h * .24)} Z"/>`;
    const door = (x) => `<rect class="ac-door" x="${n1(x)}" y="${n1(yc - h * .62)}" width="3.4" height="${n1(h * .78)}" rx="1.2"/>`;
    const doors = door(x1 - noseLen - 8) + door(x0 + tailLen * .9);
    const stripeY = yc + h * .22;
    const stripe = `<path class="ac-stripe" style="stroke:${liv.stripe}" d="M${n1(x0 + tailLen * .7)} ${n1(stripeY + 1)} L${n1(x1 - noseLen * .55)} ${n1(stripeY)}"/>`;

    // ---- livery: tail colour, logo badge on the fin
    const tailFill = liv.tail;
    const finSvg = `<path class="ac-tail" style="fill:${tailFill}" d="${fin}"/>`
      + `<path class="ac-tail-shade" d="M${n1(finBase2 + 6)} ${n1(yc - h * .8)} L${n1(tipRear + 3)} ${n1(finTop + 2)}"/>`;
    const badge = `<g class="ac-logo-group">`
      + `<circle class="ac-logo-badge" cx="${n1(fcx)}" cy="${n1(fcy)}" r="${n1(badgeR)}"/>`
      + `<text class="ac-logo-text" x="${n1(fcx)}" y="${n1(fcy + 3.6)}" text-anchor="middle" font-size="${n1(badgeR * .78)}"></text>`
      + `<image class="ac-logo" x="${n1(fcx - badgeR * .72)}" y="${n1(fcy - badgeR * .72)}" width="${n1(badgeR * 1.44)}" height="${n1(badgeR * 1.44)}" preserveAspectRatio="xMidYMid meet" opacity="0"/>`
      + `</g>`;

    const grad = `<defs><linearGradient id="acf${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".62" stop-color="#eef2f8"/><stop offset="1" stop-color="#cfd8e6"/></linearGradient></defs>`;

    return `${grad}
      <ellipse class="ac-shadow" cx="${n1(cx + 4)}" cy="121" rx="${n1(L * .38)}" ry="4"/>
      ${wingSvg}${wingletSvg}
      ${stab}
      ${finSvg}
      ${hump}
      <path class="ac-fuse" style="fill:url(#acf${uid})" d="${fuselage}"/>
      ${stripe}
      ${windows ? `<g class="ac-win">${windows}</g>` : ""}${doors}${cockpit}
      ${badge}
      ${engineSvg}`;
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
