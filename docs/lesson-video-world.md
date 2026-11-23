# 整节课一处场地（world 层）

## 要解决的问题

上一版每一幕都是一个**独立的局部场景**。三处症状指向同一个根因：

1. **滑梯和小熊的大小比例对不上**——取景按"这一幕装得下什么"算缩放：
   说话幕只有一只熊，缩放拉满；滑梯幕要装下整座结构，缩放退到很小。
   同一只熊在滑梯幕 360px、说话幕 437px（1.21 倍），滑梯与它的比例也就跟着幕变化。
2. **爬梯子就是一个梯子**——梯子是这一幕的**道具**：二维画一把独立的梯子，
   三维建一座独立的滑梯，两者之间没有"同一处公园"的关系。爬到顶，梯子后面
   没有平台、没有滑道。
3. **缺少全局场景**——背景是按 habitat 画的一张屏保（太阳、云、一排树），
   不参与世界坐标，镜头平移时它不动。所以它永远只是"贴在后面的图"。

## 做法：世界与镜头分离

| 层 | 负责 | 会不会变 |
|---|---|---|
| **世界** | 一处场地 + 一组固定装置（滑梯含平台/滑道/爬梯、沙坑、长椅、围栏、树、远处摩天轮） | 整节课**只定义一次** |
| **镜头** | 一个基准缩放 + 有限变焦 + 平移 | 逐幕变，但只变镜头 |

### 三条规则

**1. 基准缩放整节课只算一次**（`worldScale()`）

```
byHeight = (SUBJECT_BAND − 10) / 场地高
byWidth  = (STAGE.width − 2·SAFE_X) / 场地宽
base = min(byHeight, byWidth)
```

输入只有"场地包围盒"，**没有"这一幕有什么"**——所以它逐幕相同。

**2. 变焦不改变任何两个物体的比例**（`cameraForWorld()`）

```
fit = 让 focusBox（角色 + 他正在用的装置）完整装进画面所需的缩放
ppu = clamp(fit, base, base × SHOT_ZOOM[shot])
```

- 下限 = `base`：低于它就等于把世界缩小，比例会变，**永远不越过**。
- 上限 = `base × 焦距`（wide 1.0 / medium 1.18 / close 1.5）：再大就只剩一张脸，
  孩子看不出"他在公园的哪里"。
- 中间取 `fit`：一幕里东西多就退到基准，只有角色时稍稍推近。

关键在最后一句：**所有世界物体同乘一个 `ppu`**。熊与滑梯的屏幕比恒等于它们的
世界比，与景别无关。比例一致性不是"每幕拟合得更准"，而是**没有第二个缩放**。

实测《小熊玩滑梯》（滑梯 `[0.66,2.6,0] → [4.26,0.3,0]`，场地盒 8.46 × 3.88 世界单位）：

```
base = 179.12 px/世界单位
wide/medium/close  focusBox=整场  ppu=179.12   （被 fit 夹住，不退不推）
medium  focusBox=只有熊          ppu=211.4    （1.18×）
close   focusBox=只有熊          ppu=268.7    （1.50×）
角色站高 299→448px，滑梯恒定占 695px
```

**3. 滑梯是场地里的装置，不是这一幕的道具**（`setpiece` 字段）

场地下发 `world.slide = { start, end }`，几何只有一份：

| 谁 | 从哪取 |
|---|---|
| 三维 `SlideRig` 建 mesh | `world.slide`（缺省回落 `MOTION_DEFAULTS.slide`） |
| 二维 `Slide2D` 画平台/滑道/爬梯 | 同上 |
| 爬梯的 x | `slideLadderX(start, end)`，**只算一次** |
| 爬梯横档高度 | `ladderRungYs(平台面)`，2D/3D 同一份 |
| 爬梯动作的落点 | `PUPPET_DEFAULTS.climb` 标称值 = `slideLadderX`（差 < 0.05） |
| 取景内容盒 | `slideBounds(start, end)` |

`setpiece: 'slide'` 的含义是"这一幕在**使用**场地里的滑梯"，因此渲染层不再
在角色旁边摆一个滑梯**图标**——那正是"真的滑梯 + 玩具图标"叠在同一个画面里的来源。

