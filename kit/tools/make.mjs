// One command from a video folder to a checked MP4:
//   voice → (read-back check) → page check → sound effects mix → contact sheet → render → video check.
//
// Usage: node kit/tools/make.mjs <video folder> [--voice file|api|kokoro] [--skip-voice] [--draft]
//                                [--from s --to s] [--workers n] [--max-seconds n]
//
// The folder holds video.json:
//   { "page": "gold.html", "lines": "lines-gold.json",
//     "voice": one of
//       { "provider": "file", "files": ["narration.mp3", ...] }   narration the user made (e.g. on a TTS website), the default
//       { "provider": "api", "url": "...", "keyEnv": "ENV_NAME", "model": "...", "params": {...} }   a TTS API the user chose
//       { "provider": "kokoro", "sid": 3?, "speed": 1.25? }   offline draft voice (scripts/fetch-models.sh --voice)
//     "language": "zh"?,   // narration language for the recogniser (lib/asr.py); default: zh if the script has CJK, else en
//     "poster": 0.9, "maxSeconds": 180, "workers": 4 }
// Outputs next to the page: timeline-<name>.json, voice-<name>-vo.wav (narration), voice-<name>.wav (mix);
// in build/: <name>.mp4, <name>-poster.webp, <name>-sheet.png, sfx.json.
//   --voice       overrides video.json's provider (file needs voice.files; api needs voice.url/model and its key; kokoro is offline)
//   --skip-voice  reuse the existing timeline and narration (e.g. after editing only the page)
//   --draft       stop after the contact sheet (no render)
//   --from/--to   render a window only (no video check)
// Environment: PLAYWRIGHT_MODULE / CHROMIUM / FFMPEG as the kit tools; PYTHON (default the .venv interpreter, else python3,
// python on Windows);
// VIDEO_MODELS for the offline models.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOLS, '..', '..');
const WIN = process.platform === 'win32';
const venvPy = WIN ? path.join(ROOT, '.venv', 'Scripts', 'python.exe') : path.join(ROOT, '.venv', 'bin', 'python');
const PY = process.env.PYTHON || (fs.existsSync(venvPy) ? venvPy : WIN ? 'python' : 'python3');
const MODELS = process.env.VIDEO_MODELS || path.join(os.homedir(), '.cache', 'ai-video-workflow', 'models');

const { values: o, positionals } = parseArgs({ allowPositionals: true, options: {
  voice: { type: 'string' }, 'skip-voice': { type: 'boolean', default: false }, draft: { type: 'boolean', default: false },
  from: { type: 'string' }, to: { type: 'string' }, workers: { type: 'string' }, 'max-seconds': { type: 'string' },
} });
if (positionals.length !== 1) { console.error('usage: node kit/tools/make.mjs <video folder> [--voice file|api|kokoro] [--skip-voice] [--draft] [--from s --to s]'); process.exit(2); }
const dir = path.resolve(positionals[0]);
const cfgPath = path.join(dir, 'video.json');
if (!fs.existsSync(cfgPath)) { console.error(`make: ${cfgPath} not found (copy templates/shorts to start a video)`); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const page = cfg.page, lines = cfg.lines, name = path.basename(page, '.html');
const timeline = `timeline-${name}.json`, narration = `voice-${name}-vo.wav`, mixed = `voice-${name}.wav`;
const voice = { ...(cfg.voice || {}), ...(o.voice ? { provider: o.voice } : {}) };
const maxSeconds = o['max-seconds'] ?? String(cfg.maxSeconds ?? 180);
for (const f of [page, lines]) if (!fs.existsSync(path.join(dir, f))) { console.error(`make: ${path.join(dir, f)} not found`); process.exit(2); }

function run(label, cmd, args, { optional = false, stdout = null } = {}) {
  console.log(`\n== ${label}`);
  const r = spawnSync(cmd, args, { cwd: dir, stdio: ['inherit', stdout ? 'pipe' : 'inherit', 'inherit'], encoding: 'utf8' });
  if (stdout && r.status === 0) fs.writeFileSync(path.join(dir, stdout), r.stdout);
  if (r.status !== 0) {
    if (optional) { console.log(`(skipped: ${label} did not run)`); return false; }
    console.error(`make: ${label} failed`); process.exit(r.status ?? 1);
  }
  return true;
}
const tool = (f) => path.join(TOOLS, f);
const lang = cfg.language ? ['--lang', cfg.language] : [];

if (!o['skip-voice']) {
  const p = voice.provider || 'file';
  if (p === 'file') {
    const files = voice.files || [];
    if (!files.length) { console.error('make: voice.provider "file" needs voice.files, e.g. ["narration.mp3"] (the narration you generated, in reading order)'); process.exit(2); }
    for (const f of files) if (!fs.existsSync(path.join(dir, f))) { console.error(`make: narration file ${path.join(dir, f)} not found: generate the narration from the script and put it there, or draft with --voice kokoro`); process.exit(2); }
    run('voice (imported narration)', PY, ['-X', 'utf8', tool('import-voice.py'), lines, ...files, '--timeline', timeline, '--voice', narration, '--models', MODELS, ...lang]);
  } else if (p === 'api') {
    run('voice (TTS API)', PY, ['-X', 'utf8', tool('build-voice.py'), lines, '--timeline', timeline, '--voice', narration, '--config', 'video.json']);
  } else if (p === 'kokoro') {
    run('voice (Kokoro, offline)', PY, ['-X', 'utf8', tool('voice-kokoro.py'), lines, '--timeline', timeline, '--voice', narration, '--models', MODELS,
      ...(voice.sid != null ? ['--sid', String(voice.sid)] : []), ...(voice.speed != null ? ['--speed', String(voice.speed)] : [])]);
  } else { console.error(`make: unknown voice provider ${p} (file, api or kokoro)`); process.exit(2); }
  run('read-back check', PY, ['-X', 'utf8', tool('asr-check.py'), timeline, '--wav', narration, '--models', MODELS, ...lang], { optional: true });
}
if (!fs.existsSync(path.join(dir, timeline))) { console.error(`make: ${timeline} missing; run without --skip-voice first`); process.exit(2); }

run('check page', 'node', [tool('check.mjs'), page, timeline, '--lines', lines, '--max-seconds', maxSeconds]);
fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
run('sound cues', 'node', [tool('dump-sfx.mjs'), page, timeline], { stdout: 'build/sfx.json' });
run('mix', PY, ['-X', 'utf8', tool('mix-audio.py'), timeline, narration, 'build/sfx.json', mixed]);
run('contact sheet', 'node', [tool('contact.mjs'), page, timeline, `build/${name}-sheet.png`, '--mode', 'lines', '--cols', '6']);
if (o.draft) { console.log(`\ndraft done: ${path.join(dir, 'build', `${name}-sheet.png`)}`); process.exit(0); }

const total = JSON.parse(fs.readFileSync(path.join(dir, timeline), 'utf8')).total;
const window = [...(o.from ? ['--from', o.from] : []), ...(o.to ? ['--to', o.to] : [])];
run('render', 'node', [tool('render.mjs'), page, timeline, `build/${name}.mp4`, '--workers', o.workers ?? String(cfg.workers ?? 4),
  '--poster', String(cfg.poster ?? Math.round(total * .4)), ...window]);
if (!window.length) run('check video', 'node', [tool('check.mjs'), page, timeline, '--lines', lines, '--max-seconds', maxSeconds,
  '--video', `build/${name}.mp4`, '--poster', `build/${name}-poster.webp`]);
console.log(`\ndone: ${path.join(dir, 'build', `${name}.mp4`)}`);
