# 场地配方：把"场景"从代码分支变成数据

> 状态：**决策已定，待实施**
> 已拍板：① `Venue` 改为开放字符串（§12.1）；⑥ `venue` 改为幕级（§6）
> 前置阅读：`docs/lesson-video-world.md`（世界层与镜头层的分离）
> 本文解决两件事：**新增一处场地不改渲染代码**，以及**一节课里可以换场地**。

## 0. 摘要

**主张**：可枚举的应该是**渲染原语**（天空层、地面层、水面层、装饰层等 7 种，
不会增长），而不是**内容**（游乐园、教室、厨房、河边……会无限增长）。现在代码
把两者混在一起，所以每加一处场地都要改 4 个文件。

**做法**：把"用哪些层、层里放什么"抽成常量数据（`VENUE_RECIPES`），渲染器只剩
`switch (layer.kind)` 七个稳定分支。新增场地 = 加一份配方；新增装饰 = 加一个
资产组件并注册一行。

**第二件事（已拍板要做）**：`venue` 从课级挪到幕级，让"小马从家走到河边"这种
有位移的故事能成立。但"世界只定义一次"这条铁律不能整体推翻——所以拆成
**场地随幕变、尺度整课不变**：`venue` 逐幕定，`ppu` 仍是全课一把尺。
具体见 §6。

**验收标准**（也是"通用性"的可执行证明）：加 `classroom` 与"河边有水"这两处
新场地时，`git diff` **只允许动配方与配色文件，不允许动 `WorldLayer.tsx`**。
现有 5 种场地必须 golden frame 逐像素不变。

**决策记录**见 §12：①⑥ 已拍板，②~⑤ 按主张默认执行；幕级派生出的三条新选择
（转场方式、无信号幕的场地继承、跨场地尺度取哪一档）在 §12.3，若你另有主张请说。

## 1. 问题

上一轮把"世界"与"镜头"拆开了，比例和场地归属因此成立。但"世界由什么构成"
仍然是硬编码的。证据：

| 位置 | 现状 |
|---|---|
| `world.ts` `type Venue` | 5 个值：`playground / meadow / riverside / forest / night` |
| `world.ts` `VENUE_THEMES` | 5 份手写配色 |
| `world.ts` `venueDecor()` | `if (world.venue === 'playground') …` 往数组里 push |
| `world.ts` `venueHasFence()` | `venue === 'playground' \|\| …` |
| `WorldLayer.tsx` | 天空/远山/地面/草簇/摩天轮/围栏/灌木/树/长椅/沙坑/滑梯，**固定顺序的 JSX** |

后果很具体：

- **没有室内**。讲"整理书包""刷牙""吃饭"只能站在森林或草地——这是 3-6 岁内容的大类。
- **"河边"不可达**。`HABITAT_KEYWORDS` 产出 `river`，`venueFromHabitat` 只认
  `riverside`，落到 `meadow`；即便落对了，`WorldLayer` 也**不画水**，只换个色调。
- 每加一处场地，要改 4 个文件（类型 / 配色 / 装饰 / JSX），而且没有任何东西
  会提醒你"漏了一层"。

这不是"还缺几个场地"，而是**内容被写成了代码**。

## 2. 目标与非目标

**目标**

1. 新增一处场地 = 新增一份**数据**（配方常量），渲染器零改动。
2. 新增一件装饰 = 新增一个**资产组件** + 注册一行（几何各不相同，必须写代码，
   但只写一次，任何场地都能用）。
3. 保持现有 5 种场地**逐像素不变**。
4. 保持"所有世界物体共享同一个 camera 投影"这条铁律不变。
5. 场地可按**幕**切换（已拍板），且切换不破坏角色大小一致性与同场地连续性（§6）。

**非目标**

1. 不做"任意场景由 LLM 生成几何"——那会让每节课的美术风格漂移，且不可复现。
2. 不动动作/道具/角色（那是另外三层，见 §11）。
3. 不追求"零资产"：画一条河和画一堵墙是不同的几何，资产跑不掉。
   通用化的目标是**加资产不用改渲染逻辑**，不是"不需要资产"。

## 3. 核心设计

### 3.1 可枚举的是"原语"，不是"内容"

这是整个方案最关键的一条区分：

| | 会无限增长吗 | 应该枚举吗 |
|---|---|---|
| **渲染原语**：天空层、地平线层、地面层、水面层、围栏层、装饰层 | 不会（7 种足够描述所有户外/室内） | 可以，且必须 |
| **内容**：游乐园、教室、厨房、河边、太空站…… | 会 | **不可以** |

现在的代码把这两件事混在一起了：`WorldLayer` 里既有"层"（天空/地面/装饰），
又有"具体场地"（摩天轮只在 playground、沙坑在 playground 和 riverside）。
混合的代价就是加场地必改代码。

所以 `renderLayer` 里出现 `switch (layer.kind)` 是**健康**的（7 个稳定分支），
而 `switch (venue)` 是**病**（会无限加 case）。

### 3.2 六层构图 + 一个装置槽

把现有 `WorldLayer` 的绘制顺序抽象成层。顺序即遮挡关系，配方只能调整
"用哪些层、层里放什么"，不能调整"层怎么画"。

