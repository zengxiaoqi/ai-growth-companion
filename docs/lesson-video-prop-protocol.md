# 道具生成：从"选一个"到"画一个"

> 状态：**已实施（§14 实施记录）** —— 代码见 `prop-art.ts` / `prop-glyph.tsx` / `prop-contract.ts` / `prop-resolver.ts`
> 本文替代 v1《道具协议》：v1 主张"补 12 个手绘道具"，那是把长尾当成短表，已作废（§0.1）。
> 前置阅读：`docs/lesson-video-venue-recipes.md`（同一套"枚举原语、不枚举内容"的思路）

## 0. 结论先说

**道具是唯一还没接上"生成"链路的资产类型。**

| 资产 | 现在怎么来 | 封闭吗 |
|---|---|---|
| 场地 | 配方数据 + 装饰组件 | 开放（加配方即可，已落地） |
| 角色 | `ACTOR_RIGS` 参数化几何 | 半开放（14 种，加一种要写参数） |
| 关系图节点 / 画板图标 | `resolveSubjectIcon`：矢量库 → **LLM 现画 SVG** → 文生图 → 占位 | **开放** |
| 道具 | `SCENE_PROP_KEYWORDS` 10 项 + `PropArt` 10 个 `if` | **封闭** |

也就是说：`asset-gen.service.ts` 里已经有一套"根据名字当场生成素材"的机制——
LLM 画 SVG → 结构校验 → 视觉验收 → 磁盘缓存 → 失败降级，全部现成。
道具只是**没接上去**，而是坚持用一张 10 行的词表在猜。

所以这件事不需要新造架构，需要的是两处改造：

1. **识别开放**：分镜直接声明"这一幕有哪些道具"（自由字符串），不再靠词表猜；
2. **绘制开放**：把声明的名字交给已有的 `AssetGenService`，产物内联进画面。

**验收标准**：给一节新课写"小熊把水倒进**洒水壶**，再浇给**向日葵**"，
不改一行代码，画面上就该有洒水壶和向日葵。改完后 `git diff` 不应出现任何
`if (id === ...)`。

## 0.1 v1 错在哪（记录，避免再犯）

| v1 的主张 | 为什么错 |
|---|---|
| 首批补 12 个手绘道具 | 3-6 岁课程涉及的物品种类以百计且在变；12 个只是把"10 项的坑"挖到"22 项" |
| `PROP_RECIPES` 当"道具清单" | 清单本身就是枚举。别名表还要人工维护同义词，永远滞后于文案 |
| `PROP_ART: Record<id, fn>` | 换汤不换药：`if` 链变成查表，但新道具仍要**写代码 + 发版** |
| 以"语料里没有水桶"为证据说"等课例" | §1.4 说清了：这是反向选择——词表不认的词，分镜就不敢写，所以永远等不到 |

v1 里可用的部分保留：诊断（§1）、尺寸协议（§5.4）、渲染层搬出模板字符串（§8）、
`PROP_KINDS` 语义拆分（§8.3）。

## 1. 现状：四张表 + 一条 `if` 链

### 1.1 谁在管道具

| 位置 | 内容 | 问题 |
|---|---|---|
| `SCENE_PROP_KEYWORDS` | 10 id × 别名，`source.includes(kw)` | 封闭；子串无边界 |
| `SCENE_PROP_LABELS` | 手抄第二份 id 清单 | 加 id 要记得改两处 |
| 模板字符串里的 `PropArt` | `if (id === "ball") …` 十连，兜底 `return null` | 画不出就是空 `<g>`，静默 |
| `extractItemsFromText` | 第三份 22 项词表（气球/西瓜/笔） | 只喂图片提示词，不进画面 |
| `PROP_KINDS = ['slide','ball']` | 名为"道具清单"，实为"3D mesh 清单" | 语义混淆，挡住 2D 道具增长 |

### 1.2 实测：五个句子五个错

对现行词表直接求值（`node -e`）：

| 输入 | 现在 | 应该 |
|---|---|---|
| 小熊把苹果放进**水桶**里 | `apple` | apple + bucket |
| 孩子背着**书包**去上学 | `book` ❌ | schoolbag |
| 它抬起头看着**地球仪** | `ball` ❌ | globe |
| let us **start** the game | `star` ❌ | 无 |
| 小熊拿着**风筝**跑 | （无） | kite |

漏、错、静默，三样齐了。

### 1.3 尺寸也是封闭的

`stage-layout.ts`：`PROP_SIZE = ACTOR.standHeight * 0.57 ≈ 0.95`（≈ 熊的胸口高）。
所有道具共用 → 苹果和桌子一样高；手上另硬编码 `carry.size = 0.36`，同一道具两个尺寸。

### 1.4 为什么"等真实课例再补"等不到

`docs/` 与 fixture 全量统计：苹果 65 次、皮球 31、绘本 14、篮子 5、气球 4、书包 2，
水桶/风筝/雨伞/杯子/毛巾/铲子/球拍 **各 0 次**。

不是内容偏好，是反向选择：词表不认的词写进分镜等于白写（还占 260 字的旁白预算），
所以文案自己绕开了。**清单永远等不到激活它的语料。**

### 1.5 已有的生成链路（本次要复用的）

