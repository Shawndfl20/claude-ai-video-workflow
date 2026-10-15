/* eslint-disable @typescript-eslint/no-unused-vars -- kit helpers are called by video pages */
/* Caption chunks and the caption fit check. Needs core/timeline.js; kitWarn comes from core/page.js.
   Chunking is shared; how a chunk is shown (pill, bar, typewriter dialog) belongs to the style. */

/**
 * Measured capacity of the caption boxes the styles ship (1080x1920 frame, CJK glyphs 1 em wide).
 * Reference only: the hard limit is checkFit at render time, not a character count.
 */
const CAPTION_LIMITS = Object.freeze({
  handdrawnPill: { fontPx: 52, perLine: 19 },
  pixelDialog: { fontPx: 48, widthPx: 690, perLine: 14, lines: 3, chars: 42 },
  pixelBar: { fontPx: 46, perLine: 19 },
});

/** Characters that count for caption length and timing: punctuation, quotes and spaces are free. */
const captionLen = (s) => s.replace(/[，。：；？、！“”\s]/g, "").length || 1;

/** A line with no CJK character is captioned as English (Latin text). */
const isLatinLine = (s) => !/[\u3400-\u9fff\uf900-\ufaff]/.test(s);
/**
 * English caption length in CJK-glyph units, so one `maxChars` serves both languages: a Latin
 * glyph is about half an em, so two letters (or a letter and a space) count as one.
 */
const latinLen = (s) => Math.max(1, s.trim().length / 2);

/**
 * English parts of one line: cut after , . ; : ? ! (and closing quotes) when a space follows, and
 * after an em dash; a part still longer than `maxChars` is cut again between words into the fewest
 * parts that fit, of about equal length (no one-word tail), so a long clause never overflows the box.
 * Spaces stay with the part before them and are trimmed when shown.
 */
function latinParts(text, maxChars) {
  const clauses = text.match(/[^,.;:?!—]+(?:[,.;:?!]+["”’)]*|—)?(?=\s|$)\s*|\S+\s*/g) || [text];
  const parts = [];
  for (const clause of clauses) {
    if (latinLen(clause) <= maxChars) { parts.push(clause); continue; }
    // n parts; cut at the word boundary nearest each k/n of the clause, add a part if one still overflows
    const words = clause.match(/\S+\s*/g);
    const ends = words.reduce((acc, w) => [...acc, (acc.at(-1) ?? 0) + w.length], []);
    for (let n = Math.ceil(latinLen(clause) / maxChars); n <= words.length; n++) {
      const cuts = [...new Set([...Array(n - 1)].map((_, k) => {
        const goal = (k + 1) * clause.length / n;
        return ends.reduce((best, e, i) => (Math.abs(e - goal) < Math.abs(ends[best] - goal) ? i : best), 0) + 1;
      }))].filter((c) => c > 0 && c < words.length);
      const split = [0, ...cuts, words.length].slice(1).map((c, i, arr) => words.slice(i ? arr[i - 1] : 0, c).join(""));
      if (split.every((p) => latinLen(p) <= maxChars) || n === words.length) { parts.push(...split); break; }
    }
  }
  return parts;
}

/**
 * Split every timeline line into caption chunks: [{ text, a, b, line }].
 * A line is cut after each ，。：；？、！ and after a "——" dash; closing quotes and brackets right after the mark stay with it,
 * so a caption never starts with ”. Then neighbouring parts are merged while the merged part has at
 * most `maxChars` counted characters (a single longer clause is never split). Each chunk gets a share
 * of the line's [start, end] proportional to its counted characters. `stripTrailing` drops a trailing
 * ，。：；、 from the shown text. `plain` shows the chunk the way film subtitles do: no ，。、；：, a pause
 * inside the chunk becomes a space, and a trailing "——" goes; ？！…, quotes and book marks stay. `hardBreaks` stops merging after 。；？！ (off by default, so existing lessons keep
 * their captions). `hold` and `lead` are stored on the array as chunkAt's defaults.
 */
function makeChunks({ maxChars = 24, stripTrailing = false, plain = false, hardBreaks = false, hold = .3, lead = .05 } = {}) {
  const chunks = [];
  TL.lines.forEach((row, line) => {
    if (isLatinLine(row.t)) return latinChunks(row, line, { maxChars, stripTrailing, plain, hardBreaks }, chunks);
    // hardBreaks also keeps a colon that opens a quote (说：“…”) on the same caption as the quote
    const parts = row.t.match(hardBreaks
      ? /(?:[^，。：；？、！—]|—(?!—)|：(?=[“‘「『]))+(?:——|[，。：；？、！][”’」』）)]*)?|——/g
      : /(?:[^，。：；？、！—]|—(?!—))+(?:——|[，。：；？、！][”’」』）)]*)?|——/g) || [row.t];
    const merged = [];
    let cur = "";
    for (const p of parts) {
      // hardBreaks: never merge past a sentence end or semicolon, so parallel halves are not split across captions
      const closed = hardBreaks && /[。；？！][”’」』）)]*$/.test(cur);
      if (cur && (closed || captionLen(cur + p) > maxChars)) { merged.push(cur); cur = p; } else cur += p;
    }
    if (cur) merged.push(cur);
    const total = merged.reduce((sum, s) => sum + captionLen(s), 0);
    let a = row.start;
    for (const s of merged) {
      const b = a + (row.end - row.start) * captionLen(s) / total;
      const text = plain ? plainCaption(s) : stripTrailing ? s.replace(/[，。：；、]$/, "") : s;
      chunks.push({ text, a, b, line });
      a = b;
    }
  });
  chunks.hold = hold;
  chunks.lead = lead;
  return chunks;
}

