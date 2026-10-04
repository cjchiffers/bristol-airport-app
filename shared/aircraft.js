/* shared/aircraft.js — Bristol Airport Flights App
   A simple side-view aircraft illustration (inline SVG, nose pointing right), picked from the
   aircraft model name: narrow-body, wide-body, regional jet or turboprop.
   It is a generic graphic, not a photo of the actual aircraft.
   Exposes: window.BrsAircraft
*/
"use strict";

(function(){
  /** Model text such as "Airbus A320 (Sharklets)", "ATR 72", "Boeing 737 MAX 8" -> kind. */
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

  const windows = (x0, x1, y, step = 11, r = 2) => {
    let out = "";
    for (let x = x0; x <= x1; x += step) out += `<circle cx="${x}" cy="${y}" r="${r}"/>`;
    return out;
  };

  const engine = (x, y, w, h) => `
    <path class="ac-pylon" d="M${x + w * 0.25} ${y - 8} L${x + w * 0.7} ${y - 8} L${x + w * 0.65} ${y + 2} L${x + w * 0.3} ${y + 2} Z"/>
    <rect class="ac-engine" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>
    <ellipse class="ac-dark" cx="${x + w - 2}" cy="${y + h / 2}" rx="2.6" ry="${h / 2 - 2}"/>`;

  // Jet airliner (narrow-body / regional / wide-body share one drawing, scaled by parameters).
  function jet({ top, bottom, tail, noseX, finH, wingRoot, wingTip, wingY, engines, engW, engH, winX0, winX1, winStep, winglet }) {
    const mid = (top + bottom) / 2;
    const fuselage = `M${tail} ${top} L${noseX - 64} ${top} C${noseX - 32} ${top} ${noseX - 8} ${top + 6} ${noseX} ${mid + 4} C${noseX - 8} ${bottom - 6} ${noseX - 32} ${bottom} ${noseX - 64} ${bottom} L${tail + 104} ${bottom} C${tail + 54} ${bottom} ${tail + 20} ${top + 18} ${tail} ${top} Z`;
    const finBase = tail + 88;
    const fin = `M${finBase} ${top} L${finBase - 44} ${top - finH} L${tail + 14} ${top - finH} L${tail + 26} ${top} Z`;
    const stab = `M${tail + 28} ${top + 12} L${tail + 96} ${top + 18} L${tail + 92} ${top + 23} L${tail + 22} ${top + 17} Z`;
    const rootFront = wingRoot, rootRear = wingRoot - 56;
    const wing = `M${rootFront} ${bottom - 8} L${rootRear} ${bottom - 4} L${wingTip - 26} ${wingY} L${wingTip} ${wingY} Z`;
    const winglets = winglet ? `<path class="ac-wing" d="M${wingTip - 24} ${wingY} L${wingTip - 30} ${wingY - 13} L${wingTip - 16} ${wingY - 3} Z"/>` : "";
    const eng = engines.map(([x, y]) => engine(x, y, engW, engH)).join("");
    return `
      <path class="ac-wing" d="${wing}"/>${winglets}
      <path class="ac-tail" d="${fin}"/>
      <path class="ac-wing" d="${stab}"/>
      <path class="ac-fuse" d="${fuselage}"/>
      <path class="ac-stripe" d="M${tail + 34} ${bottom - 9} L${noseX - 52} ${bottom - 9}"/>
      <g class="ac-win">${windows(winX0, winX1, top + 9, winStep)}</g>
      <path class="ac-cockpit" d="M${noseX - 40} ${top + 7} L${noseX - 22} ${top + 7} L${noseX - 13} ${top + 14} L${noseX - 36} ${top + 14} Z"/>
      ${eng}`;
  }

  const KINDS = {
    narrowbody: () => jet({
      top: 54, bottom: 84, tail: 16, noseX: 392, finH: 46,
      wingRoot: 256, wingTip: 140, wingY: 114,
      engines: [[196, 92]], engW: 44, engH: 17,
      winX0: 124, winX1: 316, winStep: 11, winglet: true,
    }),
    regional: () => jet({
      top: 58, bottom: 82, tail: 30, noseX: 380, finH: 40,
      wingRoot: 244, wingTip: 150, wingY: 108,
      engines: [[196, 90]], engW: 34, engH: 14,
      winX0: 130, winX1: 306, winStep: 12, winglet: false,
    }),
    widebody: () => jet({
      top: 48, bottom: 90, tail: 8, noseX: 396, finH: 52,
      wingRoot: 262, wingTip: 116, wingY: 122,
      engines: [[190, 98]], engW: 56, engH: 22,
      winX0: 112, winX1: 330, winStep: 11, winglet: false,
    }),
    widebody4: () => jet({
      top: 48, bottom: 90, tail: 8, noseX: 396, finH: 52,
      wingRoot: 262, wingTip: 108, wingY: 124,
      engines: [[222, 98], [160, 104]], engW: 44, engH: 19,
      winX0: 112, winX1: 330, winStep: 11, winglet: false,
    }),
    // High wing, nacelle with propeller disc, T-tail.
    turboprop: () => `
      <path class="ac-tail" d="M96 58 L60 12 L36 12 L46 58 Z"/>
      <rect class="ac-wing" x="26" y="9" width="46" height="6" rx="3"/>
      <path class="ac-wing" d="M236 58 L172 58 L146 42 L212 42 Z"/>
      <path class="ac-fuse" d="M30 58 L296 58 C328 58 350 64 358 73 C350 82 328 88 296 88 L112 88 C72 88 48 76 30 60 Z"/>
      <path class="ac-stripe" d="M44 80 L316 80"/>
      <g class="ac-win">${windows(116, 300, 69, 12, 2)}</g>
      <path class="ac-cockpit" d="M324 66 L338 66 L346 72 L328 72 Z"/>
      <rect class="ac-engine" x="188" y="42" width="68" height="17" rx="8.5"/>
      <ellipse class="ac-dark" cx="255" cy="50.5" rx="2.4" ry="6"/>
      <ellipse class="ac-prop" cx="262" cy="50.5" rx="4" ry="30"/>
      <path class="ac-prop-blade" d="M262 21 L262 80"/>`,
  };

  /** Full SVG markup for a kind (decorative: the caller supplies the accessible label). */
  function svg(kind){
    const draw = KINDS[kind] || KINDS.narrowbody;
    return `<svg class="ac-svg" viewBox="0 0 400 140" focusable="false" aria-hidden="true">
      <ellipse class="ac-shadow" cx="204" cy="132" rx="150" ry="5"/>
      ${draw()}
    </svg>`;
  }

  function label(kind){ return LABELS[kind] || LABELS.narrowbody; }

  window.BrsAircraft = { kindFor, svg, label };
})();