```
resolveSubjectIcon(subject)
  ├─ 矢量库精确命中（character / overlay 两栏）      ← 便宜、零调用
  └─ assetGen.generateSubjectIcon(subject)
       ├─ 磁盘缓存命中（sha1(subject+STYLE_VERSION)）  ← 跨课复用
       ├─ 层1 LLM 现画 SVG → validateGeneratedSvg → rasterize → visionAccept
       ├─ 层2 文生图（IMAGE_GEN_*，未配置则关闭）→ visionAccept
       └─ 全失败返回 null → 调用方占位
     并发 3、单次 90s 超时；调用方逐次预算 6（`MAX_GEN_PER_CALL`）、miss 落日志
```

`drawSvg` 的提示词已经把风格钉死了，且**正好是道具需要的**：

> 扁平儿童插画风格：粗深色轮廓、圆润造型、纯色填充，颜色 ≤ 6 种；
> 主体居中、占画面 60%~85%，一眼能认出是「X」；背景透明；
> 禁止文字/渐变/滤镜/阴影/外部引用/脚本；元素 ≤ 40，只用 path/circle/ellipse/rect/line/polygon/polyline/g

`validateGeneratedSvg` 已经禁掉 `script/foreignObject/image/use/text/filter/style`
与 `href=/on*/url(/data:`——也就是说**产物天生可以安全内联**（§5.3）。

## 2. 目标（可检验）

| # | 目标 | 判据 |
|---|---|---|
| G1 | **零白名单** | 新增一个名词不需要改代码；仓库里不再有"道具 id 清单" |
| G2 | **正确性有判据** | 结构校验 + 视觉验收；不通过不进画面 |
| G3 | **确定性** | 同一份分镜重渲逐字节一致：几何随场景下发，不再调模型 |
| G4 | **失败可见** | 画不出来 → 占位件 + `warn`（带幕号与名字），不静默 |
| G5 | **老课不变** | 现有分镜渲染结果字节一致（除非显式开关） |

## 3. 架构：三阶段，责任分开

```
创作期（LLM）            装配期（后端，一次）                     渲染期（纯函数）
──────────────────────────────────────────────────────────────────────────────
分镜写 props[]      →   1. 名字规范化 / 同名词合并
 {name, heightRatio,    2. 库命中？asset-gen 生成（并发+预算）
  place, holder}         3. 校验 + 视觉验收 + 重画 1 轮
                        4. 读出 SVG markup，消毒、去外层 <svg>
                        5. 结果写进 scene.props[].glyph ←──────────→  <PropGlyph />
                     失败 → 占位件 + warn（不阻塞出片）
```

### 3.1 为什么不在渲染帧里调模型

Remotion 逐帧渲染、多进程并行、要求确定性：

| 若在帧内生成 | 后果 |
|---|---|
| 1080 帧 × N 道具 | 上千次调用，出片从 3 分钟变几小时 |
| 并行 worker 各调一次 | 同一帧不同 worker 得到不同图 → 画面抖动 |
| 网络抖动 | 某一帧渲染失败 → 整片重渲 |
| 内容哈希缓存 | 缓存键算不出来（产物不确定），每次都要重渲 |

所以"实时"落在**装配期：每课自动生成，零人工介入**。对使用者而言同样是
"分镜写完，出片就有那个道具"，只是不在帧循环里做。

### 3.2 数据形状

分镜（作者写）：

```ts
type ScenePropUse = {
  /** 自由字符串，1..12 字。没有白名单 */
  name: string;
  /** 占孩子身高的比例，0.08..0.9。缺省 0.35 */
  heightRatio?: number;
  /** 出现在哪：手里 / 地上 / 身上 */
  place?: 'hand' | 'floor' | 'worn';
  /** 手持时在谁手里（actor.id），缺省这一幕的主角色 */
  holder?: string;
};
```

装配产物（渲染器吃）：

```ts
type ScenePropGlyph = {
  id: string;            // 规范化后的名字（用于同课一致性断言）
  label: string;         // 中文名，用于标签/气泡
  size: number;          // 世界单位高度 = ACTOR.standHeight × heightRatio
  /** 内联几何：已消毒、不含外层 <svg> */
  markup?: string;
  /**
   * markup 的绘图盒边长（内置 160 / 生成 256）与"内容占盒高的比例"
   * （内置画满 1.0 / 生成约 0.75）。这两个数是"尺寸换算"的参数，
   * 不是"道具种类"的枚举——换任何道具都只有这两个数。
   */
  canvas: number;
  fill: number;
  /** 生成失败时的兜底形态 */
  fallback?: 'placeholder';
  source: 'builtin' | 'library' | 'generated' | 'placeholder';
};
```

`markup` 随场景一起进 props JSON，渲染层不需要网络、不需要读库、不需要知道"水桶"是什么。

## 4. 识别：让分镜声明，不让词表猜

### 4.1 契约变更

`video/author-contract.ts` 的 `AuthorScene` 加：

```ts
props?: Array<{
  name: string;
  heightRatio?: number;
  place?: 'hand' | 'floor' | 'worn';
  holder?: string;
}>;
```

分镜提示词加一条（只讲"要声明什么"，不给例子清单）：