| 序 | 层 | 坐标空间 | 职责 | 可否缺席 |
|---|---|---|---|---|
| 1 | `sky` | screen | 渐变天空 + 太阳 + 云 | 否（室内用深色/墙色填充） |
| 2 | `horizon` | world | 远山 / 树线 / 楼群轮廓 | 是 |
| 3 | `ground` | world | 地平线以下铺满：草地 / 地板 / 沙地 | **否**（缺了角色就悬空） |
| 4 | `water` | world | 水面带（河、湖、水池） | 是 |
| 5 | `fence` | world | 围栏 / 矮墙 / 栏杆 | 是 |
| 6 | `decor` | world | 树、灌木、长椅、沙坑、摩天轮、课桌、灯…… | 是 |
| （7） | `setpiece` | world | 场地装置（滑梯），由 `world.slide` 驱动 | 是 |

**坐标空间的规则不可协商**：`screen` 层不随镜头平移（"那是天"），`world` 层
必须用 `camera` 的 `px/py/u` 投影。上一版把云画在世界坐标里，镜头一平移云就
"追着跑"；这一版必须把这条约束写进校验（§7）。

### 3.3 数据格式

```ts
/** 图层种类：稳定的渲染原语 */
export type LayerKind = 'sky' | 'horizon' | 'ground' | 'water' | 'fence' | 'decor';

/** 装饰资产：唯一需要写组件的地方。加一个 = 写一个组件 + 注册一行 */
export type DecorAssetId =
  | 'tree' | 'bush' | 'bench' | 'sandbox' | 'wheel'   // 户外
  | 'wall' | 'floorPatch' | 'desk' | 'lamp' | 'shelf'; // 室内

export type DecorItem = {
  asset: DecorAssetId;
  x: number;                 // 世界坐标（不是像素）
  scale?: number;            // 尺寸倍数，缺省 1
  opacity?: number;
  /** 资产私有参数（墙高、水宽、灯高……），由资产自己解释 */
  params?: Record<string, number | string>;
};

export type LayerSpec =
  | { kind: 'sky'; sun?: { x: number; y: number; r: number }; clouds?: { x: number; y: number; s: number }[] }
  | { kind: 'horizon'; hills: { x: number; r: number; tone: 'far' | 'near' }[] }
  | {
      kind: 'ground';
      asset: 'grass' | 'floor' | 'sand';
      /**
       * 贴在地面上的附加元素，按数组顺序绘制（铺面 → 沙地 → 草簇）。
       * 顺序有意义：草簇要压在地面上、沙地椭圆要在草簇之下，
       * 反了就会看到"草浮在沙上"。
       */
      patches?: Array<
        | { asset: 'dirtPatch'; x: number; rx?: number }   // 仅当 world.slide 存在时绘制
        | { asset: 'tuft'; from: number; count: number; step: number }
      >;
    }
  | { kind: 'water'; x: number; width: number; surfaceY?: number }
  | { kind: 'fence'; from: number; to: number; spacing: number }
  | { kind: 'decor'; items: DecorItem[] };

export type VenueRecipe = {
  /** 配方 id。**字符串，不是字面量联合**（已拍板，见 §12.1） */
  id: string;
  theme: VenueTheme;
  /** 数组顺序 = 绘制顺序 = 遮挡顺序 */
  layers: LayerSpec[];
};
```

这里有个容易被忽略的关键点：如果写成 `Record<Venue, VenueRecipe>` 而 `Venue` 是
5 个字面量的联合类型，那么**加一处场地仍然要改类型定义**——方案就退化成了
"改一个文件而不是四个文件"，不是"零改代码"。所以配方表的键必须是开放的
（`Record<string, VenueRecipe>`，已拍板）。类型安全由 `normalizeRecipe` +
"遍历 `Object.keys(VENUE_RECIPES)` 全量校验"的测试来补（§7）。

配方是**常量数据**，放在 `character/venue-recipes.ts`，与渲染器分开：

```ts
export const VENUE_RECIPES: Record<string, VenueRecipe> = {
  playground: {
    id: 'playground',
    theme: VENUE_THEMES.playground,
    layers: [
      { kind: 'sky', sun: { x: 1560, y: 230, r: 78 }, clouds: [...] },
      { kind: 'horizon', hills: [...] },
      { kind: 'ground', asset: 'grass', patches: [
        { asset: 'dirtPatch', x: 2.46 },                        // 滑梯脚下
        { asset: 'tuft', from: -3.4, count: 34, step: 0.42 },   // 草簇
      ]},
      { kind: 'fence', from: -9, to: 11, spacing: 0.62 },
      { kind: 'decor', items: [
        { asset: 'wheel', x: 3.4, opacity: 0.42 },
        { asset: 'tree', x: -3.2 }, { asset: 'tree', x: 6.6 }, { asset: 'tree', x: 8.2 },
        { asset: 'bench', x: 5.6 }, { asset: 'sandbox', x: -2.6 },
      ]},
    ],
  },
  // …
};
```

### 3.4 渲染器

```tsx
export const WorldLayer: React.FC<Props> = ({ world, camera, frame, withSlide = true }) => {
  const recipe = VENUE_RECIPES[world.venue] ?? VENUE_RECIPES.meadow;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        {recipe.layers.map((layer, i) => (
          <React.Fragment key={i}>
            {renderLayer(layer, { camera, frame, theme: recipe.theme, world })}
          </React.Fragment>
        ))}
        {withSlide && world.slide ? <Slide2D ... /> : null}
      </svg>
    </div>
  );
};
```

