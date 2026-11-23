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

## 覆盖范围：哪些幕在世界里，哪些不在

世界层不是"给滑梯特判"，它按**舞台分支**生效。一节课的四类舞台：

| 舞台 | 触发条件 | 背景 | 角色比例 |
|---|---|---|---|
| `Puppet2D` | 单人动词（说/指/走/爬/坐/欢呼） | 世界 | 世界（1.67×ppu） |
| `Puppet2D`（双人） | 递给 / 一起抬 | 世界 | 世界，两人共用一台相机 |
| `ThreeActionStage` | 滑梯 / 拍球 | 世界（`withSlide=false`） | 世界 |
| `ActionStage` | 未知双人动词、3D 不可用时的滑梯降级 | 世界（`SceneBackdrop`，wide） | 固定 320px 徽章 |
| 巨图特写（`plain`） | 无 interaction 的静态幕 | 世界（`SceneBackdrop`，wide） | 760×470 主视觉 |
| `SceneGraphStage` | 关系图 / 画板 | 中性底（刻意） | 无角色 |

场地由**整节课的文本**推出（`resolveLessonWorld`），与主题无关：

- 全篇出现滑梯（滑 / 爬 / 提到"滑梯"）→ `playground` + 那一座滑梯；
- 否则按 habitat 关键词 → `meadow` / `riverside` / `forest` / `night`（缺省 `meadow`）。

### 双人幕也是木偶，不是徽章

上一版"递给 / 一起抬"落在 `ActionStage` 的徽章分支：一个圆里放一张脸，道具沿一条
写死的屏幕弧线飞过去，和全身木偶是两套人物语言——同一个角色在双人幕是头像、
在单人幕是全身，切幕时人物就"换了一种画法"。

根因不是美术，是**骨架只能演一个人**。所以修法不是给这两种动词再画一套，而是让
`Puppet2D` 支持第二个角色（`coStar`），两个角色各有一条播放表、共用一台相机：

- **动作**：两个角色都用 `hold`（托举）——一条手臂朝对方前伸，另一条自然垂着。
  第一版写成"双手在胸前捧着"，画出来是"抱胸比划"：正面视角里手臂只能往身体
  中线折，两道弯朝内。能读成"递过去"的只有伸出去的那条手臂。
- **挂点**：`gripLocal()` 取**前伸的那只手**，再由 `localToWorld()` 施加躯干倾角与
  朝向镜像。道具位置因此是"手算出来的"，换体型、换景别、换动作都自动贴手；
  写死屏幕坐标只能对上其中一帧。
- **站位**：`duoStations(world)` 算两人的世界 x——间距由手臂够得着决定（1.75，
  两条 0.72 的手臂之间剩 0.3，正好放一件道具），有滑梯时整对挪到爬梯外侧，
  不站在结构里。
- **道具归属**：`carryBy: 'handover' | 'shared'`。递给沿一条很浅的弧（抬 0.07）
  从一个人的手移到另一个人的手；一起抬停在两手之间。弧高 0.22 时道具会飞到
  两只手都够不着的高度，画面上是"东西悬在半空"。

守卫：`test/unit/puppet-duo.spec.ts`（14 项：手臂用掉 ≥75% 臂长、挂点在躯干轮廓外、
两人手之间留 0.2~0.6、身体不重叠、有滑梯时不站在结构里、朝向翻转时挂点镜像）；
`video-generation-agent.service.spec.ts` 钉住路由与 `carryBy`；
`check:lesson-template` 增加 `puppet.partner` / `puppet.carryBy` / `coStar:` 三个 token，
双人幕一旦退回徽章分支会直接报缺失。

### 场地的词汇也要跟着场地走

围栏、长椅、沙坑、摩天轮不是"户外背景"，是**游乐园/牧场**的语汇。上一版无条件
画一条横贯全画面的木栅栏，于是《松鼠分果子》的森林里也立着公园围栏——场地词汇
和主题对不上时，孩子读到的不是森林，是"一个有围栏的空地"。

现在 `venueHasFence()` 决定围栏：游乐园 / 草地 / 河边有；森林 / 夜晚没有，改用
更密的树和贴地灌木把两侧填住（否则镜头一平移就只剩空地）。

### 怎么验证它对所有主题生效

`render-storyboard-lesson.cjs` 自己注入 plan / world / habitat，**只对《小熊玩滑梯》
成立**——用它验证"是否所有主题生效"等于自己出题自己判卷。所以要分两步：

```bash
# 1) 任意分镜 → 后端真实装配出来的 props（含 world / setpiece / backgroundStyle）
cd src/backend
npx ts-node --transpile-only scripts/build-lesson-props.ts \
  --file test/fixtures/forest-storyboard.json \
  --out ../video-remotion/out/forest.props.json

# 2) 用这份 props 渲染
cd ../video-remotion
node scripts/render-storyboard-lesson.cjs --props out/forest.props.json --still 180
```