> 这一幕画面里出现、且孩子需要看见的实物，写进 `props`：`name` 用孩子听得懂的
> 具体名词（≤12 字，不要写"东西""物品"这类泛指），`heightRatio` 是它占角色身高
> 的比例（苹果 ≈ 0.1，水桶 ≈ 0.22，桌子 ≈ 0.55），`place` 说明在手里还是地上。
> 每幕最多 3 个，只写旁白/画面描述里真的出现的。

为什么这是"开放"的：

- `name` 是自由字符串，模型的语言理解本来就是它最擅长的部分（"水桶""洒水壶"
  "向日葵"它都认识），不需要我们提供词表；
- 我们不枚举"有哪些道具"，只枚举"出现在哪里"（`place` 三档）——那是空间关系，
  不是内容；
- 模型写错/写多，有下界兜底：`heightRatio` clamp、每幕 ≤3、VLM 的图文对应检查
  （`visual-qa` 的 rubric #1）会抓"画面有桶但旁白没提"。

### 4.2 老分镜怎么办

现有分镜没有 `props`。保留 `SCENE_PROP_KEYWORDS` 作为**遗留适配器**：

- 只在"没有 `props` 字段"时跑；
- 结果换算成 `ScenePropUse`（`heightRatio` 全部 0.55，与现行 `PROP_SIZE` 等价）；
- 顺手修掉子串误判（最长命中 + 英文词边界），让"书包/地球仪/start"不再出错；
- **不再新增别名**，也不要求新分镜走它。

这样老课渲染字节不变（G5），新课完全走声明路径，适配器随老任务自然淘汰。

### 4.3 词表 bug 归到适配器

`书` 命中书包、`球` 命中地球仪、`star` 命中 start —— 都是 `includes` 的病。
修法：别名按长度降序占位匹配 + 英文 `\b` 边界（约 30 行纯函数，可单测）。
修在新路径不生效，但老课因此少一处错。

## 5. 绘制：接 asset-gen，不新建绘制表

### 5.1 复用（不写新代码的部分）

| 环节 | 现成实现 |
|---|---|
| 画 | `AssetGenService.drawSvg`（提示词见 §1.5） |
| 验结构 | `validateGeneratedSvg`（禁文字/脚本/外链/滤镜，元素 ≤60，形状 ≥2） |
| 验外观 | `visionAccept`（"主体可辨认 + 扁平风格 + 无文字垃圾"） |
| 缓存 | `cacheKey(subject)` + `generated/assets/` + manifest |
| 并发/预算 | `withSlot`（3 并发）、`MAX_GEN_PER_CALL = 6` |
| 运营信号 | `recordAssetMiss`（miss 分类，供后续扩库） |

### 5.2 需要新增的（很少）

1. `AssetGenService.loadSubjectSvg(subject): Promise<string | null>`
   —— 复用 `generateSubjectIcon`，读 `filePath`；**只在 `layer === 'svg'` 时返回**，
   否则 `null`（层2 是 PNG，见 §5.3）。
2. `generateSubjectIcon(subject, { svgOnly?: boolean })`
   —— 道具走 `svgOnly`，跳过文生图层（白底会毁画面，§5.3）。
3. 装配期新模块 `video/prop-resolver.ts`：
   - 收集全课 `props`，去重（同名只生成一次，跨幕共用同一份 markup）；
   - 并发解析，命中缓存不再调用；
   - 失败按 §6 降级；
   - 输出 `ScenePropGlyph[]`。
4. 渲染层 `character/PropGlyph.tsx`（§8）。

### 5.3 为什么内联 markup，而不是 `<Img>` / `<image>` / 文生图

| 方案 | 否决原因 |
|---|---|
| `<Img src>` | 道具画在 `Puppet2D` 的 `<svg>` 内、世界坐标里，HTML `<Img>` 塞不进去 |
| `<image href>` | 异步加载：每幕要 `delayRender`/`continueRender`，文件一缺就是白图且不报错；位图放大还糊 |
| base64 内联 PNG | 位图 + props JSON 膨胀（每道具 10-20KB × 8 幕），缩放会糊 |
| **内联 SVG markup** | 矢量、随 ppu 缩放不糊、无异步加载、无文件依赖；`validateGeneratedSvg` 已禁掉一切可执行/外部引用，内联安全 |

**文生图（层2）为什么不用**：它的提示词要求"pure white background"，贴到草地/地板上
就是一个白方块；去背又引入不确定性。所以道具只走层1（SVG），层1 失败直接降级——
这比"得到一个白底方块"诚实。

### 5.4 尺寸与"拿在手里"

- `size = ACTOR.standHeight × heightRatio`（世界单位），clamp `[0.08, 0.9]`；
- 生成产物的画布固定 `viewBox="0 0 256 256"`，主体占 60%~85% → 取
  `fill = 0.75` 作为"内容高度/画布高"的近似，`scale = size × ppu / (256 × 0.75)`；
  内置 10 个画满 160 盒，`fill = 1.0`（所以它们迁过来大小不变）；
- 垂直锚点：假定内容居中（画布中线 ±37.5%），底边贴地；水平居中。
- 这两个"假定"是本方案最不精确的地方（误差 ±15%），由 §10.2 的 gallery 人工校准；
  想要精确，需要 PNG 解码算 alpha 包围盒（当前依赖里没有解码库），列为后续项。
- `place === 'hand'` → 走 `Puppet2D` 的 `carry`（`size` 由配方给，不再硬编码 0.36）；
  `floor` → 走世界坐标 `props`；`worn` 本轮不实现（记 warn）。

