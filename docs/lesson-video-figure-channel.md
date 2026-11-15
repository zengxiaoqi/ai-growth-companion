# 教学视频：受控画板（figure）通道

> 状态：方案待确认，未落地。PoC 代码在 `src/video-remotion/src/__poc/`，不参与生产构建。

## 1. 要解决的问题

当前模板能把"几个概念之间的关系"画清楚（循环、链式、对比、分类、拆解），但画不出"图形本身就是知识"的内容。

实测同一句需求「介绍彩虹」：

| 情况 | 实际产物 |
| --- | --- |
| LLM 给了关系图 | 三个白框（阳光 / 水滴 / 彩虹）+ 两个箭头，彩虹是框里一个 140px 小图标 |
| LLM 没给关系图 | 一个「彩」字 + 虚线圈 + 三个绕圈的点 |

素材库里**有** `weather/rainbow.svg`，问题不在素材缺，在画布上没有"弧"这种东西。

根因：模板的视觉基本单元只有「卡片」。而彩虹、太阳系、透镜成像、地层剖面、杠杆，这些知识的基本单元是「形状」。卡片画不出形状。

## 2. 为什么不是"再补几个专用组件"

补组件等于枚举主题，永远追不上输入。正确的切分是把这件事拆成三层：

| 层 | 归谁 | 理由 |
| --- | --- | --- |
| 文字（标签、字幕、标题） | 模板 | LLM 写文字会错位、堆叠、读不出，字体也不一致 |
| 排版与节奏（谁先谁后、在哪、多大、何时出现） | 代码 | 要可复现、可缓存、批量一致、可回归 |
| **图形本身（这个知识长什么样）** | **LLM** | 这是它的知识，也是 SVG 的主场 |

之前把后两层当成一件事一起砍了：为了修"图文不对应、字幕堆叠"，把作图权全收回，只留"填 JSON"。字幕堆叠是文字问题，彩虹画不出来是图形问题，用了同一把刀。

## 3. PoC 已实测的结论

`src/video-remotion/src/__poc/` 里手写了三份 spec（彩虹 7 条 arc、太阳系 3 圈轨道 + 3 颗行星、凸透镜成像 2 条曲线 + 5 条直线 + 2 个多边形），用一块 1600×640 的画布渲染：

- 三张图都**一眼可认**
- 三张图用的是**同一套图元**，代码里没有任何一处出现"彩虹""太阳系""透镜"字样
- 生长动画（每条弧、每条光线依次画出来）不需要 LLM 参与，`reveal` 序号驱动

PoC 同时暴露了两件必须用工程手段兜住的事：

1. **`arc` 的 sweep flag 我写反了。** 数学角增大在 SVG（y 向下）里是逆时针，对应 `sweep-flag=0`；我给了 1，于是 `∩` 被画成 `∪`，弧顶跑到画面外，看着像"彩虹埋在地里"。这种错误**只能靠实拍发现**，设计文档上完全看不出来。
2. **透镜的几何我手写也错了。** 第一版光线根本没有汇聚到像顶。改成按薄透镜公式算（f=200、物距 470、像距 348、放大 0.74）才对上。

结论：**图元通道能解决问题，但它把"几何正确性"的责任转移给了 LLM。** 所以校验不能只查语法，必须查几何合理性。这是本方案最重的部分。

## 4. 数据契约

```ts
export const FIGURE_WIDTH = 1600;
export const FIGURE_HEIGHT = 640;

/** 图元白名单。没有 transform / filter / 外部引用 / text。 */
export type FigureShape =
  | { kind: 'arc'; cx: number; cy: number; r: number; from: number; to: number; stroke: string; width: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { kind: 'curve'; x1: number; y1: number; c1x: number; c1y: number; c2x: number; c2y: number; x2: number; y2: number; stroke: string; width: number }
  | { kind: 'polygon'; points: string; fill: string };

export type FigureGlyph = FigureShape & {
  /** 0..1，按这个先后顺序出现；同一数值同时出现 */
  reveal: number;
};

export type FigureLabel = {
  /** ≤ 6 字，字号与字体由模板锁定 */
  text: string;
  x: number;
  y: number;
  color?: string;
};

export type FigureSpec = {
  shapes: FigureGlyph[];
  labels?: FigureLabel[];
};
```

**坐标用 viewBox 用户单位，不用 0..100 归一化。** 原因：viewBox 内部坐标空间等比，`circle` 画出来就是正圆；一旦用 0..100 × 0..100 再拉伸到 2.5:1 的画布，所有圆都会变成椭圆。给 LLM 的说明里直接写"画布是 1600×640，中心在 (800,320)"，它对此有大量先验。

**为什么 6 种图元够。** 它们就是矢量绘图的基本集，组合能覆盖绝大多数平面示意图形：弧（彩虹/轨道/波）、直线（光轴/标尺/连线）、曲线（透镜/轮廓/轨迹）、圆（天体/粒子/节点）、矩形（地层/容器/格子）、多边形（箭头/山形/棱锥）。缺的只有"文字"和"位图"，前者由模板负责，后者是素材库。

