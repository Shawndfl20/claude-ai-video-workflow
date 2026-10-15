# claude-ai-video-workflow

用代码和 AI 做 YouTube 视频的工具仓库：脚本、配音、画面、音效都在这里生成，一条命令出片。不预设频道和选题，你的频道设定写在本地的 `channel.md`（不入库，见 [AGENTS.md](AGENTS.md)）。流程与标准见 [docs/workflow.md](docs/workflow.md)。

画面是 HTML + SVG 页面，由时间 `t` 决定每一帧；旁白（自己生成后导入，或经 TTS API）排出逐句时间轴，画面上的每个动作都挂在旁白的某个词上。渲染器逐帧截图，编码成 H.264 视频：竖屏 Shorts 或横屏长视频。

## 效果参考

用 Claude Opus 5.5 写代码做的动画视频：

- [博物馆沉浸式风格的视频](https://x.com/KeWai386772/status/2107253459624046855)
- [穿越中国史](https://x.com/miles_mazy/status/2108531674380431374)
- [The story of the One Ring](https://x.com/kevin_t_ngo/status/2110385144846840172)

用本仓库做的：

- Shorts：[為什麼你的錢變少了？3分鐘看懂通膨](https://youtube.com/shorts/-hf666obn7Y)
- 横屏长视频：[复委托 vs 海外券商](https://youtu.be/MsbrNLv3h5s)

## 快速开始

```bash
bash scripts/setup.sh                 # Playwright + Chromium、Python venv、字体（可重复运行）
bash scripts/fetch-models.sh          # 可选：离线语音识别模型（中/英），用于读音核对和导入旁白时切句

cp -r templates/shorts videos/2026-11-my-topic     # 横屏长视频用 templates/landscape
# 改 lines-video.json（台词）和 video.html（画面）；按台词生成旁白，存成 narration.mp3 放进文件夹
node kit/tools/make.mjs videos/2026-11-my-topic --draft   # 导入旁白 → 读音核对 → 检查 → 混音 → 拼板
node kit/tools/make.mjs videos/2026-11-my-topic           # 再渲染出成片 build/video.mp4
```

本地预览，可以拖动时间轴、逐帧查看：

```bash
node kit/tools/preview.mjs videos/2026-11-my-topic
```

## 目录

```
kit/            工具包：页面运行时（core/）、手绘风格（styles/handdrawn/）、命令行工具（tools/）
templates/      新视频的起点（shorts/：竖屏；landscape/：横屏长视频；都是深色舞台 + 英文影视字幕）
videos/         每条视频一个文件夹：video.json、台词、页面、本片美术、README
docs/           制作流程与标准（workflow.md）
scripts/        环境安装、模型下载
```

每条视频的文件夹：

| 文件 | 作用 | 入库 |
| --- | --- | --- |
| `video.json` | 页面、台词、配音提供方、封面时间、时长上限 | 是 |
| `lines-*.json` | 台词：`[{ "s": 场景, "t": 一句话, "hold"?: 句后停顿秒数 }]` | 是 |
| `*.html` / `art-*.js` | 画面页面和本片美术 | 是 |
| `timeline-*.json` | 配音后生成的时间轴 | 是 |
| `voice-*.wav` | 旁白和混音 | 否 |
| `build/` | 成片、封面、拼板 | 否 |

## 配音

用什么服务、什么模型、什么音色由用户决定，仓库不写死。`video.json` 的 `voice` 选一种方式：

| `provider` | 用途 | 需要 |
| --- | --- | --- |
| `file`（默认） | 用户自己生成的旁白（例如配音网站的网页版导出的音频），按停顿和台词切成逐句时间轴 | 音频文件；建议 `fetch-models.sh`（按识别结果切句更准） |
| `api` | 用户选的 TTS 服务：`url`、`model`、`params`（音色、语速等原样发给服务）、`keyEnv`（存密钥的环境变量名） | 用户自己的 API 密钥 |
| `kokoro` | 离线草稿配音，不花钱 | `fetch-models.sh --voice` |

API 配音按句缓存在 `kit/build/voice/`，改一句只重配这一句。读音核对用离线识别模型把配音转回文字，和台词逐句比对。数字、人名、多音字最容易出问题。

**换语言、字体、配音、画幅：** 仓库内置的是做过的组合，换成别的按 [AGENTS.md](AGENTS.md) 的「改变一个变量」在对应位置加上。

## 渲染规格

| 格式 | 页面画框 | 输出 | 用途 |
| --- | --- | --- | --- |
| `portrait`（默认） | 1080×1920 | 720×1280 | Shorts |
| `landscape` | 1920×1080 | 1920×1080 | 长视频 |

格式由页面的 `buildShell({ format })` 决定，工具按它设画框、输出尺寸和检查规则。都是 30 fps，H.264（`yuv420p`，`+faststart`），AAC 单音轨。检查默认按 Shorts 的 180 秒上限执行；横屏模板的 `video.json` 已把 `maxSeconds` 设为 0（不限时长）。

## 待建能力

工具链还不支持的：

| 能力 | 用途 |
| --- | --- |
| 真实数据图表（从数据接口取数，代码画图） | 行情、数据类视频 |
| 录屏片段与动画、字幕、旁白合成 | 软件操作教程 |

## 示例视频

完整的示例，供参考页面写法和本片 README 的格式；它们的选题和风格不是规定，新视频按自己的频道设定来。

| 文件夹 | 语言 | 形式 | 时长 | 内容 |
| --- | --- | --- | --- | --- |
| [videos/2026-10-why-gold-is-money](videos/2026-10-why-gold-is-money/) | 英文 | Shorts | 83 秒 | 118 种元素淘汰赛：为什么黄金成了钱 |
| [videos/2026-10-zero-fee-wire](videos/2026-10-zero-fee-wire/) | 繁中 | Shorts | 87 秒 | 买美股零手续费，怎么反而花更多 |
| [videos/2026-10-us-broker-diorama](videos/2026-10-us-broker-diorama/) | 繁中 | 横屏 | 196 秒 | 复委托 vs 海外券商（微缩世界风格） |
| [videos/2026-10-us-broker-arcade](videos/2026-10-us-broker-arcade/) | 繁中 | 横屏 | 196 秒 | 同一脚本的街机风格版本 |