### 5.5 与场地装饰的边界

现在有一条特例：`scene.setpiece !== 'slide'` 时不摆滑梯图标（"公园里已经有一座真的了"）。
一般化为：**若道具名同时是本幕场地装饰的资产名，则不摆图标**，避免"森林里再贴一张树"。

## 6. 正确性闸门（四层，从便宜到贵）

| 层 | 判据 | 失败动作 |
|---|---|---|
| L1 结构 | `validateGeneratedSvg` + 道具附加：至少 1 个填充形状、非全黑/全白、无满幅 `<rect>`（背景）、`name` 长度与字符集 | 重画 1 轮（复用 `figure-repair` 的"带拒绝原因重画"模式） |
| L2 视觉 | `visionAccept`：主体在场可辨认 / 扁平风格 / 无文字垃圾 | 同上，最多 1 轮；仍不过 → L3 |
| L3 降级 | 占位件：圆角盒 + 中文名首字，`source: 'placeholder'` | `warn` + 计入 miss 日志 |
| L4 人工 | `prop-gallery.png` 抽检；条目带 `status: auto / approved` | `approved` 的进"精品库"，后续同类名词优先复用 |

L1 的重画循环很关键：LLM 画不好通常是"忘了禁项"或"画歪了"，把拒绝原因喂回去
命中率明显更高（`figure-repair` 已验证这条路）。

**不做的事**：不让模型"自我评价画得像不像"——它对自己画的图没有判断力。
判断交给看图的那一层（`visionAccept` 用的是 vision 模型 + PNG，不是文本自省）。

## 7. 一致性与沉淀

- **同课一致**：同一个 `name` 在全课只解析一次，所有幕共用同一份 markup
  （测试断言：逐幕比较 markup 字符串相等）；
- **跨课一致**：`asset-gen` 磁盘缓存以 subject 为键，水桶这节课画的，下节课还是它；
- **人工可控**：`generated/assets/generated/` 下的文件可直接替换（换成美术画的），
  文件在、缓存键在，出片就用新的——**库是唯一真源**；
- **运营信号**：miss 日志本来就记 `reason/nearest`，等它攒够就能看出"哪些名词
  反复画不出来"，那时再考虑给高频名词做精品化，而不是一开始就枚举。

## 8. 渲染层改动（很小）

### 8.1 一个组件，两个来源，零分支

```tsx
// character/PropGlyph.tsx
export const PropGlyph: React.FC<{ glyph: ScenePropGlyph; ppu: number }> = ({ glyph, ppu }) => {
  // 世界坐标已由调用方定位；这里只做"尺寸换算 + 底边贴地"
  const k = (glyph.size * ppu) / (glyph.canvas * glyph.fill);
  // 半盒宽/内容底边，同一套公式对 160 盒（内置）与 256 盒（生成）都成立
  const half = glyph.canvas / 2;
  const bottom = half + half * glyph.fill;
  if (glyph.markup) {
    return (
      <g transform={`scale(${k}) translate(${-half} ${-bottom})`}>
        <g dangerouslySetInnerHTML={{ __html: glyph.markup }} />
      </g>
    );
  }
  return <PlaceholderGlyph label={glyph.label} k={k} />;   // 唯一"画出来"的分支
};
```

注意 `canvas` / `fill` 是**两个数字**，不是两个分支：内置道具（160 盒、画满）与
生成道具（256 盒、主体占 75%）走同一行代码，这正是第 1 步能保住字节一致的原因
——把内置的 `-80..80` 按 `translate(128 128) scale(1.6)` 包一层进 256 盒，
DOM 与今天逐节点相同，`cmp` 才会是 0。

没有 `if (id === 'bucket')`，也没有 `Record<id, fn>`。新增道具 = 新名字，不新增代码。

### 8.2 搬出模板字符串

`PropArt` 现在住在 `buildGeneratedLessonTsx()` 的 `String.raw` 里，`check:lesson-template`
只做语法转译（不解析 import），类型错误与空分支都拦不住，也不能在 Studio 单看。

- 新建 `character/prop-glyph.tsx`，加进 `sync-three-stage.cjs` 的 `SOURCES`；
- 模板改为 `import { PropGlyph } from "./character/prop-glyph"`；
- 现有 10 个道具转成 **builtin markup**（原 JSX 的 SVG 片段原文，`<g>` 换成字符串），
  走同一条渲染路径——这样"自带道具"和"生成道具"没有两条代码路径。

### 8.3 `PROP_KINDS` 拆语义

```ts
/** 有 3D mesh 的道具（能进三维舞台），不表示"有哪些道具" */
export const PROP_MESHES = ['slide', 'ball'] as const;
/** 每个 3D 动作需要哪个道具 */
export const MOTION_PROP: Record<Action3DMotion, string> = { slide: 'slide', dribble: 'ball' };
```

## 9. 迁移顺序