`renderLayer` 是 `switch (layer.kind)`——7 个稳定分支，**以后不会再长**。
场地差异全部在 `VENUE_RECIPES` 里。

注意 `world.venue` 已经是**幕级**字段（§6）：每次 `WorldLayer` 挂载时由它决定用
哪份配方，所以换场地天然发生在组件边界上，渲染器不需要知道"上一幕是哪儿"。

滑梯是**装置槽**，不进入配方：它是"这个场地里的装置"，由 `world.slide` 驱动，
任何场地都可以有（教室里放一座小滑梯也成立）。归属规则见 §6.2：**同场地所有幕
共享同一份**，不会"这一幕用到才有"；换到别的场地时才缺席，所以不需要额外的
清理逻辑。

**三维舞台同样受益**：`ThreeActionStage` 里也渲染 `<WorldLayer withSlide={false} />`，
所以改动渲染器之后，3D 幕（滑梯 / 拍球）的背景自动跟着换，不需要第二套实现。

## 4. 两个验证案例

方案是否成立，取决于**用它写出来的新场地是否需要改渲染器**。下面两处是
最容易失败的地方。

### 4.1 室内：教室

```ts
classroom: {
  id: 'classroom',
  theme: VENUE_THEMES.classroom,   // 新配色：暖木墙 + 米色地板
  layers: [
    // 室内没有天空：用墙色铺满，"天空层"退化为背景色
    { kind: 'sky' },
    { kind: 'ground', asset: 'floor' },
    { kind: 'decor', items: [
      { asset: 'wall', x: 0, params: { height: 3.2, from: -12, to: 12 } },
      { asset: 'shelf', x: -3.4 },
      { asset: 'desk', x: 1.2 }, { asset: 'desk', x: 3.0 },
      { asset: 'lamp', x: 5.2, params: { height: 2.1 } },
    ]},
  ],
},
```

**这套配方暴露两个必须支持的能力**（否则厨房、卧室、商店都写不出来）：

1. `sky` 层需要在**室内**退化为"纯背景色"——所以 `sun`/`clouds` 必须是可选的。
2. `wall` 需要"横向铺满 + 指定高度"——所以 `DecorItem.params` 是必需的，
   而且资产要能接受"跨度"而不只是 `x`。

### 4.2 河边：真的有一条河

```ts
riverside: {
  id: 'riverside',
  theme: VENUE_THEMES.riverside,
  layers: [
    { kind: 'sky', sun: {...}, clouds: [...] },
    { kind: 'horizon', hills: [...] },
    { kind: 'ground', asset: 'grass' },
    // 新增：水面层。y 略高于地平线（远），宽度横贯画面
    { kind: 'water', x: 0, width: 20, surfaceY: 0.12 },
    { kind: 'fence', from: -9, to: 11, spacing: 0.62 },
    { kind: 'decor', items: [
      { asset: 'tree', x: -4.0 }, { asset: 'tree', x: 7.2 },
      { asset: 'bush', x: 5.0 },
    ]},
  ],
},
```

水面是**新原语**（`water` 层），不是新场地。今后"湖""水池""海边"都复用它，
只改 `width` / `surfaceY`。这正是"原语可枚举、内容不可枚举"的收益。

## 5. 后端如何选配方

判定从"整课扫一次"改为"**逐幕扫一次**"（venue 已拍板为幕级，§6）。函数相应拆成
两半：

```ts
/** 幕级：这一幕发生在哪里 */
private resolveSceneVenue(scene: any, prev: string, lessonHint: string): string;

/** 课级：整课一把尺度（§6.3），只依赖"整课有没有滑梯" */
private resolveLessonScale(scenes: any[]): number;
```

**别名表必须补全**（这就是顺手修掉的 P0 bug）：

```ts
/**
 * habitat 关键词 → 配方 id。
 * 两套词表本来就不一样：后端 HABITAT_KEYWORDS 用 river / grassland，
 * 渲染层配方用 riverside / meadow。这个映射表就是它们之间缺失的那一环
 * （现在缺失，所以 river 静默落到 meadow）。
 */
const HABITAT_TO_VENUE: Record<string, string> = {
  river: 'riverside',
  grassland: 'meadow',
  forest: 'forest',
  night: 'night',
};
```

单幕判定优先级（从高到低，命中即停）：

1. 这一幕出现滑梯（滑 / 爬 / 指着滑梯）→ `playground`，这一幕带 `slide`；
2. 室内关键词（教室 / 课桌 / 书包 / 房间 / 回家 / 刷牙 / 餐桌……）→ `classroom`；
3. **本课有滑梯，而 habitat 只命中草地/河边** → `playground`；
4. habitat 关键词（多命中时按 夜 > 河 > 森林 > 草地 取一个）→ 上表；
5. **以上都没命中 → 继承上一幕的 venue**（连续性规则，见 §6.2）；
6. 首幕就什么都没命中 → 用全篇聚合的旧逻辑兜底，再不行 `meadow`。

第 2 条**必须高于第 4 条**：`"小熊在房间里刷牙"` 里可能同时出现"树""草"之类的词，
落到森林就错了。