/**
 * makeChunks for an English line: parts from latinParts, merged while they fit `maxChars` (latinLen
 * units); hardBreaks never merges past . ; ? !. Time is shared by letters. `stripTrailing` drops a
 * trailing , ; : (a . ? ! stays: English captions keep sentence ends). `plain` shows film subtitles,
 * as the MV engine does: no , . ; : or dashes (a space where they split the chunk); ? ! and quotes stay.
 */
function latinChunks(row, line, { maxChars, stripTrailing, plain, hardBreaks }, chunks) {
  const merged = [];
  let cur = "";
  for (const p of latinParts(row.t, maxChars)) {
    const closed = hardBreaks && /[.;?!]["”’)]*\s*$/.test(cur);
    if (cur && (closed || latinLen(cur + p) > maxChars)) { merged.push(cur); cur = p; } else cur += p;
  }
  if (cur) merged.push(cur);
  const total = merged.reduce((sum, s) => sum + latinLen(s), 0);
  let a = row.start;
  for (const s of merged) {
    const b = a + (row.end - row.start) * latinLen(s) / total;
    const text = plain ? latinFilmText(s) : stripTrailing ? s.trim().replace(/[,;:]$/, "") : s.trim();
    chunks.push({ text, a, b, line });
    a = b;
  }
}

/** English film-subtitle punctuation (same rule as mv/mv.js): drop , . ; : and dashes; keep ? ! quotes, apostrophes, hyphens. */
const latinFilmText = (s) => s.replace(/\s*[—–]+\s*/g, " ").replace(/[,.;:]+(?=["”’)]|\s|$)/g, "").replace(/\s+/g, " ").trim();

/** Film-subtitle punctuation: drop ，。、；： (a space where they split the chunk) and a trailing "——"; a space after a ？！ inside the chunk. */
const plainCaption = (s) => s.replace(/([？！])(?=[^\s”’」』）)])/g, "$1 ").replace(/[，。、；：]+(?=[”’」』）)]|$)/g, "").replace(/\s*[，。、；：]\s*/g, " ").replace(/——$/, "").replace(/\s+/g, " ").trim();

/**
 * The chunk to show at t: the latest chunk that has started (a - lead <= t) and is still inside its
 * hold (t < b + hold), else null. Taking the latest one means the next chunk replaces the previous
 * one on time instead of waiting for the previous one's hold to run out.
 */
function chunkAt(chunks, t, { hold = chunks.hold ?? .3, lead = chunks.lead ?? .05 } = {}) {
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (c.a - lead <= t && t < c.b + hold) return c;
  }
  return null;
}

/**
 * Does the caption element's text fit? `el` is a block or inline-block box sized by its text.
 * maxLines: counted as (content height) / line height, where line height is `lineHeightPx` or the
 * element's CSS line-height in px. maxHeight: limit for the element's full height (content + padding,
 * including overflow). Uses layout sizes, so a scaled preview does not change the result.
 * On overflow it records kitWarn('caption-overflow', text) and returns false.
 */
function checkFit(el, { maxHeight, maxLines, lineHeightPx } = {}) {
  const cs = getComputedStyle(el);
  let fits = true;
  if (maxLines) {
    const lh = lineHeightPx || parseFloat(cs.lineHeight);
    if (!(lh > 0)) throw new Error("checkFit: maxLines needs a line height in px (CSS line-height or lineHeightPx)");
    const content = el.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (Math.round(content / lh) > maxLines) fits = false;
  }
  if (maxHeight && el.scrollHeight > maxHeight) fits = false;
  if (!fits) kitWarn("caption-overflow", el.textContent);
  return fits;
}
