# 语义动作挂到旁白的词上（action anchors）

## 要解决的问题

关系图上的语义动作（水汽上升 `rise`、云越积越厚 `swell=grow`、数到第几个 `count`）
此前全部挂在 `storyProgress` 上——从入场结束（第 18 帧）线性推到本屏结束（duration−28）。

它和旁白是两条互不相干的时间轴。实测 s1「水转了一圈」（真实配音 247 帧）：

```
太阳@1  水@19  水汽@75  飞@88  天上@94  遇冷@117  小水珠@146  落@154  下来@158
```

旁白第 154 帧说"落下来"时，三颗水汽珠子在 68% / 62% / 53% 高度、**还在往上爬**；
升到顶是第 219 帧——比"落下来"晚 **2.0 秒**。孩子听到"落下来"，画面在演示"升上去"。

这不是画面静止的问题（静帧率那套指标管不到），是**画面上演的和嘴里说的不是同一件事**。
3-6 岁建立因果全靠音画同时发生，这条比动效不足严重一个量级。

## 做法

一个节点的动作窗口 = **它被念到的那一帧 → 它所在那句话的收尾帧**。
窗口内 0→1 单调推进，窗口外保持终态（起点不提前演、终态不回头）。

| 环节 | 位置 |
|---|---|
| 算窗口 | `src/modules/learning/action-anchors.ts` → `buildActionAnchors()` |
| 挂到 props | `remotion-render.service.ts`，拿到 cues 之后写 `scene.actionAnchors` |
| 渲染取用 | `video-generation-agent.service.ts` 的 `GraphBadge.actionProgress` |

### 三条边界

1. **找不到词就不下发**，调用方回退 `storyProgress`。不做单字兜底：「树根」被
   「一棵大树」的「树」命中，会把动作挂到全错的位置，比不挂更糟。
2. **单字标签另开一档**：只有"标签本身就是一个字、且这个字在全篇旁白里只出现一次"
   才锚（云、雨、风这类中文极常见）。双字标签绝不退化成单字匹配。
3. **窗口太短就前移起点**，保证至少 `minWindow`（默认 24 帧 ≈0.8s）可看；
   前移也凑不出就放弃这一屏，继续找后文。

### 动哪些、不动哪些

- **动**：`AbstractSign` 的 `progress`、`swell` 的体量进度（`swellT`）
- **不动**：节点入场（提前入场是刻意的，否则画面空）、光点沿箭头的行进与高亮
  （那是"讲到第几步"的线索，不是语义动作）、`growth` 的逐节点长大窗口 `growWindow`

## 效果

### 1. 锚点覆盖（规则开启后的真实产出）

探针 `build-anchor-probe.ts` 打的是 LLM 在"节点必须被旁白念到"规则下产出的场景
（`out/narration-rule/new-水循环是怎么回事-1.json` 第 0 屏）：

```
场景=小水滴的旅行 relation=cycle 345 帧（语音 321 帧）
字幕页：小朋友，小水滴天天在旅行！太阳一晒，水变成水蒸气飞上天，[1-147]
        这就是蒸发。水蒸气遇冷变成小水珠，聚在一起就成了云，[160-285]
        这叫凝结。[299-314]
锚点 4/4 = 100%
  小水滴  窗口 22-160   水蒸气  窗口 121-160（rise + swell）
  小水珠  窗口 235-299  云      窗口 275-299（swell）
```

### 2. 动作进度对照（按公式复算，`storyProgress` 区间 18→317）

| 节点 | 帧 | 旧进度 | 新进度 |
|---|---|---|---|
| 水蒸气 | 121（念到"水蒸气"） | 34.4% | **0%** |
| 水蒸气 | 140（句中） | 40.8% | 48.7% |
| 水蒸气 | 160（这句说完） | 47.5% | **100%** |
| 云 | 275（念到"云"） | 86.0% | **0%** |
| 云 | 299（这句说完） | 94.0% | **100%** |

旧口径下"云"被念到时，它已经胀了 86%——孩子听到名字时变化早演完了。
新口径是"念到才开始、说完刚好演完"。

### 3. 渲染侧证据（同源受控，唯一变量是锚点开关）

`measure-anchor-diff.py` 对拍两臂逐帧像素差异（`anchorSigns: false` 关掉锚点）：

| 节点 | 动作窗 | 差异峰值（灰阶） |
|---|---|---|
| 水蒸气（rise+swell） | 121-160 | **11.69** |
| 云（swell） | 275-299 | **24.12** |
| 小水滴（无动作） | — | 0.83（噪声） |
| 小水珠（无动作） | — | 0.41（噪声） |

差异只出现在两个带动作的节点上，无动作节点在噪声级——改动没有波及其他区域。

目视（`out/anchor-probe/sheet.png`，2 节点 × 3 帧 × 2 臂）确认：水蒸气在第 160 帧
（句末）已升到顶，关掉锚点那臂到第 220 帧还在半途；云的卡片在第 280 帧明显更小
（还没轮到它胀）。

### 4. 回归（没有锚点的老场景必须逐像素不变）

默认 props（无 `actionAnchors`）渲 30 帧，与加锚点前的基线 `out/seq-big/frames` 对拍：

```
30 帧 逐像素：最大均值差 0.0005，最大单点差 4 灰阶（4 帧）
```

与既有的二次渲染抖动同量级（此前记录：5 帧 ≤3 灰阶），即无回归。

## 局限

1. **没有配音的旧任务拿不到锚点**。锚点依赖 `subtitlePages`（真实 TTS 词边界），
   无 cues 时整条不下发，行为与旧版一致。
2. **部分节点会回退**。旁白没念到的节点（如 s1 的「白云」「雨滴」）没有锚点，
   仍走 `storyProgress`。同一屏因此可能两套时间轴——根源在生成端，已由
   `docs/lesson-video-narration-graph-sync.md` 的"节点必须被念到"约束处理（覆盖 90%+）。
3. **窗口长度取决于断句**。窗口右端是字幕页边界，一句话被切得碎，动作就短。
   实测最短 24 帧（云的 0.8s），仍在"看得出变化"的范围内。
4. **光点行进仍是整屏进度**。箭头上的光点何时经过哪个节点没有跟着词走，
   这是下一步（需要按边锚定，而不是按节点）。

## 复跑

```bash
# 1. 造探针 props（真实 TTS + cues + 锚点），产出 props-cycle.json / props-cycle-off.json / meta
cd src/backend && npx ts-node --transpile-only scripts/build-anchor-probe.ts \
  --file ../video-remotion/out/narration-rule/new-水循环是怎么回事-1.json --scene 0 --tag cycle

# 2. 渲两臂
cd ../video-remotion
./node_modules/.bin/remotion render src/__preview/index.ts LessonPreview out/anchor-probe/on/frames \
  --sequence --image-format=png --props=out/anchor-probe/props-cycle.json --frames=0-344
./node_modules/.bin/remotion render src/__preview/index.ts LessonPreview out/anchor-probe/off/frames \
  --sequence --image-format=png --props=out/anchor-probe/props-cycle-off.json --frames=0-344

# 3. 对拍
cd ../backend && python scripts/measure-anchor-diff.py \
  --on ../video-remotion/out/anchor-probe/on/frames \
  --off ../video-remotion/out/anchor-probe/off/frames \
  --meta ../video-remotion/out/anchor-probe/meta-cycle.json
```

注意：`measure-anchor-diff.py` 的节点坐标只对 `relation=cycle` 成立，
换关系类型要同步改脚本里的 `NODE_LAYOUT`（与模板 `layoutGraph` 的 cycle 分支一致）。
