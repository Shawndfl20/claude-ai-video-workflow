/* eslint-disable @typescript-eslint/no-unused-vars -- kit helpers are called by video pages */
/* Hand-drawn style: palette and reusable SVG art.
   Every art piece is an SVG string drawn in a fixed viewBox (size in its comment); place it with
   put(parent, w, h, art, x, y, { size }) from shell.js. Bodies sit in <g class="rough"> for the wobbly
   outline; faces stay outside it so they remain crisp. Eyes carry class "eyes" so blink() can close them.
   This is a starter library, not a cast list: draw video-specific art in the video page, and promote
   a piece here only after a second video reuses it. */

/** Outline ink used by every piece. */
const INK = "#2b2b33";

/** Palette tokens (named by hue, not meaning: each video decides what a colour stands for). */
const PAL = {
  // backgrounds
  yellow: "#f6c945", navy: "#26306b", sky: "#bfe3f0", dusk: "#2b2a5c", teal: "#1f4a45", cream: "#f5ecd8", pink: "#fbd3c4", lightSky: "#cfeaf7",
  // accents
  red: "#e5484d", orange: "#ef7b5b", blue: "#5ab0e0", green: "#7cc06a", purple: "#7a6fd6", gold: "#f6b73c", sun: "#f9d44a", moon: "#f4ecc2",
  // materials
  paper: "#fff8e6", paper2: "#fbf6ea", skin: "#ffd9b8", blush: "#f4a0a0", wood: "#8c5b36", tan: "#c98e57", ground: "#d9c7a0", groundNight: "#5a4f6e",
  // keyword inks that read well on light backgrounds
  good: "#2f7d3b", bad: "#b4432b",
};

/* ---------------- faces ---------------- */

/** Face centred at (cx, cy) with eye gap `gap`. Moods: happy | sleepy | worry | shock. */
function face(mood = "happy", cx = 60, cy = 58, gap = 14) {
  const l = cx - gap, r = cx + gap;
  if (mood === "sleepy") return `<path d="M${l - 7} ${cy} q7 5 14 0 M${r - 7} ${cy} q7 5 14 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="${cx}" cy="${cy + 16}" rx="4" ry="3" fill="${INK}"/>`;
  if (mood === "worry") return `<path d="M${l - 6} ${cy - 6} l12 4 M${r + 6} ${cy - 6} l-12 4" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><ellipse class="eyes" cx="${l}" cy="${cy + 4}" rx="5" ry="6" fill="${INK}"/><ellipse class="eyes" cx="${r}" cy="${cy + 4}" rx="5" ry="6" fill="${INK}"/><path d="M${cx - 10} ${cy + 22} q10 -8 20 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if (mood === "shock") return `<ellipse class="eyes" cx="${l}" cy="${cy}" rx="6" ry="8" fill="${INK}"/><ellipse class="eyes" cx="${r}" cy="${cy}" rx="6" ry="8" fill="${INK}"/><ellipse cx="${cx}" cy="${cy + 20}" rx="7" ry="9" fill="${INK}"/>`;
  return `<ellipse class="eyes" cx="${l}" cy="${cy}" rx="5" ry="7" fill="${INK}"/><ellipse class="eyes" cx="${r}" cy="${cy}" rx="5" ry="7" fill="${INK}"/><path d="M${cx - 10} ${cy + 14} q10 9 20 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
}
/** Blush pair centred at (cx, cy). */
const cheeks = (cx = 60, cy = 74, gap = 26) => `<ellipse cx="${cx - gap}" cy="${cy}" rx="7" ry="4" fill="${PAL.blush}" opacity=".8"/><ellipse cx="${cx + gap}" cy="${cy}" rx="7" ry="4" fill="${PAL.blush}" opacity=".8"/>`;

/* ---------------- characters (mood swap: stack two variants and toggle opacity) ---------------- */