第 3 条是落地时才发现的：滑梯只存在于游乐园，所以"本课有滑梯"比单幕的"草地"更
强——公园里本来就有草地和沙坑。不这么排，一节滑梯课会被判成"第 1 幕草地、第 2 幕
公园"，孩子看到的是两次瞬移。"森林/夜晚"是另一个地方，仍然尊重文本。

第 4 条的排序也是落地时补的：`HABITAT_KEYWORDS` 里 grassland 排在 forest 前面，
而分镜常写"森林的草地上"，先命中就掉到草地。改成按具体程度挑，不按表顺序。

第 5 条是幕级方案的关键——没有它，场地会在幕与幕之间乱跳（§6.2）。

本次只做 `classroom` 一套室内配方，`home` / `kitchen` 等先用同一套换配色
（见 §12.2）——等真有第三类室内需求，再拆成独立配方，那时仍然不需要改渲染器。

## 6. 幕级场地（已拍板要做）

### 6.1 要拆开的两个概念

上一轮"整课一处场地"同时承担了两件事，幕级必须把它们分开：

| | 场地 `venue` | 尺度 `ppu` |
|---|---|---|
| 表达什么 | 这一幕发生在什么地方 | 一个世界单位等于多少像素 |
| 粒度 | **幕级**（第 1 幕森林、第 2 幕家） | **课级**（整课恒定） |
| 变了会怎样 | 换背景，正确且必要 | 同一只熊忽大忽小，就是上次修的 bug |

所以结论是：**场地随幕变，尺度整课不变**。`WorldView` 挂到幕上，但基准缩放从
整课算一次、填进每一幕。

关键事实是现在的 `worldScale()` 本来就与 venue 无关：`worldBounds()` 用的是
`OPEN_VENUE_BOUNDS`（角色可演盒）并在有滑梯时并入滑梯包围盒，**刻意不含树、山、
摩天轮这些装饰**。也就是说，只要一节课里"有没有滑梯"是一致的，ppu 天然相同，
换成什么场地都不影响。这解释了为什么幕级不会退回到"忽大忽小"——真正会影响
ppu 的只有滑梯，不是场地。

### 6.2 真会出问题的地方：场地乱跳

场地变成幕级之后，最糟的失效不是比例，而是**没有场地线索的幕**。举例：

> 幕 1「小熊在林子里捡到一颗苹果」→ 幕 2「他把苹果擦干净」→ 幕 3「他去找小兔」

幕 2 的文本里没有任何场地词。若按单幕独立判定，它会落到默认 `meadow`——于是
孩子在两帧之间从森林瞬移到草地，再瞬移回来。这不是"换场地"，是穿帮。

规则：**无信号 → 继承上一幕**，并记录继承来源（`venueFrom: 'inherit'`），便于测试
与排查。全篇只有"有明确位移语义"的地方才允许切场地，位移由文本自己给出
（走到 / 回到家 / 来到河边 / 推开教室门）。

这条规则同时定义了一个新不变量：

> **相邻两幕 venue 相同 ⇒ 世界必须完全一致**（同一配方、同一 slide、同一 ppu）。
> 只有这样，连续几幕才读成"同一个地方的不同时刻"。

由此可以直接推出 `slide` 的归属，这一条实施时最容易搞错：

> **滑梯属于"playground 这个场地"，不属于"某一幕"。** 只要这节课的 playground
> 有滑梯，**所有 playground 幕**都带同一份 `slide` 坐标；只有切到别的场地时才缺席。

反例：若按"这一幕用滑梯才给 slide"来幕级化，一节滑梯主题的课就会出现第 1 幕有
滑梯、第 2 幕（角色在同一个公园里说话）滑梯凭空消失——同一处公园少了一座滑梯，
比"没有滑梯"更穿帮，而且会破坏 §8 第 6 步"现有主题逐像素不变"的验收。

现有的 `sceneUsesSlide()` 判定仍然有用，但它决定的是**这一课有没有滑梯**，不是
**这一幕有没有滑梯**。`usesSetpiece`（只给装置、不给滑梯图标）保持按幕判断，不受影响。

### 6.3 跨场地时尺度取哪一档

滑梯存在与否会改变 ppu（`worldBounds` 并入滑梯盒）。一旦一节课里既有滑梯幕又有
非滑梯幕，就出现一个问题：取哪一幕的 ppu 当整课基准？

**落地时改了做法，理由是"后端不该算 ppu"。** 原方案让后端 `resolveLessonScale()`
算出一个数值下发（`scaleRef`），但那要求后端 import 渲染层的 `worldScale`——把
STAGE / ACTOR 这些渲染常量拖进 Nest 的运行时依赖里。改成一个几何字段：

```ts
// 后端：整课有滑梯时，每一幕都带同一份滑梯几何
world.scaleSlide = lessonHint.slide;

// 渲染层：算基准缩放时「这一幕的滑梯，或整课的滑梯」
const slide = world.slide ?? world.scaleSlide;
```

后端只表达"本课有没有滑梯"（它本来就知道），ppu 怎么算仍然只有渲染层一份实现。
整课取 min 的语义因此变成结构性的：**所有幕都按滑梯档算**，等价于 min。

代价没变：第 1 幕有滑梯、第 2 幕在家时，家的那一幕沿用较小的 ppu，室内显得空旷。
这个代价接受，因为反面（熊在两幕里高矮不同）更明显、更像 bug。

