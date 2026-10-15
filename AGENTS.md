# ai-video-workflow — Agent 入口

用代码和 AI 做 YouTube 视频：竖屏 Shorts 或横屏长视频。画面是 HTML + SVG 页面，由时间 `t` 决定每一帧；旁白生成后排出时间轴，画面上的每个动作都挂在旁白的某个词上；渲染器逐帧截图，编码成 H.264 视频。

环境没装好（没有 `node_modules/` 或 `kit/.fonts/`）时，先告诉用户并运行 `bash scripts/setup.sh`（会下载 Playwright、Chromium、Python 依赖和字体）。

先读 [docs/workflow.md](docs/workflow.md)（流程与标准），写页面时再查 [kit/README.md](kit/README.md)（函数与工具）。`videos/` 里是完整的示例视频，只用来参考写法，不代表用户的频道定位。

## 开工前：读频道设定

本仓库不预设频道、语言、观众或风格。每次开工先读项目根目录的 `channel.md`（不入库）：

- **有：** 按它执行。
- **没有：** 先问用户下面几项，确认后写进 `channel.md`：
  - 频道名称、语言、主要观众（地区、基础水平）；
  - 视频形式：Shorts、横屏长视频，或两者都做；
  - 题材，以及题材自带的规则（例如财经类：描述里写一句免责声明、不用夸张的情绪词、预测写成"条件 + 情景"）；
  - 配音方式：用户自己生成旁白（例如在配音网站的网页版，默认），或用用户选的 TTS 服务的 API（服务地址、模型、音色等参数、存密钥的环境变量名都由用户定）；
  - 字形：简体（默认）或繁体，繁体在页面里用 `buildShell({ glyphs: "TC" })`；
  - 用语和口吻要求（例如台湾用语、英式拼写）；
  - 品牌限制：能不能出现公司名、要不要固定角色。


同一个用户有多个频道时，`channel.md` 里每个频道一节，开工前先确认这条视频发哪个频道。

## 做一条视频

1. **选题和脚本：** 先给用户看频道、选题、一句话主线和逐句脚本（台词 + 画面），确认后再开工。事实要联网核对，写进本片 README。
2. **定风格：** 读完脚本，给用户 3 种候选风格（长什么样、为什么适合、代价），各出几秒样片，用户选定后整条视频用这一种。不要默认沿用示例视频的风格。
3. **建文件夹：** Shorts 用 `cp -r templates/shorts videos/<YYYY-MM-topic>`，长视频用 `templates/landscape`；改 `video.json`、`lines-*.json`、页面。
4. **配音和草稿：** 默认由用户自己生成旁白：把台词按句导出给用户，收到音频后在 `video.json` 写 `"voice": {"provider": "file", "files": [...]}`；用户选了 API 时写 `"provider": "api"` 和服务、模型、参数（见 `docs/workflow.md` 第 4 节）。然后运行 `node kit/tools/make.mjs videos/<name> --draft`，看读音核对结果和拼板 `build/<name>-sheet.png`，需要细看的帧用 `kit/tools/frames.mjs`。
5. **出成片：** `node kit/tools/make.mjs videos/<name>`，自动检查零失败才算完成。
6. **交付：** 把 `build/<name>.mp4` 发给用户，并写好标题、描述、标签。封面由用户把视频和台词交给 Codex 生成。

真实行情图表、录屏片段还没有支持（见 README 的"待建能力"）。

## 改变一个变量

仓库只内置了做过的组合（中文、英文；竖屏、横屏；手绘风格；导入用户生成的旁白、通用 TTS API、离线草稿配音）。用户要换成没做过的，不要回答"做不到"，按下表在对应位置加上，再用一条短样片验证：

| 变量 | 在哪里设 | 要换成没做过的，改哪里 |
| --- | --- | --- |
| 语言 | `video.json` 的 `language`；台词本身 | 读音核对、导入时切句：在 `kit/tools/lib/asr.py` 的 `RECOGNISERS` 登记一个 sherpa-onnx 模型，下载行加进 `scripts/fetch-models.sh`。没登记时导入只按句长切、读音核对会说明原因后跳过，不影响出片 |
| 字形、字体 | `buildShell({ glyphs })` | 其他 Noto CJK 字形（如 `"JP"`、`"KR"`）：`fetch-fonts.py JP` 下载后直接用；其他字体：放进 `kit/.fonts/`，在页面里加 `@font-face`，并加进 `SHELL.meta.fonts` 让检查验字形 |
| 配音 | `video.json` 的 `voice` | 换服务或模型只改 `voice` 的 `url`、`model`、`params`、`keyEnv`；请求格式不同的服务，在 `build-voice.py` 的 `request_audio()` 里加它的写法 |
| 画幅 | `buildShell({ format })` | 新尺寸：`kit/tools/lib/page.mjs` 的 `FORMATS` 加一项，`shell.js` 里给出画框尺寸 |
| 画面风格 | 每片的页面和 `art-*.js` | 新风格先写在本片；第二条视频再用到时提升进 `kit/styles/` |
| 字幕 | `buildShell({ caption })`、`makeChunks({ maxChars })`、`shell.css` 的变量 | 字号、位置、每屏字数按语言和画幅调整，用拼板和手机界面核对 |
| 时长上限 | `video.json` 的 `maxSeconds` | Shorts 180 秒是平台上限；长视频设 0 |

改了 `kit/` 里的东西，要跑一遍现有示例的检查，确认没有影响别的视频。

## 规则

- **单片改动留在本片：** 新画法先写在本片的 `art-*.js` 里；同一个画法第二条视频再用到时，才提升进 `kit/`。
- **页面只由 `t` 决定：** 节拍用 `W(句号, "词")` 挂在旁白上；音效 `cue()` 在加载时登记。
- **密钥：** 用 API 配音时，密钥只放在用户的环境变量里（变量名写在 `voice.keyEnv`），由脚本读取，不打印、不写进文件。API 配音按句缓存，改一句只付这一句的钱；花费要告诉用户。
- **不入库：** `channel.md`、成片、音频、字体、模型都不入库（见 `.gitignore`）。
- **Git 写操作：** commit、push 都要用户在当前对话里明确说了才做。
- **如实汇报：** 我们听不到声音，汇报时说明节奏、读音和音画同步需要用户带声确认。