| 步 | 做什么 | 判据 |
|---|---|---|
| 1 | `PropGlyph` + builtin markup；模板改 import；`PROP_KINDS` 拆分 | 现有 4 帧**字节一致**（`cmp`） |
| 2 | 别名匹配修 bug（最长命中/词边界），仍在遗留适配器里 | 5 条实测句式全对；老课字节一致 |
| 3 | 契约加 `props[]` + 提示词；`prop-resolver` 接 `asset-gen`，**开关默认关** | 开关关：字节一致；开关开：指定用例出道具 |
| 4 | 尺寸协议（`heightRatio` → `size`，carry 用同一 `size`） | 画面会变，单独 commit + 抽帧验收 |
| 5 | 灰度开启，监控 miss 率与 vision 拒绝率 | 20 个随机名词通过率 ≥ 80% |
| 6 | 升 `RENDERER_SCHEMA_VERSION`：`venue-v2 → prop-v1` | 缓存不再命中旧片 |

第 3 步的开关（`PROP_GEN=off|on`）很重要：生成链路出问题时回滚是配置，不是发版。

## 10. 验证

### 10.1 单测

- `prop-resolver.spec.ts`：同一个 name 全课只解析一次；失败落到占位并 warn；
  `heightRatio` 越界 clamp；同名不同幕 markup 相等。
- `prop-contract.spec.ts`：`props[]` 规范化（长度、字符集、每幕 ≤3）；老分镜没有
  `props` 时不报错、走适配器、结果与今天等价。
- `prop-markup.spec.ts`：注入安全——含 `<script>`/`on*=`/`href=`/`<image>` 的
  markup 一律拒绝（`validateGeneratedSvg` 已有规则，这里做回归）。
- `prop-match.spec.ts`：§1.2 五条句式（含反例：必须**不**出现什么）。

### 10.2 探针（调 prompt 用）

`scripts/probe-prop-draw.ts --names 水桶,洒水壶,风筝,向日葵,地球仪,书包`

输出：每个名字的 SVG、vision 判定、耗时、是否命中缓存，并拼一张
`prop-gallery.png`（旁边画一只 1.67 的熊做标尺）。

这张图是**唯一需要人看的东西**——20 个名词摆一屏，风格是否统一、
尺寸是否离谱，一眼就知道。

### 10.3 成本

| 项 | 估算 |
|---|---|
| 每课新道具 | 2~4 个（库命中的不调用） |
| 每次生成 | 1 次文本（4k tokens）+ 1 次 vision（1k），约 5~10s |
| 增量时延 | +10~20s（并发 3），相对出片 2~5 分钟可忽略 |
| 稳态 | 缓存命中后 0 调用 |

## 11. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| LLM 画的桶"像个桶但很丑" | 风格不如手绘 | 提示词已是扁平粗描边；内置 10 个作为风格基线；gallery 抽检 |
| 同一名词两次生成不同图 | 跨课不一致 | 磁盘缓存 + 装配期只解析一次；清缓存会改变画面（写进运维说明） |
| vision 假阳性（画错了也算过） | 画面有怪东西 | `status: auto` 标记 + gallery 定期抽检；QA rubric #1 兜底 |
| 生成失败率高（模型不稳） | 大量占位件 | 重画 1 轮 + 占位不阻塞；miss 率进监控，超阈值就回滚开关 |
| `fill = 0.75` 的假定不准 | 大小差 ±15% | gallery 校准；后续用 alpha 包围盒精确化 |
| 分镜乱写道具（旁白没提） | 画面多出东西 | 每幕 ≤3 + VLM 图文对应检查 |
| 内联 markup 有安全隐患 | —— | `validateGeneratedSvg` 已禁 script/text/image/use/filter/href/on*；属性再走一遍白名单 |
| 老课因改动漂移 | 缓存与新画面不一致 | 第 1、2 步以 `cmp` 字节一致为准；第 4 步升 version |

## 12. 决策点

| # | 问题 | 我的主张 | 反过来会怎样 |
|---|---|---|---|
| A | 生成通道 | **只用层1 SVG**（内联）；层2 文生图不用于道具 | 用文生图：白底方块毁画面；去背引入不确定性 |
| B | 识别来源 | **分镜声明为主**，旧词表退为遗留适配器（只读、不再扩） | 继续靠词表猜：回到枚举，且永远滞后 |
| C | 生成时机 | **装配期同步**（+10~20s），带开关灰度 | 异步补生成：要先出片再改片，等于两次渲染 |
| D | 人工闸门 | **`auto` 直接上线** + gallery 抽检 | 每件必审：批量出片被卡死 |
| E | 尺寸是否本轮启用 | **启用**，但单独 commit（第 4 步） | 不启用：苹果继续半人高，生成得再对也不像 |

## 13. 与"AI 实时生成"的关系（回答常见疑问）

- **是不是每次渲染都调模型？** 不是。生成在装配期做一次，几何随场景下发，渲染是纯函数。
  这是 Remotion 确定性渲染的硬约束，也是缓存能成立的前提。
- **那还算"实时"吗？** 对使用者算：分镜写完、出片时就有，不需要有人去画、去配表、去发版。
- **为什么不干脆让模型写整段 TSX？** 仓库里确实有那条路（`agent-remotion` 写
  组件源码），但产线明确以"内置模板 + 数据"为唯一渲染路径（`lesson-video-queue`
  的注释写死了这一点）。道具走数据 + 通用渲染器，是这条路径上能做到的最开放形态。
- **和文生图什么区别？** 这里要的是"矢量、透明、能缩到 150px 也清楚、能进世界坐标
  跟着镜头缩放"的小物件。文生图擅长的是整幅画面，不是可复用的单个小图标。

## 14. 实施记录（已落地）

