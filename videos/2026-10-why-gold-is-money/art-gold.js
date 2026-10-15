/* eslint-disable @typescript-eslint/no-unused-vars -- helpers are used by gold.html */
/* "Why is gold money?" — code-drawn art. Each piece is an SVG string in a fixed viewBox (size in its comment),
   placed with put() from the handdrawn shell. No characters and no brand marks: the elements are the cast. */

const G = {
  ink: "#1b1e2e", stage: "#1d2340", stage2: "#272f55", paper: "#fffaf0",
  gas: "#9fd3f0", liquid: "#c9d2de", hot: "#f7a35c", glow: "#9be37a", rust: "#e8d6b0", rare: "#d9c7f0",
  pt: "#e6e9ef", ag: "#cfd6df", au: "#f6c945", auDeep: "#d99a12", red: "#e5484d", green: "#59c26b", fire: "#ff8a2a", rustBrown: "#9c4f1f",
  skin: "#f2c9a0", denim: "#3f5f9a",
};

/* ---------------- the periodic table ---------------- */
const SYM = ("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe " +
  "Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og").split(" ");
/** [column 0..17, row 0..8] of element z in the standard layout; rows 7 and 8 are the lanthanide / actinide strips. */
function cell(z) {
  if (z === 1) return [0, 0];
  if (z === 2) return [17, 0];
  const per = [[3, 10, 1], [11, 18, 2], [19, 36, 3], [37, 54, 4], [55, 86, 5], [87, 118, 6]].find(([a, b]) => z >= a && z <= b);
  const [a, , row] = per;
  const k = z - a;
  if (row <= 2) return [k < 2 ? k : k + 10, row];
  if (row <= 4) return [k, row];
  if (k < 2) return [k, row];
  if (k <= 16) return [k + 1, row + 2]; // f-block strip, columns 3..17 (La..Lu / Ac..Lr)
  return [k - 14, row];
}
/** Which round knocks element z out. */
const GASES = [1, 2, 7, 8, 9, 10, 17, 18, 36, 54, 86];
function roundOf(z) {
  if (GASES.includes(z)) return "gas";
  if (z === 80 || z === 35) return "liquid";
  if ([3, 11, 19, 37, 55, 87, 4, 12, 20, 38, 56, 88].includes(z)) return "hot";
  if (z === 43 || z === 61 || z >= 84) return "glow";
  if ([44, 45, 46, 76, 77].includes(z)) return "rare";
  if (z === 78 || z === 47) return "final";
  if (z === 79) return "win";
  return "rust";
}
const TILE_FILL = { gas: G.gas, liquid: G.liquid, hot: G.hot, glow: G.glow, rust: G.rust, rare: G.rare, final: G.pt, win: G.au };

/** Tile face in a 100x100 tile. Moods: happy | smug | shock | sad | dead | woozy. */
function tileFace(mood, y = 72) {
  const eye = (x) => `<circle class="eyes" cx="${x}" cy="${y}" r="4.2" fill="${G.ink}"/>`;
  if (mood === "smug") return `<path d="M33 ${y} h10 M57 ${y} h10" stroke="${G.ink}" stroke-width="4" stroke-linecap="round"/><path d="M40 ${y + 12} q12 7 22 -3" stroke="${G.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if (mood === "shock") return `<circle cx="38" cy="${y}" r="5.5" fill="${G.ink}"/><circle cx="62" cy="${y}" r="5.5" fill="${G.ink}"/><ellipse cx="50" cy="${y + 15}" rx="6" ry="7" fill="${G.ink}"/>`;
  if (mood === "sad") return `<path d="M31 ${y - 9} l12 4 M69 ${y - 9} l-12 4" stroke="${G.ink}" stroke-width="3.5" stroke-linecap="round"/>${eye(38)}${eye(62)}<path d="M40 ${y + 17} q10 -9 20 0" stroke="${G.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if (mood === "dead") return `<path d="M32 ${y - 6} l12 12 M44 ${y - 6} l-12 12 M56 ${y - 6} l12 12 M68 ${y - 6} l-12 12" stroke="${G.ink}" stroke-width="4" stroke-linecap="round"/><path d="M40 ${y + 15} h20" stroke="${G.ink}" stroke-width="4" stroke-linecap="round"/>`;
  if (mood === "woozy") return `<path d="M32 ${y} q6 -7 12 0 M56 ${y} q6 7 12 0" stroke="${G.ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M38 ${y + 14} q6 -5 12 0 q6 5 12 0" stroke="${G.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  return `${eye(38)}${eye(62)}<path d="M40 ${y + 11} q10 9 20 0" stroke="${G.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
}
/** One element tile. 100x100. `num` adds the atomic number; .tint is a colour wash the page fades in. */
function tileArt(sym, fill, mood = "happy", { num = null, faceY = 72 } = {}) {
  const fs = sym.length > 1 ? 36 : 42;
  return `<g class="rough"><rect x="4" y="4" width="92" height="92" rx="16" fill="${fill}" stroke="${G.ink}" stroke-width="5"/></g>
    <rect class="tint" x="6" y="6" width="88" height="88" rx="14" fill="${G.rustBrown}" opacity="0"/>
    ${num ? `<text x="14" y="24" font-family="NotoSC" font-weight="700" font-size="15" fill="${G.ink}">${num}</text>` : ""}
    <text x="50" y="${num ? 54 : 50}" text-anchor="middle" font-family="NotoSC" font-weight="900" font-size="${fs}" fill="${G.ink}">${sym}</text>
    ${tileFace(mood, faceY)}`;
}