**`worldBounds` 不许跟着用 `scaleSlide`**。它给镜头夹取范围，只能用"这一幕真实有的
东西"；否则室内幕的镜头能平移到一座并不存在的滑梯旁，画面变成空地。两个函数的
分工写进了注释，也是本次唯一容易混淆的地方。

### 6.4 数据形状

```ts
// 渲染层
export type WorldView = {
  /** 场地 id：开放字符串（§12.1），按幕给定 */
  venue: string;
  /** 该场地的装置。同一 venue 的所有幕共享同一份；换场地时缺席（§6.2） */
  slide?: WorldSlide;
  /** 整课的滑梯几何，**只用于算基准缩放**，不用于绘制（§6.3） */
  scaleSlide?: WorldSlide;
  /** 直接指定 ppu。缺省时由 worldScale(world) 算；旧任务没有它也能渲染 */
  scaleRef?: number;
};
```

`venueFrom`（场地是怎么定下来的：`slide / indoor / habitat / inherit / lesson`）
**放在 scene 顶层，不放进 world**。world 是渲染输入，必须满足"同场地的幕完全一致"；
诊断字段混进去，第 1 幕（lesson）与第 2 幕（inherit）的 world 就不再相等，
那条不变量在测试里会立刻破。

三个字段都可缺省，旧任务缓存因此不需要迁移：没有 `scaleSlide` 就按这一幕自己算，
没有 `scaleRef` 同理。

### 6.5 转场

相邻两幕 venue 不同，视觉上是硬切。**第一阶段只做硬切**，不做推镜/闪白/遮罩：

- 硬切在儿童内容里是常见语汇（绘本翻页就是这个节奏）；
- 真正的"转场动画"需要跨幕共享时间轴，会把"每幕独立渲染"这个结构撬开，代价远大于
  收益；
- 需要柔化时，正确做法是在两幕之间**插一个过渡幕**（画面写"他走回家"），而不是
  在渲染层做叠化。这样它仍然是普通的一幕，可以复用现有分支。

### 6.6 对现有代码的改动面

| 文件 | 改动 |
|---|---|
| `video/scene-venue.ts`（新） | 纯函数：`detectSceneVenue` / `resolveSceneVenues` + 两张词表（别名表、室内线索）。场地乱跳这类问题在这一层用测试钉死 |
| `video-generation-agent.service.ts` | 保留 `resolveLessonWorld`（全篇兜底 + 有没有滑梯），新增 `sceneVenueText`（这一幕的文本，**不含 topic**），逐幕调 `resolveSceneVenues`；world 组装时把 `venueFrom` 剥到 scene 顶层 |
| `world.ts` | `Venue` 改 `string`；`WorldView` 加 `scaleSlide` / `scaleRef`；`worldScale` 走 `boundsForScale`（`slide ?? scaleSlide`），`worldBounds` 不动 |
| `WorldLayer.tsx` | 无改动 |
| `ThreeActionStage.tsx` | 无改动 |
| 测试 | `scene-venue.spec.ts`（13 项）+ `cross-venue-storyboard.json` 四幕用例 |

"`WorldLayer` / `ThreeActionStage` 不用动"是这套设计成立的证据：场地已经是幕级输入，
渲染层本来就只认输入。

`sceneVenueText` 刻意**不含 topic**：主题词会把每一幕都染成同一个场地。主题叫
《小马过河》时每幕文本都带"河"，"他回到家"那一幕也会被判成河边，幕级就白做了。
topic 只参与全篇兜底。

## 7. 校验与守卫

配方的风险不是"写不出来"，是**写错了没人知道**。

现在配方是编译期常量，TS 类型能挡住大部分错误。但只要 §12.1 采纳"键开放"，
类型检查就挡不住"配方 id 拼错 / 场地漏写"了——所以校验必须补上，而且它也是
未来把配方外置成 JSON（放数据库、让运营配）的前提。

三条硬性规则：

```ts
export function normalizeRecipe(raw: unknown): VenueRecipe {
  // 1. 必须有 ground 层。
  //    这是唯一"缺了必然出画面事故"的层：没有地面，角色就悬在半空。
  // 2. world 层禁止像素坐标：出现 px / py / left / top 等字段直接拒绝。
  //    这是"比例一致"的防线——一旦允许像素坐标，就又回到"背景是屏保、
  //    和角色不在同一空间"的老毛病。
  // 3. 未知 asset 抛错（开发期）/ 降级为占位方块 + warn（运行期）。
  //    静默跳过正是"场地悄悄缩水"的来源：少画一层，画面照样出得来，
  //    没人会发现，直到某一节课看起来莫名其妙地空。
}
```

测试（`src/backend/test/unit/venue-recipe.spec.ts`）：

| 用例 | 断言 |
|---|---|
| 内置场地一个都不少 | `BUILTIN_VENUES.every((v) => VENUE_RECIPES[v])`（`VENUES` 改名，退化为"回归基线清单"，不再是类型来源） |
| **所有**配方（含后加的）都通过校验 | 遍历 `Object.keys(VENUE_RECIPES)` 逐个 `normalizeRecipe` |
| 每个配方都有 ground 层 | 同上 |
| 配方里没有像素坐标字段 | 递归扫描 |
| 未知 asset 被拒绝 | `expect(() => normalizeRecipe({...asset:'dragon'})).toThrow()` |
| 每种场地至少有一件可识别的地标 | 防"空草地" |
| `river → riverside`、`grassland → meadow` | 别名表 |
| 教室配方不含围栏与摩天轮 | 词汇与场地匹配 |
| **无场地信号的幕继承上一幕** | 森林 → 无信号 → 仍是 forest，且 `venueFrom === 'inherit'` |
| **滑梯幕切到室内幕，ppu 不变** | 两幕 `world.scaleRef` 相等，且等于整课 min |
| **相邻同场地幕的世界完全相同** | 同 venue 的相邻幕，`slide` 与 `scaleRef` 逐字段相等 |

