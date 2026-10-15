# Why Is Gold Money? · 英文 Shorts

个人频道的科普短片。竖屏 720×1280，约 83 秒，深色舞台加手绘风格。

**主线：** 118 种元素打一场淘汰赛，每淘汰一轮就说明钱需要满足的一个条件；最后只剩黄金。结尾讲它为什么稀有（中子星碰撞）、有多少（全部只够一个 22 米的立方体），再回到开场的周期表，Shorts 可以循环播放。

**画面结构：** 周期表常驻屏幕上半部分当记分牌，每轮按各自的方式淘汰一组元素（气体飘走、液体融化、活泼金属被烧黑、放射性元素发光、其余元素锈碎、太稀有的缩没），右上角的剩余计数跟着变：118 → 107 → 105 → 93 → 59 → 8 → 3 → 1。下半部分演每一轮的笑点。决赛之后切换成全屏场景。

## 事实核对

| 说法 | 依据 |
| --- | --- |
| 用排除法从周期表推出黄金 | NPR Planet Money 对化学工程师 Sanat Kumar 的采访 (2011) |
| 铂熔点约 1,768°C，古代熔炉达不到；金熔点 1,064°C | 化学常数 |
| 铑 1804 年被发现 | Wollaston |
| 图坦卡蒙面具距今约 3,300 年 | 约公元前 1323 年 |
| 很多黄金很可能来自中子星碰撞 | GW170817 千新星观测（Kasen 等，Nature 2017）。比例有争议，台词用 "much of" 和 "likely" |
| 全部已开采黄金约 22 万吨，立方体边长约 22.5 米 | 世界黄金协会 GoldHub。数字随年份更新，台词只说 "about 22 meters" |

## 声音

- **旁白：** Hume Octave 2（经 AIML，音色 "Sitcom Girl"），全片 1,071 个字符。用离线 Whisper base.en 识别把配音转回文字，逐句核对，读音全部正确。
- **音效：** 不用背景音乐。`mix-audio.py` 用代码合成音效，挂在页面的 `window.SFX` 节拍上，不含第三方音频。

## 出片

```bash
node kit/tools/make.mjs videos/2026-10-why-gold-is-money
```

检查的警告里，元素符号和原子序数被算作"小字/字多/重叠"。周期表本身就是画面主体，这些警告是有意保留的。

## 发布文案

**标题：** Why Is Gold Money? We Eliminated 117 Elements

**标签：** why is gold money, why gold, gold, periodic table, elements, chemistry, chemistry explained, science shorts, history of money, money explained, gold history, gold coins, platinum, silver, mercury, sodium in water, radioactive, neutron star collision, where does gold come from, kilonova, tutankhamun mask, all the gold in the world, gold cube, fun facts, science facts, educational, animated explainer