`build-lesson-props.ts` 会把每一幕落到的分支和整节课的场地打出来：

```
[props] 4 幕 600 帧
[props] 分支：1=plain, 2=actor:handover, 3=2d:speak, 4=2d:point
[props] 场地：forest
[props] setpiece：1=-, 2=-, 3=-, 4=-
```

四个分支、一份场地、没有滑梯——这就是"与主题无关"的证据。`test/fixtures/forest-storyboard.json`
是为此加的常驻样例（四幕分别落在四种舞台），`video-generation-agent.service.spec.ts`
里有一条测试钉住它。

## 改动落点

| 文件 | 职责 |
|---|---|
| `src/video-remotion/src/character/world.ts` | 场地类型与配色、`WorldView` 校验、`worldBounds`、`worldScale`、`SHOT_ZOOM`、`cameraForWorld`、装饰布局、`slideLadderTop` / `worldLadderX` |
| `src/video-remotion/src/character/WorldLayer.tsx` | 画世界：天空/远山/草地/围栏/树/长椅/沙坑/摩天轮 + 整座滑梯（`withSlide`） |
| `src/video-remotion/src/character/setpiece.ts` | 布景几何唯一来源（`slideLadderX`、`ladderRungYs`、`slideBounds`…） |
| `src/video-remotion/src/character/Puppet2D.tsx` | 有 `world` 时用 `cameraForWorld` 取景；爬梯动作整条 plan 平移到 `worldLadderX` |
| `src/video-remotion/src/three/ThreeActionStage.tsx` | 同上；滑梯几何取 `world.slide`；背景用 `WorldLayer withSlide={false}` |
| `video-generation-agent.service.ts` | `resolveLessonWorld()`：整节课算一次，逐幕下发同一份 `world` + `setpiece`；`SceneBackdrop` 给双人徽章幕与巨图特写幕补上同一个背景 |
| `backend/scripts/build-lesson-props.ts` | 任意分镜 → 后端真实装配的 props（验证"是否所有主题生效"的唯一可靠入口） |
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

1. **徽章分支仍然存在**（`ActionStage`），但它现在只兜两类边缘情况：未知的双人
   动词、3D 不可用时的滑梯降级。已知双人动词（递给 / 一起抬）已经走木偶。
   要彻底删掉它，得先把 3D 不可用时的滑梯降级也换成木偶（那需要"坐姿沿斜面下滑"
   的二维动作原语）。
2. **巨图特写幕的构图与世界无关**。它是 760×470 的主视觉特写（`portraitFraming`），
   现在站在世界背景前，但"图有多大"仍按特写定律算，不参与世界比例。
3. **2D 与 3D 是两种渲染器，风格不可能完全一致**。几何、颜色、位置已经同源，
   但三维侧面受光照影响偏暗（滑道侧面读作深棕，二维是同色平涂）。
4. **爬梯仍只走二维**（`climb` 是 2D 独占原语），"爬"和"滑"两幕的角色画法不同。
5. **`ppu` 常常锁在 base**。焦点盒包含整座滑梯时 `fit < base`，变焦被夹到 1.0，
   滑梯幕因此总是全景。这是刻意的（宁可不推近，也不裁掉正在用的装置）。
6. **装饰允许被裁，但不许拍不到**。`worldBounds` 只含"必须完整可见"的范围
   （可演区域 ∪ 滑梯），树、围栏、摩天轮是远景，被画面边缘裁到不算错。
   但"摆得比镜头还远"是错的：非滑梯场地的基准缩放 286 px/单位，wide 可见半宽
   只有 ±3.35，摆在 x=10 的树永远在画外——**配方看着茂密，画面是空的**。
   这条现在由 `test/unit/venue-coverage.spec.ts` 逐机位用算术守（含"没有死装饰"）。
7. **离线渲染不能验收角色美术**。`render-storyboard-lesson.cjs` 会把
   `VECTOR_ANIMAL_IDS` 置空，所有角色都走 emoji 兜底（同一个字形，看起来像"两个
   角色画成同一只灰狼"）。这是 harness 的限制，线上白名单是真的。脚本已在该情况下
   打印提示。

## 复跑

```bash
# 单帧（默认《小熊玩滑梯》那份）
cd src/video-remotion && node scripts/render-storyboard-lesson.cjs --still 420
# 整片
node scripts/render-storyboard-lesson.cjs
# 换主题：先由后端真实装配出 props，再渲染（详见"覆盖范围"）
node scripts/render-storyboard-lesson.cjs --props out/forest.props.json --still 180

# 算术守卫（比例、爬梯同源、脏 props）
cd ../backend && npx jest test/unit/lesson-world.spec.ts test/unit/stage-layout.spec.ts
```

改了 `character/world.ts`、`WorldLayer.tsx`、`Puppet2D.tsx`、`ThreeActionStage.tsx`
之后**必须** `npm run sync:three-stage`（后端模板是这些源码的字符串副本）。