/** A person in a box (a queued order, a share, a crowd member). 120x120. */
function boxChar(col, mood = "happy") {
  return `<g class="rough"><rect x="8" y="14" width="104" height="96" rx="20" fill="${col}" stroke="${INK}" stroke-width="5"/><rect x="20" y="22" width="40" height="14" rx="7" fill="rgba(255,255,255,.35)"/></g>${face(mood, 60, 54, 14)}`;
}
/** Stall owner: head + apron torso. 220x260. Colours are options so different videos get different people. */
function ownerArt(mood = "happy", { body = PAL.orange, apron = "#fff3e0", skin = PAL.skin, hair = "#5a3b2a" } = {}) {
  return `<g class="rough"><path d="M30 260 Q30 150 110 150 Q190 150 190 260Z" fill="${body}" stroke="${INK}" stroke-width="6"/><path d="M76 170 H144 V260 H76Z" fill="${apron}" stroke="${INK}" stroke-width="5"/>
    <circle cx="110" cy="84" r="66" fill="${skin}" stroke="${INK}" stroke-width="6"/><path d="M46 70 Q60 14 110 16 Q162 14 176 70 Q150 44 110 50 Q72 44 46 70Z" fill="${hair}" stroke="${INK}" stroke-width="5"/></g>
    ${face(mood, 110, 90, 22)}${cheeks(110, 110, 40)}`;
}
/** The investor: round head, hoodie. 240x300. */
function guyArt(mood = "happy", { body = PAL.purple, skin = PAL.skin, hair = INK } = {}) {
  return `<g class="rough"><path d="M20 300 Q24 176 120 172 Q216 176 220 300Z" fill="${body}" stroke="${INK}" stroke-width="6"/><path d="M92 176 Q120 214 148 176" fill="none" stroke="${INK}" stroke-width="5"/>
    <circle cx="120" cy="96" r="76" fill="${skin}" stroke="${INK}" stroke-width="6"/><path d="M46 88 Q50 20 120 18 Q196 20 196 92 Q170 58 128 62 Q90 50 46 88Z" fill="${hair}"/></g>
    ${face(mood, 120, 104, 26)}${cheeks(120, 128, 46)}`;
}
/** Cabbage mascot (goods / supply). CAB x CAB.h; mood "sleepy" closes the eyes, anything else is awake. */
function cabbage(mood) {
  const eyes = mood === "sleepy"
    ? `<path d="M40 70 q7 5 14 0 M66 70 q7 5 14 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    : `<g class="eyes"><ellipse cx="47" cy="70" rx="5" ry="6.5" fill="${INK}"/><ellipse cx="73" cy="70" rx="5" ry="6.5" fill="${INK}"/></g>`;
  const mouth = mood === "sleepy" ? `<ellipse cx="60" cy="86" rx="4" ry="3" fill="${INK}"/>` : `<path d="M52 84 q8 8 16 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  return `<g class="rough"><path d="M22 70 C14 40 30 12 60 10 C90 12 106 40 98 70 C96 104 84 122 60 124 C36 122 24 104 22 70Z" fill="#f4f6e6" stroke="${INK}" stroke-width="4"/>
    <path d="M22 66 C16 38 30 8 60 6 C90 8 104 38 98 66 C88 58 80 64 72 56 C66 62 54 62 48 56 C40 64 32 58 22 66Z" fill="${PAL.green}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M60 14 V52 M40 22 Q48 40 46 54 M80 22 Q72 40 74 54" stroke="#bfe39a" stroke-width="4" fill="none" stroke-linecap="round"/></g>
    ${eyes}${mouth}${cheeks(60, 82, 24)}`;
}
const CAB = { w: 120, h: 130 };

/* ---------------- places ---------------- */

/** Market stall with a striped awning. 340x660. */
function stallArt(awnA = PAL.orange) {
  const sc = [...Array(7)].map((_, i) => `<path d="M${10 + i * 44} 118 a22 22 0 0 0 44 0" fill="${i % 2 ? "#fff3e0" : awnA}" stroke="${INK}" stroke-width="4"/>`).join("");
  const stripes = [...Array(7)].map((_, i) => `<rect x="${10 + i * 44}" y="30" width="44" height="88" fill="${i % 2 ? "#fff3e0" : awnA}"/>`).join("");
  return `<g class="rough">
    <rect x="34" y="118" width="16" height="360" fill="${PAL.wood}" stroke="${INK}" stroke-width="4"/><rect x="290" y="118" width="16" height="360" fill="${PAL.wood}" stroke="${INK}" stroke-width="4"/>
    ${stripes}<path d="M10 30 H318 V118 H10 Z" fill="none" stroke="${INK}" stroke-width="5"/>${sc}
    <rect x="110" y="150" width="120" height="70" rx="12" fill="${PAL.paper}" stroke="${INK}" stroke-width="4"/><line x1="130" y1="118" x2="140" y2="150" stroke="${INK}" stroke-width="3"/><line x1="210" y1="118" x2="200" y2="150" stroke="${INK}" stroke-width="3"/>
    <rect x="0" y="470" width="340" height="40" rx="10" fill="${PAL.tan}" stroke="${INK}" stroke-width="5"/>
    <path d="M14 510 H326 V660 H14 Z" fill="#f2d9a8" stroke="${INK}" stroke-width="5"/>
    <path d="M14 560 H326 M14 610 H326" stroke="#e3bd7c" stroke-width="6"/></g>`;
}
/** Roll-down shutter matching stallArt. 340x660; animate with scaleY and transform-origin "50% 18%". */
function shutterArt() {
  return `<g class="rough"><rect x="20" y="118" width="300" height="540" fill="#9aa0ab" stroke="${INK}" stroke-width="5"/>${[...Array(13)].map((_, k) => `<line x1="22" y1="${150 + k * 40}" x2="318" y2="${150 + k * 40}" stroke="#747a86" stroke-width="5"/>`).join("")}<rect x="140" y="620" width="60" height="16" rx="6" fill="#5a606b"/></g>`;
}

/* ---------------- props ---------------- */