`check:lesson-template` 增加 token：`VENUE_RECIPES`、`renderLayer`、`scaleRef`。
token 检查已覆盖 `stage-template.ts`，配方文件也会被打包进去。

## 8. 迁移路径（保证逐像素不变）

顺序不能反，否则中间态会出画面事故：

1. **抽类型与配方文件**：新增 `venue-recipes.ts`，把现有 `WorldLayer` 里
   每一个硬编码数字（云的坐标、山的三组半径、围栏 from/to/spacing、草簇的
   34 根与间距、装饰 x）**原样抄进配方**。此时渲染器还没改。
2. **改渲染器读配方**：`WorldLayer` 改成 `recipe.layers.map(renderLayer)`。
   绘制顺序必须与旧 JSX 完全一致，否则遮挡关系就变了。旧实现的实际顺序是：

   ```
   sky(底/日晕/日) → clouds → hills → ground(铺面/草边)
   → 滑梯沙地椭圆 → 草簇 → wheel → fence → bush → tree → bench → sandbox → slide
   ```

   这里有两个必须写进配方的细节：

   - **`decor` 层按 `items` 数组顺序逐个绘制，不按资产分组。** 旧代码是
     "先 filter 出全部 wheel 画完，再 filter 全部 bush"，而 wheel 必须在
     fence 之前（围栏要挡住轮子斜撑）。若照抄成"按 asset 分组"，摩天轮就会
     跑到围栏前面，读成前景脚手架。
   - **`ground` 层内部也有顺序**：铺面 → 滑梯脚下的沙地椭圆 → 草簇。
     草簇贴在地上、沙地椭圆压在地面上，顺序反了草就浮在沙上。
     因此 `ground` 允许携带可选的子序列，而不是单一矩形。
3. **`venueDecor()` / `venueHasFence()` 改为派生**：保留函数签名（3D 侧与现有
   测试在用），实现分别改为"从配方取 `decor.items`"与"配方里有没有 `fence` 层"。
   这样 `lesson-world.spec.ts` 的现有断言（森林没有围栏、森林至少 5 棵树）不需要
   重写，它们会变成**对配方的断言**——这正好是我们要的效果。
4. **golden frame 对比**：迁移前后各渲染 5 种场地 × 3 帧，逐像素 diff 必须为 0。
   命令见 §9。
5. **加新场地**：`classroom` + `riverside` 的水。此步 `git diff` 必须只动
   `venue-recipes.ts` 与 `venue-themes`（配色），**不动 `WorldLayer.tsx`**。
   这是"通用性"最硬的证据，也应作为 review 的验收条件。
6. **改幕级**（第 1~5 步全部落地后再做，顺序不能提前）：`resolveLessonWorld`
   拆成 `resolveSceneVenue` + `resolveLessonScale`；`WorldView` 加 `scaleRef`；
   `cameraForWorld` 改一行取 `scaleRef ?? worldScale(world)`。

   为什么放最后：前 5 步只动"怎么画"，第 6 步动"画哪儿"。若先改幕级，golden frame
   就失去基线——同一帧会因为 venue 解析路径变了而不同，diff 不再为 0，你分不清是
   迁移引入了回归还是幕级本来就该变。**把可验证的部分先钉死，再动不可验证的部分。**

   第 6 步的验收：现有单场地主题（滑梯 / 森林）渲染结果**逐像素不变**（因为
   `resolveSceneVenue` 对全篇同场地的输入必然每幕都返回同一个 venue，
   `resolveLessonScale` 也等于原 `worldScale`）；新增跨场地演示用例见 §9。

## 9. 验证

### 9.1 配方迁移的逐像素比对

```bash
# 迁移前后的 golden frame（每处场地 3 帧）
cd src/video-remotion
for v in playground meadow riverside forest night; do
  node scripts/render-venue-probe.cjs --venue $v --frame 0   --out out/golden/$v-0.png
  node scripts/render-venue-probe.cjs --venue $v --frame 120 --out out/golden/$v-120.png
done
# 逐像素对比（0 = 完全一致）
python scripts/pixel-diff.py out/golden-before out/golden-after
```

需要一个 `scripts/render-venue-probe.cjs`：给定 `--venue` 与帧号，渲染一帧
纯场地（不含角色与字幕）。这个探针本身也是长期资产——以后改任何一层，
都能单独看这一层的效果，不必等整片。

另需人工验收两帧：`classroom` 与 `riverside`（有水），确认"没有天空
不显得空""河在地平线上而不是浮在地面前面"。

### 9.2 幕级的验收

逐像素比对对幕级**无效**（跨场地本来就是不同的画面），所以必须换判据：用
"同一只熊的像素高度"当尺子。

用例：`src/backend/test/fixtures/cross-venue-storyboard.json`（与现有
`forest-storyboard.json` 同级），四幕

