// Full-size stills of a page at given times, for close checks of single frames.
// Usage: node frames.mjs <page.html> <timeline.json> <out dir> <t1> [t2 ...]   → <out dir>/frame-<t>.png
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, openPage } from './lib/page.mjs';

const [page, timeline, outDir, ...times] = process.argv.slice(2);
if (!page || !timeline || !outDir || !times.length) { console.error('usage: node frames.mjs <page.html> <timeline.json> <out dir> <t1> [t2 ...]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser();
const { page: p } = await openPage(browser, page, timeline);
for (const t of times) {
  await p.evaluate((s) => window.render(Number(s)), t);
  const out = path.join(outDir, `frame-${t}.png`);
  await p.screenshot({ path: out, scale: 'css' });
  console.log(out);
}
await browser.close();
