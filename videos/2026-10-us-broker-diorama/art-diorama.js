/* Diorama style art for this video: a miniature world (Taipei — Pacific — New York) on a wooden board.
   Flat pastel shapes with long soft shadows; every builder returns an SVG string for put(). */

const DIO = {
  ink: "#2b3150", sky0: "#bfe3f7", sky1: "#f7efe2", sea0: "#7fd0ec", sea1: "#3d9fd2", land: "#a7d98b", landSide: "#7fb86a",
  wood: "#b98654", woodSide: "#8d6239", tw: "#e8574b", us: "#3b6fd8", gold: "#f6c445", goldDark: "#d99a1c", cream: "#fffaf0",
};

/** The hero: a NT$ coin with a face. 140 x 140. */
function coinArt({ wink = false } = {}) {
  return `<g>
    <ellipse cx="70" cy="132" rx="44" ry="7" fill="rgba(0,0,0,.18)"/>
    <circle cx="70" cy="66" r="60" fill="${DIO.goldDark}"/>
    <circle cx="70" cy="62" r="56" fill="${DIO.gold}"/>
    <circle cx="70" cy="62" r="44" fill="none" stroke="${DIO.goldDark}" stroke-width="4" stroke-dasharray="6 7"/>
    <ellipse cx="52" cy="56" rx="9" ry="${wink ? 2 : 11}" fill="${DIO.ink}"/>
    <ellipse cx="88" cy="56" rx="9" ry="11" fill="${DIO.ink}"/>
    <circle cx="55" cy="51" r="3" fill="#fff"/><circle cx="91" cy="51" r="3" fill="#fff"/>
    <path d="M56 80 Q70 92 84 80" stroke="${DIO.ink}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <circle cx="38" cy="76" r="7" fill="#f59a7a" opacity=".7"/><circle cx="102" cy="76" r="7" fill="#f59a7a" opacity=".7"/>
  </g>`;
}

/** A small loose coin (chips, stacks). 40 x 40. */
const chipArt = (c = DIO.gold) => `<circle cx="20" cy="20" r="18" fill="${DIO.goldDark}"/><circle cx="20" cy="18" r="16" fill="${c}"/>`;

/** Box building with a lit window grid: w x h, its own colours. */
function blockArt(w, h, body, side, { rows = 4, cols = 3, win = "#fff6c9", roof = null } = {}) {
  let s = `<rect x="${w * .82}" y="10" width="${w * .18}" height="${h - 10}" fill="${side}"/><rect x="0" y="0" width="${w * .82}" height="${h}" fill="${body}"/>`;
  if (roof) s += `<rect x="-6" y="-14" width="${w * .82 + 12}" height="18" rx="4" fill="${roof}"/>`;
  const gw = (w * .82 - 30) / cols, gh = (h - 40) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s += `<rect x="${18 + c * gw}" y="${24 + r * gh}" width="${gw - 14}" height="${gh - 16}" rx="4" fill="${win}" opacity="${.55 + .45 * hash(r * 7 + c + w)}"/>`;
  return s;
}

/** Taipei 101 silhouette, 160 x 900. */
function tower101Art() {
  let s = `<rect x="76" y="0" width="8" height="70" fill="#5b6b8c"/>`;
  for (let k = 0; k < 8; k++) {
    const y = 70 + k * 92;
    s += `<path d="M30 ${y + 92} L42 ${y} L118 ${y} L130 ${y + 92} Z" fill="${k % 2 ? "#6f9fb0" : "#7fb3c4"}"/><rect x="30" y="${y + 84}" width="100" height="8" fill="#5b8797"/>`;
  }
  return s + `<rect x="18" y="806" width="124" height="94" fill="#5b8797"/>`;
}

/** Shop front: awning stripes in `color`, sign text. w = 400, h = 330. */
function shopArt(color, sign) {
  let stripes = "";
  for (let k = 0; k < 8; k++) stripes += `<path d="M${k * 50} 120 L${k * 50 + 50} 120 L${k * 50 + 50} 170 Q${k * 50 + 25} 190 ${k * 50} 170 Z" fill="${k % 2 ? "#fff" : color}"/>`;
  return `<rect x="10" y="120" width="380" height="210" fill="${DIO.cream}"/>
    <rect x="330" y="128" width="60" height="202" fill="#e6dccb"/>
    <rect x="0" y="40" width="400" height="84" rx="10" fill="${color}"/>
    <text x="200" y="98" text-anchor="middle" font-family="NotoSC" font-weight="900" font-size="54" fill="#fff">${sign}</text>
    ${stripes}
    <rect x="40" y="200" width="150" height="110" rx="6" fill="#bfe3f7"/><rect x="230" y="200" width="80" height="130" rx="6" fill="${DIO.ink}" opacity=".85"/>`;
}