按 §9 的六步走完，落成四个模块：

| 文件 | 职责 |
|---|---|
| `videoRemotion/character/prop-art.ts` | **几何数据**：10 条内置 markup、尺寸标定表、`builtinPropGlyph` |
| `videoRemotion/character/prop-glyph.tsx` | **渲染器**：`PropGlyph`（换算尺寸+底边贴地）、占位件 |
| `backend/.../video/prop-contract.ts` | **契约**：`props[]` 规范化（数量/长度/比例/位置）、`PROP_GEN` 开关 |
| `backend/.../video/prop-resolver.ts` | **装配**：整课去重、调 asset-gen、失败降级占位 |
| `videoRemotion/character/prop-lexicon*` | 旧词表退为**只读兼容层**（`backend/.../video/prop-lexicon.ts`） |

### 14.1 与原方案的偏差（每处都有理由）

| 方案 | 落地 | 为什么 |
|---|---|---|
| `PropGlyph({glyph, ppu})` | `PropGlyph({glyph, height})` | 徽章/特写分支没有 ppu（固定画布），而世界道具的 `size × ppu` 是调用方的事。两种传法只差一个数字，仍是同一行换算 |
| 单文件 `prop-glyph.tsx` | 拆成 `.ts`（数据）+ `.tsx`（渲染） | 后端 tsconfig 不认 JSX；拆开后"10 条几何有没有被注入脚本"这类断言不需要渲染就能跑。与场地那套（recipes/assets）一致 |
| `canvas/fill` 由生成产物决定 | `canvas` 取实际 viewBox，`fill` 固定 0.75 | 模型偶尔不按 256 画，按实际值走才不会被缩成"特别小"；fill 要精确得解 PNG alpha 包围盒（依赖里没有解码库） |
| 词表 `书`→书包、`球`→地球仪 一并修正 | **刻意不修** | 试过"单字名词右侧紧跟汉字即复合词"，`把球踢远了` 被误杀。修它需要分词，而这条路径正被声明式道具取代——已在 `prop-lexicon.ts` 与测试里写明，避免反复"修" |
| 3D 道具扩展 | 本轮不做，只拆语义 | `PROP_KINDS` → `PROP_MESHES` + `MOTION_PROP`：它一直只是"三维 mesh 清单" |

### 14.2 验收（实测数字）

- **开关关，老课字节一致**：5 帧 `cmp` 全等（10 个 glyph 一屏的 gallery、徽章分支
  `point`、cross-venue 60/210、night 60）。这是第 1、2 步的判据，也保证"没开开关的
  课不会被这次改动碰到"。
- **开关开，端到端跑通一例**：分镜写 `props:[{name:"水桶",place:"hand"}]` → 出片里
  水桶握在熊手里（生成物 464B，vision 通过）；同一幕声明但未生成的"向日葵"显示
  带首字的虚线占位件，没有静默消失。
- **单测 159 项 / 10 个套件**：新增 `prop-art`(12) / `prop-lexicon`(10) /
  `prop-contract`(17) / `prop-resolver`(10)；`asset-gen` 34 条里 7 条是重画与预算
  判断（含"预算被吃光不重画""截断但正文完整照收"两条防回退）。其中两条是防回退的
  ——模板里不许再出现 `if (id === "...")`、后端"不走生成"的集合必须与渲染层自带
  几何的集合完全相等。
- **尺寸**（第 4 步，画面会变）：`cross-venue` 第 1 幕的苹果从"和熊上身一样高"
  变成真正一颗苹果大小，底边仍贴地；双人抬积木没有穿模。

### 14.2.1 踩到的坑：矢量库清单是 gitignore 的

`npm run assets:vector` 下载的 `public/assets/vector/manifest.json` 被
`.gitignore:30`（`src/video-remotion/public/assets/*`）覆盖。跑过这个脚本的机器上，
**角色解析会先命中矢量库**（`provider:'vector'`、`assets/vector/animals/<id>.svg`），
而 CI 是干净检出，走的是 `assets/lesson/animals/*.svg`（`provider:'local'`）。

后果是 `video-generation-agent.service.spec.ts` 和 `visual-asset.service.spec.ts`
共 6 条用例一红一绿，与本机装没装矢量库绑定。对照实验（同一份代码，只切 manifest
存废）：有清单 → 2+4 红；无清单 → 全绿。已改成"断言只关心自己真正关心的事"
（provider 用 `local|vector` 匹配、路径用 `/animals/.+\.svg$/`；只测本地/外部顺序的
用例直接把 `resolveVectorAsset` 打桩成 null）。

顺带记一条判断方法：遇到素材相关断言变红，**先看 `public/assets/` 下有没有
未跟踪的生成物**，再怀疑代码。

### 14.3 通过率：根因是 token 预算，不是"模型不听话"

**症状**：探针跑 12 个名字只画出 2 个（17%），日志一律 `layer1 returned no SVG`，
而且回包样本（前 160 字）是**空串**。第一版判断是"模型在写说明文 / 不按格式返回"，
于是先做了「带拒绝原因重画一轮」——**没用**，第二轮拿到同样的空串。

**真因**（给日志加 `finish=` 字段、再裸调一次看原始回包才看出来）：