## 改动落点

| 文件 | 职责 |
|---|---|
| `src/video-remotion/src/character/world.ts` | 场地类型与配色、`WorldView` 校验、`worldBounds`、`worldScale`、`SHOT_ZOOM`、`cameraForWorld`、装饰布局、`slideLadderTop` / `worldLadderX` |
| `src/video-remotion/src/character/WorldLayer.tsx` | 画世界：天空/远山/草地/围栏/树/长椅/沙坑/摩天轮 + 整座滑梯（`withSlide`） |
| `src/video-remotion/src/character/setpiece.ts` | 布景几何唯一来源（`slideLadderX`、`ladderRungYs`、`slideBounds`…） |
| `src/video-remotion/src/character/Puppet2D.tsx` | 有 `world` 时用 `cameraForWorld` 取景；爬梯动作整条 plan 平移到 `worldLadderX` |
| `src/video-remotion/src/three/ThreeActionStage.tsx` | 同上；滑梯几何取 `world.slide`；背景用 `WorldLayer withSlide={false}` |
| `video-generation-agent.service.ts` | `resolveLessonWorld()`：整节课算一次，逐幕下发同一份 `world` + `setpiece` |
| `video/action3d-registry.ts` | `MOTION_DEFAULTS.slide` 是世界坐标的唯一定义 |

老任务没有 `world` 字段 → `normalizeWorld` 返回 `null` → 退回原来的"按幕拟合"路径，
不会因为缺字段而白屏。

## 效果

抽帧（`node scripts/render-storyboard-lesson.cjs --still <frame>`，真实分镜
《小熊玩滑梯》5 幕 900 帧）：

| 帧 | 幕 | 看到什么 |
|---|---|---|
| 60 | 说话 | 熊站在爬梯脚下指向滑梯；梯子后方就是平台与滑道 |
| 250 | 爬梯 | 熊在梯子中段，横档在脚下；梯子顶端正接平台，平台右侧接滑道 |
| 420 | 滑梯 | 熊在滑道上；同一座滑梯、同一个摩天轮、同一条围栏 |
| 470 | 滑梯末 | 熊落在滑道末端前方的草地上（`end.x + 0.8`） |

比例对照：四帧里熊的站高 299px、滑梯高度 695px，比值恒定；此前同一只熊在
说话幕与滑梯幕相差约 1.5 倍。

## 局限

1. **2D 与 3D 是两种渲染器，风格不可能完全一致**。几何、颜色、位置已经同源，
   但三维侧面受光照影响偏暗（滑道侧面读作深棕，二维是同色平涂）。要彻底一致
   得统一材质，属另一个课题。
2. **爬梯仍只走二维**（`climb` 是 2D 独占原语），所以"爬"和"滑"两幕的熊
   画法不同——这是既有的渲染器分工，不是本次改动引入的。
3. **`ppu` 常常锁在 base**。焦点盒包含整座滑梯时 `fit < base`，变焦被夹到 1.0，
   滑梯幕因此总是全景。这是刻意的（宁可不推近，也不裁掉正在用的装置），
   副作用是滑梯幕与说话幕的景别差不够明显。
4. **装饰允许被裁**。`worldBounds` 只含"必须完整可见"的范围（可演区域 ∪ 滑梯），
   树、围栏、摩天轮是远景，出画不算错。代价是镜头平移到两端时，画面一侧会空。

## 复跑

```bash
# 单帧
cd src/video-remotion && node scripts/render-storyboard-lesson.cjs --still 420
# 整片
node scripts/render-storyboard-lesson.cjs

# 算术守卫（比例、爬梯同源、脏 props）
cd ../backend && npx jest test/unit/lesson-world.spec.ts test/unit/stage-layout.spec.ts
```

改了 `character/world.ts`、`WorldLayer.tsx`、`Puppet2D.tsx`、`ThreeActionStage.tsx`
之后**必须** `npm run sync:three-stage`（后端模板是这些源码的字符串副本）。