| 幕 | 文本要点 | 期望 venue | 期望 venueFrom |
|---|---|---|---|
| 1 | 小熊在林子里捡到一颗苹果 | forest | keyword |
| 2 | 他把苹果擦干净 | forest | **inherit** |
| 3 | 他走回家，把苹果放在桌上 | classroom | keyword |
| 4 | 他坐在桌边笑 | classroom | **inherit** |

断言：

1. 四幕 `world.venue` 依次为 `forest / forest / classroom / classroom`；
2. 四幕 `world.scaleRef` **全部相等**；
3. 帧抽检（每幕取动作最高点）里角色头顶到脚底的像素高度，四幕差值 ≤ 2px；
4. 第 2 幕与第 1 幕的 `WorldLayer` 输出逐像素一致（同场地连续幕必须完全静止）；
5. 第 3 幕背景不含任何 `tree` 资产、含 `desk`（换场地真的换了）。

第 3 条是这套设计的命门：只要它成立，"幕级场地"就没有牺牲上两轮修好的
比例一致性。

### 9.3 实测记录（2026-11-23）

用 `cross-venue-storyboard.json` 走真实装配（`build-lesson-props.ts`）再抽帧：

| 幕 | 装配结果 | 画面 |
|---|---|---|
| 1 | `forest` / `habitat` | 森林（两侧树簇、灌木、远山） |
| 2 | `forest` / `inherit` | 与第 1 幕完全一致 |
| 3 | `classroom` / `indoor` | 窗、课桌、落地灯、木墙 |
| 4 | `classroom` / `inherit` | 与第 3 幕完全一致 |

四幕熊的像素高度目视一致，第 3 幕确实换了地方。`world` 里只有 `venue`（没有
`venueFrom`），满足"同场地幕完全一致"。

**这次同时暴露并修掉的一处陷阱**：wide 镜头下可见的世界 x 只有 **±3.35**
（`worldScale` 286 px/单位），而当时 forest/night 配方的树摆到 ±10，于是"森林"
那一帧只剩左下角一丛灌木，和草地完全分不出来——**配方看着很茂密，画面是空的**。

修法分两层，第二层才是重点：

1. 把树收进可拍范围、中间留林间空地、两侧各一组"远小树 + 近大树"，并给树加了
   `params.scale`（整棵树高 2.94 个世界单位 ≈ 1.76 个角色高，不加缩放就没有层次）；
2. 新增 `test/unit/venue-coverage.spec.ts`：用**镜头宽度**算每个机位画内还有没有
   装饰，并断言"没有死装饰"（摆在永远拍不到的位置等于没摆）。原来的
   `lesson-world.spec` 里有一条 `Math.max(...xs) > 8`，正是把"摆得更远"当成了
   "填得更满"——**错误的断言比没有断言更糟**，它会保护 bug。

同一条账也修了 meadow / riverside：它们的树是照搬 playground 的 6.6 / 8.2，
而那两个位置只有带滑梯的公园（ppu 更小）才拍得到。夜晚另配了天空层
（`NIGHT_SKY`）——月亮原来在 (1560, 230)，正好被右侧树冠吃掉。

顺带一提：`Tree` 的 `scale` 默认值是 1，所以 playground 的成片**字节级未变**
（`cmp` 验证过），这次改动只影响四处"树本来就没进画面"的场地。

同一原因也解释了 classroom 为什么只摆三件家具（§4.1 的配方注释里写了），
以及为什么最初那版"窗 + 书架 + 两张桌 + 灯"看着像空房间。

## 10. 风险与回滚

| 风险 | 影响 | 应对 |
|---|---|---|
| 绘制顺序被改，遮挡关系变 | 摩天轮变前景 / 树挡住滑梯 | §8 第 2 步逐项对齐顺序；golden frame 会抓到 |
| 配方漏层，画面"悄悄空掉" | 某一侧没有装饰，镜头一平移就是空地 | `normalizeRecipe` 要求 ground；测试要求每种场地有地标 |
| 室内用 `sky` 层语义别扭 | 代码可读性 | `sky` 改名为 `backdrop`（背景层），室内就是"纯色背景" |
| 配色与配方的字段重复 | 维护两份 | 配方只引 `theme`，配色仍在 `VENUE_THEMES` |
| 旧任务缓存里的 props 没有新场地 | 不会崩 | `VENUE_RECIPES[venue] ?? meadow` 兜底 |
| 无场地线索的幕落到默认值 → 场地乱跳 | 孩子看到森林里突然闪一下草地 | 继承上一幕（§6.2）；测试覆盖 `venueFrom === 'inherit'` |
| 滑梯幕与室内幕混排，ppu 取错档 | 熊在两幕里高矮不同 | 整课取 min（§6.3）；验收断言四幕 `scaleRef` 相等 |
| 跨场地硬切被误认为"没做转场" | 观感 | 明确为设计选择（§6.5）；需要柔化时插过渡幕，不在渲染层做叠化 |

回滚：配方是纯数据，`WorldLayer` 改动集中在 `renderLayer`。出问题把
`WorldLayer` 切回旧实现即可（保留 git 分支点）。

**缓存注意**：场地变了画面就变，但内容哈希没变 → 会命中旧 MP4。
若本方案改变了现有场地像素，必须升 `VIDEO_RENDERER_SCHEMA_VERSION`
（`lesson-video-queue.service.ts`）。若 golden frame 证明零变化，则不必升。