/** Stock exchange: columns and pediment. 600 x 520. */
function exchangeArt() {
  let cols = "";
  for (let k = 0; k < 6; k++) cols += `<rect x="${70 + k * 88}" y="190" width="44" height="270" fill="#f4efe6"/><rect x="${64 + k * 88}" y="180" width="56" height="14" fill="#ddd3c3"/>`;
  return `<path d="M20 180 L300 30 L580 180 Z" fill="#ece4d6"/><path d="M60 170 L300 50 L540 170 Z" fill="#d9cdb9"/>
    <rect x="30" y="170" width="540" height="22" fill="#ddd3c3"/>${cols}
    <rect x="20" y="460" width="560" height="60" fill="#d9cdb9"/><rect x="250" y="330" width="100" height="130" fill="${DIO.ink}" opacity=".8"/>
    <rect x="296" y="-60" width="6" height="90" fill="#555"/><path d="M302 -60 L380 -42 L302 -24 Z" fill="${DIO.us}"/>`;
}

/** Guard at the exchange door, palm up. 120 x 240. */
function guardArt() {
  return `<ellipse cx="60" cy="234" rx="40" ry="6" fill="rgba(0,0,0,.2)"/>
    <rect x="30" y="80" width="60" height="150" rx="16" fill="${DIO.ink}"/><circle cx="60" cy="52" r="30" fill="#f2c9a0"/>
    <rect x="28" y="16" width="64" height="20" rx="6" fill="${DIO.ink}"/><circle cx="50" cy="52" r="4" fill="${DIO.ink}"/><circle cx="70" cy="52" r="4" fill="${DIO.ink}"/>
    <path d="M90 100 L118 60" stroke="${DIO.ink}" stroke-width="18" stroke-linecap="round"/><circle cx="118" cy="56" r="13" fill="#f2c9a0"/>`;
}

/** Plane facing right, 300 x 120. */
function planeArt() {
  return `<path d="M20 60 Q20 40 60 40 L240 40 Q290 42 296 60 Q290 78 240 80 L60 80 Q20 80 20 60 Z" fill="#fff"/>
    <path d="M110 58 L170 58 L120 120 L90 120 Z" fill="#c9d6ea"/><path d="M40 42 L20 0 L50 0 L80 42 Z" fill="${DIO.tw}"/>
    <path d="M110 42 L150 42 L120 10 L100 10 Z" fill="#c9d6ea"/>
    ${[0, 1, 2, 3, 4].map((k) => `<circle cx="${130 + k * 22}" cy="56" r="6" fill="#7fb3c4"/>`).join("")}
    <path d="M250 48 Q268 50 276 58 L250 58 Z" fill="#7fb3c4"/>`;
}

/** Little cargo ship carrying one parcel, 280 x 160. */
function shipArt() {
  return `<path d="M0 90 L280 90 L240 150 L30 150 Z" fill="${DIO.tw}"/><rect x="0" y="84" width="280" height="10" fill="#fff"/>
    <rect x="180" y="30" width="60" height="56" rx="6" fill="#fff"/><rect x="190" y="42" width="40" height="14" rx="3" fill="#7fb3c4"/>
    <rect x="60" y="30" width="90" height="56" rx="4" fill="#c99b62"/><rect x="100" y="30" width="10" height="56" fill="#e8c88f"/>`;
}

/** Toll cloud with a barrier. 360 x 220. */
function tollCloudArt() {
  return `<g fill="#fff"><circle cx="90" cy="120" r="70"/><circle cx="170" cy="90" r="85"/><circle cx="260" cy="120" r="70"/><rect x="60" y="120" width="240" height="70" rx="35"/></g>
    <rect x="160" y="150" width="16" height="70" fill="${DIO.ink}"/><rect x="40" y="150" width="140" height="16" rx="8" fill="${DIO.tw}"/>`;
}

/** Customs gate: booth plus barrier, 420 x 300. */
function customsArt() {
  let stripes = "";
  for (let k = 0; k < 6; k++) stripes += `<rect x="${170 + k * 40}" y="210" width="20" height="22" fill="${DIO.tw}"/>`;
  return `<rect x="0" y="60" width="150" height="240" rx="8" fill="#e9eef7"/><rect x="0" y="40" width="160" height="34" rx="8" fill="${DIO.ink}"/>
    <rect x="22" y="100" width="106" height="80" rx="6" fill="#bfe3f7"/>
    <rect x="150" y="200" width="270" height="34" rx="6" fill="#fff"/>${stripes}<circle cx="160" cy="216" r="20" fill="${DIO.ink}"/>`;
}

/** Shield, 220 x 260. */
function shieldArt() {
  return `<path d="M110 0 L220 40 Q220 190 110 260 Q0 190 0 40 Z" fill="${DIO.us}"/><path d="M110 22 L198 54 Q196 176 110 236 Q24 176 22 54 Z" fill="#5d8bea"/>
    <path d="M70 130 L100 160 L156 96" stroke="#fff" stroke-width="20" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Puffy cloud for the sky parallax, 300 x 120. */
const cloudArt = () => `<g fill="#fff" opacity=".9"><circle cx="80" cy="74" r="44"/><circle cx="150" cy="56" r="56"/><circle cx="220" cy="76" r="42"/><rect x="40" y="72" width="220" height="46" rx="23"/></g>`;
