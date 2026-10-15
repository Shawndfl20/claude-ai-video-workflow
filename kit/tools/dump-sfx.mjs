// Print a page's sound cues (window.SFX: [[seconds, kind, gain], ...]) as JSON, for mix-audio.py.
// A page without cues prints []. Usage: node dump-sfx.mjs <page.html> <timeline.json> > build/sfx.json
import { launchBrowser, openPage } from './lib/page.mjs';

const [page, timeline] = process.argv.slice(2);
if (!page || !timeline) { console.error('usage: node dump-sfx.mjs <page.html> <timeline.json>'); process.exit(2); }
const browser = await launchBrowser();
const { page: p } = await openPage(browser, page, timeline);
console.log(JSON.stringify(await p.evaluate(() => window.SFX ?? [])));
await browser.close();
