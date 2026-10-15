# kit：页面运行时与工具

页面是普通的全局脚本，不是模块。加载顺序固定：`core/` 四个文件 → `styles/handdrawn/` 三个文件 → 本片脚本。视频页面在 `videos/<name>/` 里，用相对路径 `../../kit/...` 加载。

## 页面约定

工具只依赖这几件事：

- **时间轴注入：** 工具在页面脚本运行前注入 `window.TIMELINE`（时间轴 JSON）。
- **`definePage({ render, ready, meta })`：**
  - `render(t)`：同步函数，`t` 是秒。画面只由 `t` 决定，不用 `Math.random`、`Date.now`、`requestAnimationFrame`、定时器、CSS 动画和过渡；
  - `ready`：要等待的 Promise 数组（图片等）。图片或字体加载失败时带路径报错；
  - `meta`：`{ style, fonts, format?, captionMaxLines? }`，手绘风格由 `buildShell()` 给出 `SHELL.meta`。`format` 是 `"portrait"`（默认）或 `"landscape"`，工具按它设画框和输出尺寸。
- **音效节拍（可选）：** `window.SFX = [[秒, 类型, 音量], ...]`，`dump-sfx.mjs` 读取，`mix-audio.py` 合成。类型见 `mix-audio.py` 里的 `SFX` 字典。
- **警告：** `kitWarn(code, detail)` 记录警告；其中 `trigger-overflow`、`caption-overflow` 是硬性失败。

## core

### anim.js：时间函数

| 函数 | 说明 |
| --- | --- |
| `clamp(x, a=0, b=1)`、`lerp(a, b, x)` | 基础运算 |
| `prog(t, a, d=.6)` | 从 `a` 开始、持续 `d` 秒的 0～1 线性进度 |
| `eo(x)`、`eio(x)`、`back(x)` | 缓出、缓入缓出、带回弹的缓出 |
| `pop(t, a, d=.45)` | 带回弹的出现，最大约 1.1 |
| `popA(t, a0, a1=1e9, d=.2)`、`popS(t, a0, d=.35)` | 淡入淡出的透明度；出现时的缩放 |
| `mix(hexA, hexB, x)` | 两个颜色之间插值 |
| `hash(n)` | 固定的伪随机数，0～1 |
| `bob(t, seed, amp=6, sp=3)`、`blinkOpen(t, seed)` | 上下浮动；眨眼（每 3.3 秒闭眼 0.12 秒） |
| `settle(t, amp, freq=1.6, damp=3.2)` | 事件发生后的衰减弹动（落地、晃动） |

### timeline.js：句子与场景

| 名称 | 说明 |
| --- | --- |
| `TL`、`N` | 时间轴和句数 |
| `L(i)`、`E(i)`、`D(i)` | 第 i 句的开始、结束、时长 |
| `at(i, off)` | 节拍时间 `L(i) + off`。`off` 不小于这句时长时警告 `trigger-overflow` |
| `defineScenes(map={})` | 按台词 `s` 的连续段落生成 `SCENES`。`map` 把多个 `s` 合成一个画面，例如 `{ ask: "market", bid: "market" }`。同一个画面可以在后面再次出现 |
| `SCENES` | `[{ key, first, last, a, b }]`。场景窗口从首句前 `SCENE_LEAD`（0.5 秒）开始，到下一个场景开始 |
| `sceneAt(t, { fade })` | 当前场景，附 `index`、`age`（进入多久）、`alpha`（淡入进度，默认 `SCENE_FADE` 0.45 秒）、`prev` |
| `lineOf(key, n=0)` | 画面 `key` 第一次出现时的第 n 句的全局序号。写成 `at(lineOf("gate", 1), .3)`，其他场景增删台词时不用改 |

### captions.js：字幕切分

| 名称 | 说明 |
| --- | --- |
| `makeChunks({ maxChars=24, stripTrailing=false, hardBreaks=false, hold=.3, lead=.05 })` | 按 `，。：；？、！` 和"——"切句（标点后紧跟的右引号、右括号留在前一段），再把相邻小段合并到不超过 `maxChars` 个字（标点不计）；每段按字数分到这句的时间。`hardBreaks` 让合并不跨过 `。；？！`，并把引出引语的"说："和引语放在同一段；函数默认关，模板默认开 |
| 英文行 | 不含中日韩文字的台词按英文切：在 `, . ; : ? !`（及其后的右引号）后接空格处、破折号处切开，太长的分句再按单词切；`maxChars` 仍按中文字宽计，两个拉丁字符算一个；`stripTrailing` 只去掉句尾的 `, ; :`，`plain` 按影视字幕去掉 `, . ; :` 和破折号；超长分句按词切成长度相近的几屏；时间按字母数分配 |
| `chunkAt(chunks, t)` | 当前应显示的一段（已开始的最新一段），没有则为 `null` |
| `checkFit(el, { maxLines, maxHeight, lineHeightPx })` | 检查文字框是否放得下，放不下就警告 `caption-overflow` |
| `CAPTION_LIMITS` | 现有字幕框的参考容量（见下表）。真正的标准是渲染时的 `checkFit` |

