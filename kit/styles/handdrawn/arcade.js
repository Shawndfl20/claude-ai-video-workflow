/* eslint-disable @typescript-eslint/no-unused-vars -- kit helpers are called by video pages */
/* Arcade look: palette and sprites for the "two players" series (找代購 P1 vs 自己飛 P2). First drawn in
   videos/2026-10-us-broker-arcade, reused by its Shorts. Each art function returns SVG markup for put(). */

const ARC = { NAVY: "#140c34", PINK: "#ff4fd8", CYAN: "#3ee8ff", P1: "#ff5a4f", P2: "#3f8cff", GOLD: "#ffd23f", RED: "#ff4d6d", GREEN: "#7dffa1" };

/** P1 找代購 (複委託): red block with a shopping bag. 200x200. */
const p1Art = () => `<ellipse cx="100" cy="194" rx="62" ry="8" fill="rgba(0,0,0,.35)"/><rect x="30" y="40" width="140" height="140" rx="34" fill="${ARC.P1}"/><rect x="30" y="140" width="140" height="40" rx="18" fill="#d63f36"/>
  <circle cx="78" cy="96" r="16" fill="#fff"/><circle cx="124" cy="96" r="16" fill="#fff"/><circle cx="82" cy="98" r="8" fill="${ARC.NAVY}"/><circle cx="128" cy="98" r="8" fill="${ARC.NAVY}"/>
  <path d="M84 128 Q101 140 118 128" stroke="${ARC.NAVY}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <rect x="150" y="110" width="44" height="50" rx="6" fill="${ARC.GOLD}"/><path d="M158 112 Q172 88 186 112" stroke="${ARC.GOLD}" stroke-width="6" fill="none"/>`;

/** P2 自己飛 (海外券商): blue block with a visor and a paper plane. 200x200. */
const p2Art = () => `<ellipse cx="100" cy="194" rx="62" ry="8" fill="rgba(0,0,0,.35)"/><rect x="30" y="40" width="140" height="140" rx="34" fill="${ARC.P2}"/><rect x="30" y="140" width="140" height="40" rx="18" fill="#2c66c9"/>
  <rect x="44" y="72" width="112" height="46" rx="22" fill="${ARC.CYAN}" stroke="${ARC.NAVY}" stroke-width="6"/><circle cx="78" cy="95" r="9" fill="${ARC.NAVY}"/><circle cx="124" cy="95" r="9" fill="${ARC.NAVY}"/>
  <path d="M84 138 Q101 150 118 138" stroke="${ARC.NAVY}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M160 150 L200 132 L196 160 Z" fill="#fff"/>`;

/** Gold coin with a $, s x s. */
const coinIco = (s = 60) => `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 2}" fill="#c98a12"/><circle cx="${s / 2}" cy="${s / 2 - 2}" r="${s / 2 - 6}" fill="${ARC.GOLD}"/><text x="${s / 2}" y="${s / 2 + s * .14}" text-anchor="middle" font-family="NotoSC" font-weight="900" font-size="${s * .42}" fill="#c98a12">$</text>`;

/** Plane ticket (the wire-transfer fee), 300x130, with an optional label. */
const ticketArt = (label = "機票") => `<path d="M10 10 H290 V50 A15 15 0 0 0 290 80 V120 H10 V80 A15 15 0 0 0 10 50 Z" fill="${ARC.GOLD}" stroke="${ARC.NAVY}" stroke-width="6"/>
  <line x1="210" y1="18" x2="210" y2="112" stroke="${ARC.NAVY}" stroke-width="4" stroke-dasharray="10 8"/>
  <path d="M232 66 L280 50 L272 60 L284 66 L272 72 L280 82 Z" fill="${ARC.NAVY}"/>
  <text x="108" y="84" text-anchor="middle" font-family="NotoSC" font-weight="900" font-size="54" fill="${ARC.NAVY}">${label}</text>`;

/** Plane seen from above, nose to the right, 200x120. */
const planeArt = (c = "#fff") => `<path d="M10 60 L170 48 Q200 60 170 72 Z" fill="${c}" stroke="${ARC.NAVY}" stroke-width="5"/>
  <path d="M90 52 L60 6 L80 6 L130 52 Z M90 68 L60 114 L80 114 L130 68 Z M24 56 L10 30 L22 30 L44 56 Z M24 64 L10 90 L22 90 L44 64 Z" fill="${c}" stroke="${ARC.NAVY}" stroke-width="5" stroke-linejoin="round"/>`;