## 5. 校验规则（`normalizeFigureSpec`，唯一入口）

不合格一律返回 `null`，绝不把脏数据带进渲染。

| # | 规则 | 失败处理 |
| --- | --- | --- |
| 1 | `kind` 在白名单内，字段齐全且为有限数（拒绝 NaN / Infinity） | 丢该图元 |
| 2 | 坐标 clamp 到 `[0,1600] × [0,640]`；`rect` 的 `w/h` clamp 到 `[8,1600]`；`r` clamp 到 `[2,1200]` | 修正而非丢弃 |
| 3 | `width`（描边）clamp 到 `[1,60]`；`reveal` clamp 到 `[0,1]` | 修正 |
| 4 | 数量：`shapes ≤ 48`、`labels ≤ 6`、每个 label ≤ 6 字 | 超出截断 |
| 5 | 颜色只接受 `#RGB / #RRGGBB`，或在 10 色主题板内挑；其他回落主题色 | 修正 |
| 6 | **几何合理性**（见下）| 整份 spec 拒绝 |
| 7 | `figure` 与 `sceneGraph` 互斥；同时存在时只取 `figure` | 丢弃 `sceneGraph` |

### 几何合理性（第 6 条，方案的核心）

自动判定"这张图是不是画歪了"，全部可计算，不需要人眼：

| 检查 | 阈值 | 拦的是什么 |
| --- | --- | --- |
| 内容 bbox 覆盖率 | 画布面积的 `12% ~ 92%` | 图形缩成一个角 / 撑爆画面 |
| 内容 bbox 居中偏移 | 中心距画布中心 ≤ 画布宽的 22% | 全挤在左半边 |
| `arc.r` 下限 | ≥ 画布高的 6% | 小到看不见的弧 |
| label 与形状 bbox 重叠 | 重叠面积 ≤ label 面积的 10% | 字压在线上读不出 |
| 图元重复度 | 完全相同的图元 ≤ 3 个 | LLM 循环刷同一条线充数 |
| 单份 spec 颜色数 | ≤ 8 | 彩虹乱涂，变成一锅脏色 |

**这几条能拦住大约七成的"明显画错"，但拦不住"比例难看"。** 这条我不打算假装能解决，见第 9 节。

## 6. 渲染规则

| 图元 | SVG 映射 | 生长动画 |
| --- | --- | --- |
| `arc` | `<path d="M… A r r 0 largeArc sweep …">`，`sweep` 由角度方向决定 | `strokeDasharray` + `strokeDashoffset` 从弧长收到 0 |
| `line` | `<line>` | 同上，长度 = 端点距离 |
| `curve` | `<path d="M… C…">` | 同上，长度用起/中/终三点折线近似 |
| `circle` | `<circle>` | `r` 从 45% 长到 100%，配 `opacity` |
| `rect` | `<rect>` | 从中心 86% 展开到 100% |
| `polygon` | `<polygon>` | `opacity` 淡入 |
| `label` | `<text textAnchor="middle" fontSize=34>` | 淡入 + 上移 14px |

时间轴：与字幕同一条。

```
progress = clamp01((frame - 10) / max(20, duration - 22))
revealAt(v) = v / maxReveal * 0.84        // 最后一个图元也留够生长窗口
shapeProgress(v) = clamp01((progress - revealAt(v)) / 0.16)
```

`reveal` 只表达**先后**，不表达时长。LLM 填 0/1/2/3 和 0/0.1/0.2/0.3 效果一样，避免它去猜帧数。

配套约束：`figure` 场景强制 `backgroundStyle = 'neutral'`（不放树、不放太阳、不放地平线），图形是主角，背景不能再抢。

## 7. 降级链

```
figure 合法  → FigureStage
      ↓ 非法 / 缺失
sceneGraph 合法 → SceneGraphStage（现有六种关系）
      ↓
DomainVisual / TopicVisual（现有装置）
      ↓
首字 + 虚线圈（现有兜底，最差情况，不空屏）
```

每一跳都写一次 `storage/storyboard-signals.jsonl`，记 `figure: missing | invalid` 和拒绝原因。这是后续判断"要不要扩图元"的唯一依据，不靠感觉。

## 8. LLM 侧接法

`generate-video-content` 的分镜 schema 增加可选字段：

```json
{
  "visualMode": "figure | graph | scene",
  "figure": {
    "shapes": [{ "kind": "arc", "cx": 800, "cy": 640, "r": 490, "from": 4, "to": 176, "stroke": "#E5484D", "width": 34, "reveal": 0 }],
    "labels": [{ "text": "水滴", "x": 250, "y": 520 }]
  }
}
```

`prompt` 里给三条判定问句，让 LLM 自己选 `visualMode`：

1. 把这段知识画成一个图形，**图形本身**就能说明它吗？→ `figure`
2. 这段知识讲的是**几个概念之间的先后/分类/对比/循环**吗？→ `graph`
3. 有没有一个具体的动物、人物、实物在场景里动？→ `scene`