| 字幕框 | 字号 | 每行字数 | 行数 |
| --- | --- | --- | --- |
| 手绘胶囊字幕 | 52px | 竖屏每屏最多 14（`maxChars: 14`，一行约放 19） | 默认 1 |
| 横屏胶囊字幕 | 64px | 16（`maxChars: 16`） | 1 |
| 横屏影视字幕 | 72px | 16（`maxChars: 16`） | 1 |

### page.js：页面约定

`definePage({ render, ready, meta })`、`kitWarn(code, detail)`、`loadImages({ key: path })`（填入全局 `IMG`）、`waitFonts(specs, glyphs)`。

## 手绘风格 `styles/handdrawn/`

DOM 加内联 SVG，1080×1920 竖屏或 1920×1080 横屏画框，纸张颗粒、暗角和固定种子的抖动描边（`<g class="rough">`）。

| 名称 | 说明 |
| --- | --- |
| `buildShell({ format, bg, rough, caption: { maxLines, style }, glyphs })` | 建画框、背景、滤镜、暗角、颗粒和胶囊字幕，返回 `SHELL`；`SHELL.meta` 传给 `definePage`。`format: "landscape"` 换成 1920×1080 横屏（`SHELL.w`、`SHELL.h` 是画框尺寸，胶囊字幕默认一行）。`style: "film"` 换成影视字幕：白色粗体加深色描边、无底框；配 `maxLines: 1` 和 `makeChunks({ plain: true, hardBreaks: true })`，一屏一行、不显示 `, . ; :`。`glyphs` 选 `NotoSC` 字体族用哪套 Noto Sans CJK 字形：`"SC"`（默认）、`"TC"`（繁体，台湾），或 `fetch-fonts.py` 下载的其他套（`"HK"`、`"JP"`、`"KR"`）；页面和美术里的字体名不用改 |
| `makeSceneLayers()` | 每个画面一个图层 `{ key: div }` |
| `renderShell(t, { bgMap, bgOverride, chunks, fade })` | 每帧第一件事：场景和背景交叉淡化，显示字幕。`fade` 可以是秒数，或 `{ 场景: 秒数 }`，0 表示硬切 |
| `el(tag, cls, parent, html)`、`place(e, x, y)`、`tf(e, opacity, transform)` | DOM 小工具。位置函数叫 `place`，因为 `at` 是节拍函数 |
| `put(parent, w, h, svg, x, y, { size, origin, cls })` | 放一张 SVG 画；记下 `_home` 作为静止位置 |
| `cam(el, { s, fx, fy, dx, dy })` | 对 `.cam` 容器做推拉摇移，焦点默认在画框中心 |
| `shots(t, [[el, t0], ...], dur=.4)` | 一个场景里的多个镜头：到 `t0` 交叉淡化切换（0 为硬切）。放在句间空隙，不额外占时间 |
| `pic(parent, src, x, y, { size, origin })`、`picStack(parent, { mood: src }, x, y, { size })`、`picsReady()` | 放位图素材；多个姿势用 `setMood()` 切换。`picsReady()` 放进 `definePage` 的 `ready`，缺图时报出路径 |
| `kw(parent, text, size, color, x, y)`、`popKw(k, t, a0, a1, rot, opts)` | 手写字体关键词和它的弹出 |
| `moodStack(parent, w, h, art, moods, x, y)`、`setMood(c, mood)` | 多表情角色：预先画好每种表情，逐帧只切换透明度 |
| `idle(c, t, opts)`、`blink(c, t, seed)`、`hop(c, t, t0, dur, opts)` | 待机浮动、眨眼、抛物线跳跃 |
| `confetti(parent, opts)`、`renderConfetti(bits, t, t0)` | 撒花 |
| `drawStroke(pathEl, k)` | 描线动画（圈出、连线、画括号） |

`arcade.js`（可选，在 `motion.js` 之后加载）：街机系列的配色 `ARC` 和画法 `p1Art`（找代购）、`p2Art`（自己飞）、`coinIco`、`ticketArt`、`planeArt`。

`art.js` 是一套起步画法（`INK`、`PAL`、`face`、`cheeks`、`clockArt`、`checkArt`、`xArt` 等），不是角色表；本片需要的画法写在本片的 `art-*.js` 里。

字幕位置、字号、颜色、颗粒和暗角是 `shell.css` 里的 CSS 变量，在本片页面的 `<style>` 里覆盖。