/** Smiling sun. 220x220. */
const sunArt = `<g class="rough">${[...Array(10)].map((_, i) => { const a = i * Math.PI / 5; return `<path d="M${110 + Math.cos(a) * 88} ${110 + Math.sin(a) * 88} L${110 + Math.cos(a + .14) * 120} ${110 + Math.sin(a + .14) * 120} L${110 + Math.cos(a - .14) * 120} ${110 + Math.sin(a - .14) * 120}Z" fill="${PAL.gold}" stroke="${INK}" stroke-width="3"/>`; }).join("")}<circle cx="110" cy="110" r="78" fill="${PAL.sun}" stroke="${INK}" stroke-width="5"/></g><ellipse cx="86" cy="104" rx="7" ry="9" fill="${INK}"/><ellipse cx="134" cy="104" rx="7" ry="9" fill="${INK}"/><path d="M92 128 q18 16 36 0" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
/** Sleeping crescent moon. 220x220. */
const moonArt = `<g class="rough"><path d="M140 20 A95 95 0 1 0 190 170 A76 76 0 1 1 140 20Z" fill="${PAL.moon}" stroke="${INK}" stroke-width="5"/></g><path d="M78 110 q8 6 16 0 M110 118 q8 6 16 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
/** Flat coin, stackable. 100x52. */
const smallCoin = `<g class="rough"><ellipse cx="50" cy="26" rx="46" ry="20" fill="${PAL.yellow}" stroke="${INK}" stroke-width="5"/></g><ellipse cx="50" cy="22" rx="28" ry="9" fill="none" stroke="#fff3c0" stroke-width="5"/>`;
/** Shopping cart. 300x260. */
const cartArt = `<g class="rough"><path d="M10 40 H60 L96 190 H260 L290 80 H74" fill="${PAL.paper}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/><circle cx="116" cy="230" r="22" fill="${INK}"/><circle cx="240" cy="230" r="22" fill="${INK}"/></g>`;
/** Red cross (wrong / rejected). 140x140. */
const xArt = `<path d="M20 20 L120 120 M120 20 L20 120" stroke="${PAL.red}" stroke-width="22" stroke-linecap="round"/>`;
/** Green tick badge (right / confirmed). 120x120. */
const checkArt = `<circle cx="60" cy="60" r="54" fill="${PAL.green}" stroke="${INK}" stroke-width="6"/><path d="M34 62 L54 82 L88 42" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Price tag pointing left; label it with tagEl(). 200x110. */
const priceTag = (c) => `<g class="rough"><path d="M40 8 H188 Q196 8 196 16 V94 Q196 102 188 102 H40 L6 55Z" fill="${c}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><circle cx="34" cy="55" r="9" fill="${PAL.paper}" stroke="${INK}" stroke-width="4"/></g>`;
/** Clock face; rotate the ".hand" group (its origin is the centre). 220x220. */
const clockArt = (c = PAL.gold) => `<g class="rough"><circle cx="110" cy="110" r="96" fill="${PAL.paper}" stroke="${INK}" stroke-width="8"/><circle cx="110" cy="110" r="78" fill="none" stroke="${c}" stroke-width="12"/></g><g class="hand" style="transform-origin:110px 110px"><path d="M110 110 V52" stroke="${INK}" stroke-width="10" stroke-linecap="round"/></g><path d="M110 110 H150" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><circle cx="110" cy="110" r="10" fill="${INK}"/>`;
/** Big pill button with a pressed-depth base; put the label on top with kw(). 480x230. */
const bigButton = (c = PAL.red) => `<g class="rough"><rect x="10" y="40" width="460" height="170" rx="85" fill="#8f2a2e" stroke="${INK}" stroke-width="8"/><rect x="10" y="14" width="460" height="170" rx="85" fill="${c}" stroke="${INK}" stroke-width="8"/><rect x="60" y="34" width="180" height="30" rx="15" fill="rgba(255,255,255,.35)"/></g>`;
/** Pointing hand (finger at the top). 210x300. */
const handArt = `<g class="rough"><path d="M70 10 Q90 10 90 34 V120 Q120 104 136 124 Q150 106 170 124 Q190 110 204 132 L204 210 Q200 280 140 290 H100 Q60 286 40 240 L8 170 Q0 150 20 144 Q40 140 50 162 V34 Q50 10 70 10Z" fill="${PAL.skin}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/></g>`;
/** Delivery truck. 400x230. */
const truckArt = (c = PAL.blue) => `<g class="rough"><rect x="10" y="30" width="270" height="150" rx="14" fill="${c}" stroke="${INK}" stroke-width="7"/><path d="M280 80 H350 L390 130 V180 H280Z" fill="${PAL.yellow}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/><path d="M300 92 H344 L368 126 H300Z" fill="${PAL.lightSky}" stroke="${INK}" stroke-width="5"/><circle cx="80" cy="190" r="28" fill="${INK}"/><circle cx="320" cy="190" r="28" fill="${INK}"/></g>`;
/** Upward arrow stroke (price rising). 90x220. */
const arrowUpArt = (c = PAL.red) => `<path d="M45 210 V20 M10 60 L45 16 L80 60" stroke="${c}" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Price tag with a code-drawn label (never bake text into art). Returns the tag div (200x110). */
function tagEl(parent, color, text, x, y, size = 46) {
  const d = put(parent, 200, 110, priceTag(color), x, y);
  kw(d, text, size, PAL.paper, 114, 55 - size / 2);
  return d;
}