再加一条硬规则：`figure` 里不许出现任何文字表达概念的解释，只有位置标签（"物体""像""太阳"这种名词，不超过 6 字）。解释一律走字幕。

给一个 few-shot（就是彩虹那份 spec），并注明：**画布 1600×640，原点左上，中心 (800,320)；弧的圆心压在画布底边之外（cy > 640）才能画出宽拱。**

## 9. 接入改动清单

| 文件 | 改动 | 约行数 |
| --- | --- | --- |
| `src/backend/src/modules/learning/video/figure-spec.ts` | 新建：类型 + `normalizeFigureSpec` + 几何校验 + `describeFigureGrammar()` | ~320 |
| `src/backend/src/modules/learning/video-generation-agent.service.ts` | 类型扩展、`FigureStage` 组件、场景装配、路由分支、信号记录 | ~260 |
| `src/backend/src/agent-framework/tools/impl/generate-video-content.ts` | storyboard schema 加 `visualMode` / `figure`，prompt 加三条判定 | ~40 |
| `src/backend/scripts/check-generated-lesson-tsx.js` | 断言：六种图元各有实现、生长动画存在、`revealAt` 存在 | ~15 |
| `src/backend/test/unit/figure-spec.spec.ts` | 新建：脏输入、clamp、几何拒绝、颜色收敛，约 18 例 | ~200 |

合计约 835 行，一次提交可完成。分两期更稳（见第 11 节）。

## 10. 验收标准

方案要算"解决问题"，必须能过这几条，否则回滚：

**硬指标（自动判定）**

1. 「彩虹」主题渲染出来是**一道弧**，不是卡片。人工盲测 3 人，全部认出是彩虹。
2. 现有六种关系（cycle / chain / growth / compare / group / split）与动物场景**逐帧不变**：改动前后抽同一帧做像素对比，差异为 0。
3. 20 条真实主题跑一遍，`figure` 通道占比落在 `25% ~ 60%`。低于 25% 说明 LLM 不敢用（prompt 判定无效）；高于 60% 说明它在滥用（什么都想画图）。
4. `figure` 被拒率 < 20%。高于 20% 说明几何阈值定得不对或 LLM 输出需要更多 few-shot。
5. `check:lesson-template` 0 错，`tsc --noEmit` 通过，单测全绿。

**人工核对（5 个主题）**

彩虹、太阳系、凸透镜成像、地球分层、杠杆原理 —— 逐帧看构图、比例、是否可读。

## 11. 风险与不解决的部分

| 风险 | 概率 | 影响 | 兜底 |
| --- | --- | --- | --- |
| 图形比例难看（画歪了但没越界）| **高** | 观感差，但不至于看不懂 | 几何阈值只能拦明显错误；剩下的靠 few-shot 和后续收 miss 数据 |
| 复杂机械结构画不准（齿轮啮合、3D 透视）| 高 | 这类主题仍退化成卡片 | 不做，坦率说明这类内容不在能力范围 |
| LLM 滥用 figure（什么都画图）| 中 | 画面变成图解堆砌 | 硬规则：一节课里 `figure` 场景 ≤ 总场景数的 40%，超出降级 |
| 图元仍不够（需要填充多边形、虚线、箭头标记）| 中 | 部分图形画不全 | 第二期按 miss 数据加 `path`（受限）和 `dash` 属性 |
| 校验过严导致频繁降级 | 中 | 白做 | 阈值先松后紧，用 20 条真实数据校准 |

**明确不解决：** 3D、光影、材质、透视投影；照片级真实感；任何需要用位图而不是矢量的内容。这些是另一个量级的问题（要么买素材，要么接生图模型），不在本方案范围内。

## 12. 分期建议

| 期 | 内容 | 完成标志 |
| --- | --- | --- |
| A（先做，约 500 行） | 类型 + 校验 + `FigureStage` + 路由 + prompt + 测试 | 彩虹/太阳系/透镜三个主题能出片，现有场景零回归 |
| B（看 A 的数据） | 按 `storyboard-signals` 的 miss 记录补图元（`path` / `dash` / `arrow`）| 拒绝率降到 10% 以下 |
| C（可选） | 几何比例模板化：给常见结构（拱、同心圆、剖面、光路）内置角度/比例约束 | 图形审美稳定 |

## 13. PoC 代码

`src/video-remotion/src/__poc/`：

- `figure-spec.ts` — 数据契约
- `FigureCanvas.tsx` — 渲染器（140 行，可直接搬进模板）
- `specs.ts` — 三份手写 spec
- `Root.tsx` / `index.ts` — 三个独立 composition

渲染命令：

```bash
cd src/video-remotion
npx remotion still src/__poc/index.ts PocRainbow out/rainbow.png --frame=145
npx remotion still src/__poc/index.ts PocSolar   out/solar.png   --frame=145
npx remotion still src/__poc/index.ts PocLens    out/lens.png    --frame=145
```

这些文件不注册到生产 entry，不影响现有渲染。