## 工具 `tools/`

所有命令都在视频文件夹里运行，或传入相对路径。环境变量：
- `PLAYWRIGHT_MODULE`：可选，默认用仓库里装的 playwright；
- `CHROMIUM`：浏览器路径；
- `FFMPEG`：带 libx264 的 ffmpeg；
- `PYTHON`：默认 `.venv/bin/python`；
- `VIDEO_MODELS`：离线模型目录；
- `AIML_API_KEY`：配音密钥。

| 命令 | 作用 |
| --- | --- |
| `make.mjs <视频文件夹> [--voice minimax\|hume\|kokoro\|file] [--skip-voice] [--draft] [--from --to] [--workers n] [--max-seconds n]` | 一条命令出片：配音 → 读音核对（有模型时）→ 页面检查 → 音效混音 → 拼板 → 渲染 → 成片检查。读 `video.json` |
| `build-voice.py <lines> --timeline <out> --voice <wav> [--provider minimax\|hume] [--pron] [--voice-name] [--dry-run]` | 经 AIML 配音并排时间轴。MiniMax（中文，`Wise_Woman`、`happy`、语速 1.2，支持逐句 `speed` 和读音表）；Hume Octave 2（英文，默认 "Sitcom Girl"）。按"台词 + 参数"缓存在 `kit/build/voice/`。`--dry-run` 不调用接口，按语速估算 |
| `voice-kokoro.py <lines> --timeline <out> --voice <wav> [--sid 3] [--speed 1.25]` | 离线 Kokoro 配音，输出格式相同 |
| `import-voice.py <lines> <音频...> --timeline <out> --voice <wav> [--models] [--lang zh\|en]` | 导入在别处生成的旁白（mp3/wav/m4a，可多个文件按顺序）：在停顿处切成逐句，写出与 `build-voice.py` 相同格式的时间轴和 24 kHz WAV。有离线识别模型时按识别结果对齐台词，否则只按句长，并打印每句长度与字数比例（`!` 表示偏差大）。`video.json` 的 `voice.provider: "file"` 由 `make.mjs` 调用它 |
| `asr-check.py <timeline> [--wav] [--lang zh\|en]` | 读音核对：离线识别每句配音，打印和台词不一致的句子 |
| `build-timeline.py <lines> <timeline>` | 无旁白的时间轴，按阅读速度：每句 max(1.6 秒, 字数 ÷ 4.2 + 0.3 秒) |
| `dump-sfx.mjs <page> <timeline>` | 输出页面的 `window.SFX` |
| `mix-audio.py <timeline> <narration.wav> <sfx.json> <out.wav>` | 旁白加合成音效混成一条音轨，并把时间轴的 `voice` 改指向它。不用背景音乐 |
| `check.mjs <page> <timeline> [--lines] [--video] [--poster] [--max-seconds 180]` | 自动检查，输出 JSON，有硬性失败时退出码为 1（见下） |
| `contact.mjs <page> <timeline> <out.png> [--mode lines\|beats] [--cols 6]` | 拼板：每句取一帧，或每句取开始、中间、结束三帧；缩略图是画框的四分之一 |
| `frames.mjs <page> <timeline> <out dir> <t...>` | 指定时刻的全尺寸截图 |
| `render.mjs <page> <timeline> <out.mp4> [--poster 秒] [--from --to] [--workers n]` | 渲染竖屏 720×1280 或横屏 1920×1080、30fps、H.264 crf 27、`yuv420p`、`+faststart`；时间轴里有 `voice` 时带上 AAC 音轨 |
| `preview.mjs <视频文件夹> [--port 4173]` | 本地预览：拖动时间、播放、按台词跳转、查看警告 |
| `fetch-fonts.py [HK JP KR ...]` | 下载 Noto Sans SC、TC（及参数里的其他套）的 Bold/Black 和站酷快乐体到 `kit/.fonts/`，配合 `buildShell({ glyphs })` |

`check.mjs` 的硬性检查：
- 时间轴字段完整、时间递增、总长不超过上限；
- 页面加载成功，没有脚本错误；
- 每个字都有字形；
- 没有 `trigger-overflow`、`caption-overflow`；
- 全片每 0.1 秒扫一次：字幕以外的文字出现不足 1.5 秒（`text-brief`），或者字幕上方连续 0.5 秒以上什么都没有（`blank-frame`），都算失败；
- 给了 `--video` 时，核对规格、帧数和音轨；给了 `--poster` 时，核对封面尺寸。

评审警告（不算失败）：
- `static-line`：长句的后半段画面不动；
- `text-small`：字幕以外的字小于 40px；
- `text-dense`：字幕以外的字超过 10 个；
- `text-overlap`：文字互相重叠；
- `text-offframe`：文字被画面边缘截断。