| 观测 | 值 |
|---|---|
| `finishReason` | `length`（不是 `stop`） |
| `completionTokens` | 4096 —— 正好顶到 `maxTokens` |
| `content` | `""`，而且**没有** think 块 |

`LLM_AUTHOR_MODEL=deepseek-v4.1-flash` 是思考型：4096 全花在 reasoning 上，正文一个
字都没开始写就被截断。`stripThinking` 剥不出东西，是因为 content 本来就空——之前
"剥掉 think 块就修好了"那次的成功是偶然，样本为空才是常态。

**修法**（两处，都不放宽校验）：

1. 层1 输出预算 4096 → `SVG_MAX_TOKENS = 16384`。实测 8192 时思考用 5845、正文约
   300，够画；取 16384 是给复杂主体留余量——上限只是天花板，模型不会因为上限高就
   思考更久。
2. `finishReason=length` 识别成 `fatal`，**不重画**：这类失败第二轮只会同样截断，
   白等一次 30s。日志带 `finish=`，以后同类问题一眼可归因。
3. 顺手把 vision 验收的预算 1024 → 2048（期望输出只有一句 JSON，但同链路可能挂
   思考型模型，截断后"解析不到 JSON"会被当成素材不合格，把好图误杀）。

**修后实测**（同一批 12 个名字，先按 `cacheKey` 精确清掉这批的磁盘缓存）：

| | 通过 | 重画触发 | 单次耗时 |
|---|---|---|---|
| 修前 | 2/12（17%） | 4 个名字走过第二轮 | 22~50s |
| 修后 | **12/12（100%）** | **0 次** | 27~70s（中位 59s） |

重画本轮一次都没触发，**功劳不在它**。保留它的理由是兜底：4096 时代它确实救回过
1 个（洒水壶首轮拒、次轮成）。真实触发率要等遇到"真·可修复"的失败（带 text、
元素超量）才有样本，本轮没有。

gallery 人眼抽检（`storage/prop-gallery.png`，配 1.67 高的熊做标尺）：12 个全部可
辨认、风格统一（粗描边/纯色），大小都在标尺之下；毛巾偏"挂帘"、椅子偏"凳子"，
但仍能认出，属于可接受范围。

**诊断方法备忘**：素材生成"没产物"时，先看 `finishReason` 和 `completionTokens`，
再看 content。`length` + 顶格 = 预算问题（改预算，重画无用）；`stop` + 空 = 模型侧
真的没写（重画有用）；`stop` + 有内容但不是 SVG = 格式问题（重画有用）。

### 14.4 尺寸与落点：从"估"改成"量"

`fill = 0.75` 原来是按提示词"主体占画面 60%~85%"取的中值。上一轮把它记成
"只影响大小 ±15%"，实测后这个判断基本成立，但**逐个体**的偏差比 15% 更值得管：

| 名字 | 实测 fill | 旧实现尺寸误差 | 旧实现落点误差 |
|---|---|---|---|
| 水桶 | 0.719 | −4% | +3% |
| 洒水壶 | 0.645 | **−14%** | +7% |
| 风筝 | 0.836 | **+11%** | −10% |
| 向日葵 | 0.785 | +5% | −1% |
| 地球仪 | 0.848 | **+13%** | −7% |
| 书包 | 0.703 | −6% | **+10%** |
| 雨伞 | 0.688 | −8% | +5% |
| 毛巾 | 0.680 | −9% | +7% |
| 铲子 | 0.797 | +6% | −4% |
| 球拍 | 0.695 | −7% | +2% |
| 椅子 | 0.742 | −1% | +1% |
| 杯子 | 0.680 | −9% | +6% |

均值 0.74 —— 0.75 作为"平均值"没错，但**没有一个样本正好是 0.75**，逐体差到 ±14%：
同一个"水桶"声明 0.22 身高，洒水壶会被画得比它小 14%。落点误差来自另一处假设：
老实现认为内容在 viewBox 里垂直居中，于是把底边算成 `canvas/2 + canvas/2×fill`。
模型画的图十张没有一张真居中，留白偏一边就让道具浮起或陷地，偏差是
`(下留白 − 上留白)/2`，最大 ±10%（书包浮起、风筝下沉）。

**做法**：光栅化一次，用 resvg 的原始 RGBA 量 alpha 包围盒，一次拿到三个数。

- `fill = 内容高 ÷ 画布高` → 决定缩放（`k = height / (canvas × fill)`）；
- `anchorX = 内容水平中心` → 决定"挂在手上"的 x；
- `anchorY = 内容底边` → 决定"站在地上"的 y。

三条容易写错的约束，都写在 `measureContentBox` 旁边：

1. 像素行 `r` 覆盖 `[r, r+1)`，所以底边是 `bot + 1`。少这 1 像素在 256 画布上是
   0.4%，量级虽小，但会让每个道具统一往下沉半像素。
2. `alpha ≤ 8` 不计入：抗锯齿边缘有一圈 alpha 1~5 的毛边，算进去整体虚大。
3. `fill` 夹到 ≥0.15，挡"画了个 3px 小点"被放大成糊满屏；**夹紧只影响大小，
   `anchorY` 仍是真实底边**——两件事不能一起夹。

量不出来（渲染失败、依赖缺失）时退回 `fill=0.75` 且**不写锚点**，让渲染层走居中
假设：尺寸差一点可以接受，因为测量失败让整个道具消失不行。