## 11. 后续三层（不在本次范围）

场地是四层里影响面最大的一层。其余三层各自独立，可分别评估：

| 层 | 现状 | 通用化方向 | 收益 |
|---|---|---|---|
| 动作 | `poseAt` 11 个 `case` | 关键帧 + 循环模式（`Pose` 已有 9 自由度） | 招手/鞠躬/点头不用加 case |
| 道具 | `PropArt` 10 个 `if` | 资产注册表 + 统一锚点协议 | 加道具 = 加 SVG |
| 角色 | `ActorRig` 5 个旋钮 | 部件表（头/耳/尾/身） | 松鼠不再是熊 |

**接触类动作不能纯关键帧**（拍球要求掌球同帧接触、爬梯要求手脚落在横档），
需要约束求解。这类拓扑目前只有三类（位移 / 接触 / 传递），不随题材增长。

## 12. 决策记录

### 12.1 已拍板

| # | 决策 | 结论 | 落地位置 |
|---|---|---|---|
| ① | `Venue` 类型 | **开放字符串**（A 案） | §3.3、§5 |
| ⑥ | `venue` 粒度 | **幕级** | §6 |

第 ① 条丢掉的是编译期穷举检查，用两条补：`normalizeRecipe`（§7）+ 遍历
`Object.keys(VENUE_RECIPES)` 的全量测试。这比"加场地要改类型"划算得多。

第 ⑥ 条不是把"整课一处场地"整个推翻，而是拆成两半：**场地随幕变，尺度整课不变**
（§6.1）。原来那条铁律的主体——"ppu 整课只算一次"——仍然保留。

### 12.2 按主张默认执行

以下四条你没提异议，我按原文主张实施；若想改，说一声即可，成本都在配方数据里：

| # | 决策 | 执行 |
|---|---|---|
| ② | `sky` 改名 `backdrop` | 改名，室内即"纯色背景层" |
| ③ | `decor` 层顺序 | 按 `items` 数组顺序绘制，不按资产分组 |
| ④ | 室内配方拆分 | 先只做 `classroom`，`home` / `kitchen` 共用并换配色 |
| ⑤ | `river → riverside` P0 bug | 并入本方案第 5 步（别名表），不单独发 commit |

### 12.3 幕级派生出的三条新选择

这三条是"⑥ 改幕级"带出来的，原文档没覆盖，需要你确认。都给了主张，你可以只说
"按你说的"。

| # | 选择 | 我的主张 | 若反过来 |
|---|---|---|---|
| A | 跨场地转场怎么做 | **先只做硬切**（§6.5） | 做叠化/推镜要跨幕共享时间轴，会把"每幕独立渲染"撬开，代价远大于收益 |
| B | 没有场地线索的幕怎么办 | **继承上一幕**（§6.2） | 改回"全篇聚合"就等于回到课级，幕级失去意义；改"每幕独立判定"会场地乱跳 |
| C | 滑梯幕与室内幕混排，ppu 取哪档 | **整课取 min**（§6.3） | 取 max 会把滑梯裁出画面；每幕各算则熊忽大忽小 |

### 12.4 实施顺序

严格按 §8 的 1→6。第 6 步（幕级）必须放在最后，理由是 golden frame 需要一条
稳定的基线：先把"怎么画"钉死（1~5 步可逐像素验证），再动"画哪儿"（第 6 步用
角色像素高度验证）。顺序反了，diff 不为 0 时你分不清是回归还是本来就该变。

### 12.5 落地时与原方案的四点差异

方案到代码之间隔着一层现实，这四处是实施时改的，都已回写进上文：

1. **`scaleRef`（数值）→ `scaleSlide`（几何）**：后端算 ppu 就要 import 渲染层的
   `worldScale`，把 STAGE / ACTOR 拖进 Nest 的运行时依赖。改成下发几何，ppu 仍然
   只有渲染层一份实现（§6.3）。
2. **新增一条场地优先级**："本课有滑梯而单幕只命中草地/河边 → 仍按 playground"。
   不加这条，一节滑梯课会被判成"第 1 幕草地、第 2 幕公园"（§5）。
3. **habitat 多命中按具体程度取**（夜 > 河 > 森林 > 草地），不按词表顺序。
   词表里 grassland 排在 forest 前面，而分镜常写"森林的草地上"（§5）。
4. **`venueFrom` 移出 world、放 scene 顶层**：它是诊断字段，混进 world 会让
   "同场地幕世界完全一致"这条不变量在测试里直接破（§6.4）。

### 12.6 实施状态

| 步骤 | 状态 | 验证 |
|---|---|---|
| 1~4 配方迁移 | 已完成 | 4 帧（森林 2 + 滑梯 2）与迁移前**字节级一致** |
| 5 教室 + 水面 | 已完成 | 本批 diff 不含 `WorldLayer.tsx`；教室/河边抽帧人工确认 |
| 6 幕级 | 已完成 | 四幕序列与 `venueFrom` 正确、熊等高（§9.3） |

回归：`lesson-world` 24 项、`venue-recipe` 13 项、`scene-venue` 13 项、
`puppet-duo` 14 项、`action3d-registry` 15 项、`video-generation-agent.service` 20 项，
全部通过；两侧 `tsc --noEmit` 干净；`check:lesson-template` 无缺失 token。