/* ---------------- props ---------------- */
/** Wallet, open (flap up) or closed: body 300x200; the flap is a separate piece. */
const walletArt = `<g class="rough"><rect x="10" y="40" width="280" height="150" rx="20" fill="#7a4b2a" stroke="${G.ink}" stroke-width="7"/><rect x="200" y="90" width="90" height="50" rx="12" fill="#5e381e" stroke="${G.ink}" stroke-width="6"/></g><circle cx="230" cy="115" r="8" fill="${G.au}"/>`;
const flapArt = `<g class="rough"><path d="M10 0 H290 V60 Q150 90 10 60Z" fill="#8f5a33" stroke="${G.ink}" stroke-width="7" stroke-linejoin="round"/></g>`;
/** Balloon string. 20x220. */
const stringArt = `<path d="M10 0 Q0 60 10 110 Q20 160 10 220" stroke="#e8e8f0" stroke-width="4" fill="none"/>`;
/** An open hand, palm up, fingers spread (seen from above-ish). 360x300. */
function palmArt(skin = G.skin) {
  return `<g class="rough"><path d="M60 300 L70 170 Q40 150 30 110 Q24 86 44 84 Q62 84 72 120 L86 150 L80 40 Q80 18 100 18 Q120 18 120 40 L126 130 L134 20 Q136 0 156 0 Q176 2 176 24 L172 130 L190 34 Q194 14 214 16 Q232 20 230 42 L216 140 L244 70 Q252 52 270 58 Q286 66 280 86 L250 190 Q236 250 230 300Z" fill="${skin}" stroke="${G.ink}" stroke-width="7" stroke-linejoin="round"/></g>
    <path d="M130 200 q30 20 60 0" stroke="${G.ink}" stroke-width="5" fill="none" opacity=".5"/>`;
}
/** Liquid blob that can stretch (the page scales it). 300x120. */
const blobArt = (fill) => `<g class="rough"><path d="M20 90 Q10 40 70 36 Q110 10 160 30 Q230 10 270 50 Q300 90 250 104 Q150 120 60 108 Q24 104 20 90Z" fill="${fill}" stroke="${G.ink}" stroke-width="6"/></g><path d="M70 56 q30 -14 60 -4" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" opacity=".7"/>`;
/** Drip. 40x70. */
const dripArt = (fill) => `<path d="M20 4 Q36 36 36 48 A16 16 0 0 1 4 48 Q4 36 20 4Z" fill="${fill}" stroke="${G.ink}" stroke-width="4"/>`;
/** Skull badge. 140x140. */
const skullArt = `<g class="rough"><circle cx="70" cy="70" r="64" fill="#fff4d6" stroke="${G.ink}" stroke-width="6"/></g><path d="M38 66 Q38 30 70 30 Q102 30 102 66 Q102 84 88 88 V102 H52 V88 Q38 84 38 66Z" fill="#fff" stroke="${G.ink}" stroke-width="5"/><circle cx="57" cy="64" r="9" fill="${G.ink}"/><circle cx="83" cy="64" r="9" fill="${G.ink}"/><path d="M62 102 V92 M70 102 V92 M78 102 V92" stroke="${G.ink}" stroke-width="4"/>`;
/** Rain cloud. 420x200. */
const cloudArt = `<g class="rough"><path d="M70 170 Q10 170 14 120 Q20 76 70 80 Q86 26 150 30 Q200 0 250 40 Q310 20 340 74 Q410 74 404 126 Q400 170 340 170Z" fill="#8c95b5" stroke="${G.ink}" stroke-width="7" stroke-linejoin="round"/></g>`;
const dropArt = `<path d="M12 2 Q22 22 22 30 A10 10 0 0 1 2 30 Q2 22 12 2Z" fill="#7cc6f2" stroke="${G.ink}" stroke-width="3"/>`;
/** Fire burst. 260x260. */
const fireArt = `<g class="rough"><path d="M130 10 L160 80 L240 60 L190 130 L250 190 L170 180 L140 250 L110 180 L30 200 L80 130 L20 70 L100 80Z" fill="${G.fire}" stroke="${G.ink}" stroke-width="6" stroke-linejoin="round"/><path d="M130 70 L146 112 L190 108 L156 138 L176 180 L134 160 L96 186 L108 140 L74 112 L118 110Z" fill="#ffd34a"/></g>`;
/** Pay envelope. 320x200. */
const envelopeArt = `<g class="rough"><rect x="10" y="10" width="300" height="180" rx="14" fill="#f4ead2" stroke="${G.ink}" stroke-width="7"/><path d="M10 20 L160 110 L310 20" stroke="${G.ink}" stroke-width="6" fill="none"/></g>`;
/** Glow halo (radial). Drawn by a div; this is the radiation trefoil badge. 140x140. */
const trefoilArt = `<g class="rough"><circle cx="70" cy="70" r="64" fill="#f6e04a" stroke="${G.ink}" stroke-width="6"/></g>${[0, 120, 240].map((a) => `<path d="M70 70 L70 18 A52 52 0 0 1 115 44Z" fill="${G.ink}" transform="rotate(${a} 70 70)"/>`).join("")}<circle cx="70" cy="70" r="14" fill="#f6e04a" stroke="${G.ink}" stroke-width="5"/><circle cx="70" cy="70" r="7" fill="${G.ink}"/>`;
/** Jeans pocket. 420x320. */
const pocketArt = `<g class="rough"><path d="M20 20 H400 V220 Q210 330 20 220Z" fill="${G.denim}" stroke="${G.ink}" stroke-width="7" stroke-linejoin="round"/></g><path d="M40 40 H380 V210 Q210 300 40 210Z" fill="none" stroke="#f0b94a" stroke-width="4" stroke-dasharray="12 10"/>`;
/** Rust flake. 40x30. */
const flakeArt = `<path d="M4 14 L16 2 L36 8 L30 26 L10 28Z" fill="${G.rustBrown}" stroke="${G.ink}" stroke-width="3"/>`;
/** Magnifying glass. 260x260. */
const magArt = `<g class="rough"><path d="M170 170 L246 246" stroke="#7a4b2a" stroke-width="26" stroke-linecap="round"/><circle cx="105" cy="105" r="88" fill="rgba(200,230,255,.25)" stroke="${G.ink}" stroke-width="12"/></g><path d="M60 70 q20 -26 50 -26" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>`;
/** Grabbing hand reaching up (small). 120x160. */
const reachArt = (skin) => `<g class="rough"><path d="M40 160 L42 90 Q20 80 22 60 L30 30 Q34 18 44 22 L48 52 L52 12 Q56 0 66 4 L68 50 L76 14 Q82 4 90 10 L88 56 L98 34 Q106 26 112 34 L98 96 L96 160Z" fill="${skin}" stroke="${G.ink}" stroke-width="5" stroke-linejoin="round"/></g>`;
/** Podium with three steps (2-1-3). 900x300. */
const podiumArt = `<g class="rough"><rect x="300" y="40" width="300" height="260" fill="#c9a14a" stroke="${G.ink}" stroke-width="7"/><rect x="10" y="120" width="290" height="180" fill="#b8bec9" stroke="${G.ink}" stroke-width="7"/><rect x="600" y="160" width="290" height="140" fill="#d6dbe3" stroke="${G.ink}" stroke-width="7"/></g>`;
/** Stone furnace with a fire mouth. 420x420. */
const furnaceArt = `<g class="rough"><path d="M60 410 L90 120 Q210 40 330 120 L360 410Z" fill="#8b6b55" stroke="${G.ink}" stroke-width="8" stroke-linejoin="round"/><path d="M150 410 Q150 290 210 290 Q270 290 270 410Z" fill="#2a1d1a" stroke="${G.ink}" stroke-width="7"/></g>
  <path d="M110 200 h60 M230 170 h70 M120 300 h40 M280 260 h50" stroke="#6e5240" stroke-width="8" stroke-linecap="round"/>`;