其他两处顺带修正：

- 占位件的 `fill` 从 0.75 改成 0.66。`PlaceholderGlyph` 画的是 `canvas × 0.66`
  的方盒，按 0.75 算会被画成目标高度的 88%，六个占位并排时大小还不一致——占位件
  本来是"缺东西"的信号，尺寸再乱就只是噪声。
- 内置道具继续不传锚点：`PropGlyph` 的缺省值与老公式逐字相同
  （`half` / `half + half × fill`），所以老道具的渲染输出一个字节都不变。

验证：`probe-prop-draw` 逐条打印上面的误差表，画廊里 12 个道具底边全部贴地；
单测 +9（`measureContentBox` 六条覆盖换算/夹紧/全透明/缓冲不足/毛边，
resolver 三条覆盖透传与回退）。

### 14.5 打通之后跑一整课：断在作者侧，不在渲染侧

开关打开、跑第一节课，成片里**一个道具都没有**。查下去发现不是渲染层的事，链路断在三处——
而且三处都在"输入端"，也就是上一轮验收完全没覆盖的地方：

1. **写分镜的提示词还在教旧词表**。真正生成分镜的是 `quick-video.service.ts` 的
   `buildContentPrompt`，它写着"有具体道具就写 `propId`：ball / cookie / apple / …"——
   正是用户否掉的那份枚举；JSON 模板里根本没有 `props` 字段。模型严格按模板输出，
   所以从来没声明过道具。
2. **中间那层会静默丢字段**。`lesson-video-queue.service.ts` 的 `buildStoryboardFromPayload`
   用字段白名单把 `visualStory.scenes` 转成分镜，透传了 `beats / figure / sceneGraph /
   performance / interaction`，唯独没有 `props`。这段代码上方的注释恰好为同类事故写过两次
   （"prompt 教了、装配层也接了，中间这一环断了等于全都没接上"）——第三次还是踩在它旁边。
3. **课程包 schema 同样缺字段**。`generate-course-pack.ts` 的 JSON 示例里
   `visualStory.scenes` 没有 `props`，而它规定"不得输出 schema 之外的字段"。

**教训**：上一轮的验收是"拿手写分镜 → 装配 → 渲染"，验的是中段与末段；而真实链路是
"模型写分镜 → 装配 → 渲染"，第一段从没验过。**要验一个能力是否真的可用，必须从输入端跑起。**

补法（三处各一小段）：

- `quick-video.service`：把旧词表那句换成"先声明、再引用"两段——`props` 写 `{name, place,
  heightRatio}`，动作要指某个道具时 `propId` 直接写声明里的名字；内置 id 仍可用。
- `quick-video.service` / `generate-course-pack` 的 JSON 模板：`visualStory.scenes` 加
  `props` 示例（含 `heightRatio` 的标定参考）。
- `buildStoryboardFromPayload`：白名单加 `...(raw?.props ? { props: raw.props } : {})`。

**实测**（`scripts/probe-quick-video-prompt.ts`，只跑"写分镜"这一步，约 4 分钟）：

```
7/7 幕声明了道具
1. 小熊来浇花  props=[洒水壶 hand 0.22, 小花 floor 0.3]  perf=[walk, hold:洒水壶, speak]
5. 小兔来帮忙  props=[洒水壶 hand 0.22, 小花 floor 0.3]  perf=[handover:洒水壶]
```

动作里的 `propId` 直接用声明名（`hold:洒水壶`、`handover:洒水壶`），说明"先声明再引用"
这条规则模型能照着做，不需要再维护一份 id 白名单。

### 14.6 还没做的

1. ~~`fill` 未校准~~ —— 已改为实测包围盒，见 §14.4。
2. **验道具要先确认走的是哪个引擎**。本轮用 `quick-generate` 连跑三个任务，同一份内容
   有的出的是模板动画（土/太阳/水滴那套 `animationTemplate`），有的才是 `GeneratedLesson`
   （日志里 `dynamicRemotion=true compositionId=GeneratedLesson-…`）。模板渲染器根本不画
   `scene.props`，看到"开关打开了但画面没道具"时，先确认引擎，别先怀疑生成链路。
   要稳定复现道具效果，用 `build-lesson-props.ts --gen` + `render-storyboard-lesson.cjs`
   这条离线通道（不受队列引擎选择影响）。
3. **道具标签**：`Puppet2D` 里指认幕的标签仍画在 `y = -sizePx/2 - 14`，道具变小后它落到
   地面线上；`ActionStage` 的呼出式构图里标签已经能显示（本轮补的 `propLabelOf`）。
4. **`hold` 目前是"角色卡 + 道具呼出"构图**，不是"拿在手里"。真正的手持要模型写
   `walk`/`handover` 这类有 puppet 的动作，道具才会挂到手上（见 §14.6 上面的实测帧）。
   这是引擎能力差异，不是道具链路的 bug。
5. `PROP_GEN` 已在本机 `.env` 打开（`PROP_GEN=on`）；是否设为默认值仍要拍板。
6. **本机 LLM 免费额度已用尽**（`403 Free quota exhausted`，2026-11-24 深夜实测）：
   分镜重写与现画道具都会失败并各自降级（分镜退回旧内容、道具退回占位件）。
   下一次验证前先确认额度，否则会把"额度没了"误判成"链路坏了"。