/** Flames in the furnace mouth. 160x140. */
const flamesArt = `<path d="M20 140 Q10 80 40 60 Q40 90 60 90 Q50 40 80 10 Q90 60 110 70 Q110 40 130 40 Q150 90 140 140Z" fill="${G.fire}" stroke="${G.ink}" stroke-width="5"/><path d="M50 140 Q50 110 70 100 Q74 120 90 120 Q92 100 104 96 Q116 120 110 140Z" fill="#ffd34a"/>`;
/** Crucible (a small clay pot). 200x150. */
const crucibleArt = `<g class="rough"><path d="M20 20 H180 L160 140 H40Z" fill="#b5653b" stroke="${G.ink}" stroke-width="7" stroke-linejoin="round"/></g>`;
/** Thermometer frame. 120x620; the page draws the liquid column inside x 46..74, y 40..560. */
const thermoArt = `<g class="rough"><rect x="36" y="20" width="48" height="540" rx="24" fill="#fff" stroke="${G.ink}" stroke-width="7"/><circle cx="60" cy="570" r="44" fill="${G.red}" stroke="${G.ink}" stroke-width="7"/></g>`;
/** Gold coin (plain). 200x200. */
const goldCoinArt = `<g class="rough"><circle cx="100" cy="100" r="88" fill="${G.au}" stroke="${G.ink}" stroke-width="8"/></g><circle cx="100" cy="100" r="64" fill="none" stroke="${G.auDeep}" stroke-width="7"/><path d="M60 70 q30 -26 70 -10" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".7"/>`;
/** Check / cross badges. 120x120. */
const okArt = `<g class="rough"><circle cx="60" cy="60" r="52" fill="${G.green}" stroke="${G.ink}" stroke-width="6"/></g><path d="M34 62 L54 82 L88 40" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const noArt = `<g class="rough"><circle cx="60" cy="60" r="52" fill="${G.red}" stroke="${G.ink}" stroke-width="6"/></g><path d="M38 38 L82 82 M82 38 L38 82" stroke="#fff" stroke-width="12" stroke-linecap="round"/>`;
/** Funerary mask silhouette (stylised headdress with stripes). 360x460. */
function maskArt() {
  const stripes = Array.from({ length: 7 }, (_, i) => `<path d="M${40 + i * 4} ${150 + i * 34} Q180 ${130 + i * 34} ${320 - i * 4} ${150 + i * 34}" stroke="#2f4fa8" stroke-width="12" fill="none"/>`).join("");
  return `<g class="rough"><path d="M180 10 Q300 10 330 120 L350 420 Q180 470 10 420 L30 120 Q60 10 180 10Z" fill="${G.au}" stroke="${G.ink}" stroke-width="8" stroke-linejoin="round"/></g>${stripes}
    <g class="rough"><path d="M110 120 Q180 90 250 120 L248 270 Q240 330 180 344 Q120 330 112 270Z" fill="#f8d76a" stroke="${G.ink}" stroke-width="7"/></g>
    <path d="M134 190 q18 -10 36 0 M190 190 q18 -10 36 0" stroke="${G.ink}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M180 210 v40 M160 290 q20 10 40 0" stroke="${G.ink}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M160 344 L180 420 L200 344Z" fill="#2f4fa8" stroke="${G.ink}" stroke-width="6"/>`;
}
/** Sparkle. 40x40. */
const sparkArt = (c = "#fff6c8") => `<path d="M20 0 L25 15 L40 20 L25 25 L20 40 L15 25 L0 20 L15 15Z" fill="${c}"/>`;
/** Neutron star: glowing sphere. 160x160. */
const nstarArt = `<circle cx="80" cy="80" r="70" fill="#cfe6ff" opacity=".25"/><circle cx="80" cy="80" r="46" fill="#e8f4ff" stroke="#9cc6ff" stroke-width="6"/><circle cx="66" cy="66" r="12" fill="#fff"/>`;
/** Earth. 200x200. */
const earthArt = `<g class="rough"><circle cx="100" cy="100" r="88" fill="#4f9fd8" stroke="${G.ink}" stroke-width="7"/></g><path d="M50 60 q30 -20 50 6 q-10 30 -40 26 q-20 -10 -10 -32z M120 110 q30 -10 40 20 q-20 30 -50 20 q-6 -24 10 -40z" fill="#6cc46a" stroke="${G.ink}" stroke-width="5"/>`;
/** Isometric gold cube. 480x520. */
const cubeArt = `<g class="rough"><path d="M240 20 L460 130 L240 240 L20 130Z" fill="#ffe08a" stroke="${G.ink}" stroke-width="8" stroke-linejoin="round"/><path d="M20 130 L240 240 V500 L20 390Z" fill="${G.au}" stroke="${G.ink}" stroke-width="8" stroke-linejoin="round"/><path d="M460 130 L240 240 V500 L460 390Z" fill="${G.auDeep}" stroke="${G.ink}" stroke-width="8" stroke-linejoin="round"/></g>`;
/** Seven-storey building. 220x500. */
function buildingArt() {
  const win = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 3; c++) win.push(`<rect x="${34 + c * 56}" y="${40 + r * 64}" width="40" height="40" rx="5" fill="#ffe9a8" stroke="${G.ink}" stroke-width="4"/>`);
  return `<g class="rough"><rect x="10" y="14" width="200" height="486" fill="#7f8db3" stroke="${G.ink}" stroke-width="7"/></g>${win.join("")}`;
}
/** Person silhouette for scale. 40x110. */
const personArt = `<circle cx="20" cy="14" r="12" fill="#e9ecf5"/><path d="M6 106 L10 46 Q20 30 30 46 L34 106Z" fill="#e9ecf5"/>`;
