# 灵犀伴学 UI 审查与优化方案（unslop 审查）

> 审查方法基于 [unslop](https://heydamir.design/unslop) by Damir Sokolovsky (@heydamir)，CC BY 4.0。
> 审查日期：2026-11-08。范围：`src/frontend-web`（React Web）与 `src/frontend`（Flutter）。

---

## 一、总体判断：轻到中度 slop

好消息：两个前端都**没有**重度 AI 味的重灾区——没有紫蓝渐变、没有渐变文字（`bg-clip-text`）、没有发光霓虹边框、没有 emoji 导航栏。React 端的蜜黄暖色主题（`index.css` 的 Material You 黄色系）是一个真实的设计决策，符合"儿童 + 温暖"的产品世界，**应当保留并作为方向核心**。

需要修复的是一批"模型打字那天的随手痕迹"：彩色光斑、900 字重标题、Sparkles 滥用、无限循环动画、两端品牌分裂。

### 方向（Direction）

| 项 | 内容 |
| --- | --- |
| **产品** | 为 3–6 岁儿童设计的 AI 学习陪伴应用：个性化课程、互动游戏、AI 对话；家长端提供报告与管控。双端（儿童 / 家长）。 |
| **性格** | 温暖、柔软、有耐心。不是喧闹的游乐场，是陪孩子读绘本的大人。 |
| **世界** | 纸质绘本与幼儿园教室——奶油纸色、蜜黄、蜡笔质感。现有蜜黄主题正是这个世界的底色，保留。 |
| **亮点时刻（Moments）** | ① 儿童端的"今日任务"卡与 AI 伙伴对话气泡；② 家长端的成长报告图表。颜色与丰富度集中在这里，其余界面保持安静。 |
| **签名细节（Signature）** | 蜜黄主色 + 软按压反馈（`shadow-tactile` / `tactile-press`）——这是只有触控儿童产品才会有的细节，全局统一使用，不再叠加其他装饰。 |

---

## 二、问题清单（Audit）

### A. React Web（`src/frontend-web`）

#### A1. 色彩与表面

| # | 问题 | 位置 | 修复 |
| --- | --- | --- | --- |
| A1-1 | 背景彩色光斑（blur 光球）共 **15 处** | `ModeSelection.tsx:50-51,69,99`、`StudentDashboard.tsx:476-477,521`、`ParentDashboard.tsx:456-457` 等 | 全部删除；深度改由表面层次 + 细边框（hairline）表达 |
| A1-2 | `body` 上两处 `radial-gradient` 彩色光晕 + 三段式渐变底色 | `index.css:157-160,166-171` | 改为纯色 `#fff7d5`（暗色 `#1f1f17`），光斑删除 |
| A1-3 | 五色 domain 彩虹（`#ff6b6b / #4ecdc4 / #45b7d1 / #ffa07a / #98d8c8`，典型 AI 生成色值） | `index.css:45-49` | 收敛到主题色系：从蜜黄/天空蓝/草绿派生，饱和度调低；仅用于分类标识小色点，不做大面积铺色 |
| A1-4 | 玻璃拟态导航 `backdrop-blur(20px)` 半透明白 | `index.css:341-346 floating-nav` | 可选保留（底部导航合理），但去掉 20px 大模糊，改为纯色 + 顶部 hairline |
| A1-5 | `panel-card` 使用白色→奶白对角渐变 | `index.css:324,333` | 改纯色 `#fffdf6`（暖白表面），阴影保留中性色 |

#### A2. 字体与排版

| # | 问题 | 位置 | 修复 |
| --- | --- | --- | --- |
| A2-1 | `font-black`（900 字重）**131 处、35 个文件**，标题全部超粗 | 全局，`StudentDashboard.tsx` 9 处、`ParentDashboard.tsx` 8 处、`ModeSelection.tsx` 3 处等 | 统一降为 `font-medium`（500）/ `font-semibold`（600，仅页面主标题）；层级靠字号与颜色，不靠字重 |
| A2-2 | `uppercase tracking-widest` 小标签 | `StudentDashboard.tsx:1079` | 改 sentence case、正常字距 |
| A2-3 | `text-[10px]` 大量出现（AIChat 20+ 处） | `AIChat.tsx:1032…2252`、`StudentDashboard.tsx:1079,1139` | 提到 12px 下限；`text-[10px]` 全部清除 |
| A2-4 | 字体加载权重 400–900 全量引入 | `index.css:1` | 只保留 400/500/600，减小加载体积 |

#### A3. 图标

| # | 问题 | 位置 | 修复 |
| --- | --- | --- | --- |
| A3-1 | Sparkles（✨）图标 **49 处**，"AI" 一律加 sparkle | `StudentDashboard.tsx:712,800,943,1042,1138`、`ParentDashboard.tsx:784`、`ModeSelection.tsx:56` 等 | 只在"AI 正在工作"的一处保留（如 AI 对话入口），其余删除或换语义图标 |
| A3-2 | emoji 充当图标：`💬 碎碎念`、`🔊 朗读`、`🔒`、`🏅`、`⚠️` | `AIChat.tsx:1077,1599`、`StructuredLessonView.tsx:874`、`StudentDashboard.tsx:1184`、`ReportDetail.tsx:343`、`VoiceCallOverlay.tsx:450` | 全部换为 lucide 线性图标（`@/icons`），统一 16/18px、stroke 1.5、颜色跟随文字层级 |

#### A4. 动效

| # | 问题 | 位置 | 修复 |
| --- | --- | --- | --- |
| A4-1 | `animate-gentle-float` 无限漂浮 **11 处** | 引用 `index.css` 该 utility 的组件（吉祥物、装饰元素） | 删除；吉祥物静态即可，若需"活"感仅在 AI 说话时做一次性动画 |
| A4-2 | `transition-all` 多处（StudentDashboard 6 处、AIChat 15 处等） | 全局 | 改具名 `transition-colors` / `transition-[transform,box-shadow]` |
| A4-3 | `tactile-press` scale(0.95) 偏大 | `index.css:202-206` | 收敛到 0.97–0.98；保留按压位移（这是签名细节） |
| A4-4 | `animate-shimmer` 骨架屏 1.5s 无限循环 | `index.css:261-270` | 可保留（骨架屏属合理用途），但节奏放缓至 2s 且只用于加载占位 |

> 语音场景的 `voice-pulse` / `sound-bar` 是"实时状态"动画，**保留**。

#### A5. 文案与细节

| # | 问题 | 位置 | 修复 |
| --- | --- | --- | --- |
| A5-1 | pill 徽章 `✨ 触控友好模式已开启` | `ModeSelection.tsx:55-58` | 删除徽章；这是开发视角文案，不是给家长/孩子的信息 |
| A5-2 | **测试账号密码预填进登录框**（`13800000001 / password123`） | `LoginScreen.tsx:28-29` | 生产环境必须清除（用环境变量 `import.meta.env.DEV` 控制仅开发预填） |
| A5-3 | 吉祥物图片外链 `lh3.googleusercontent.com`（Google AI 生成的临时 URL） | `LoginScreen.tsx:54-59` | 下载为本地资产放 `public/`，外链随时可能失效 |
| A5-4 | 全按钮 `rounded-full` pill 化 + `radius-xl: 3rem` | `index.css:69-70`、各按钮 | 儿童产品可保留较大圆角，但统一刻度：按钮 12–14、卡片 16–20、不要全部 pill |
| A5-5 | 统计数字未用 `tabular-nums` | `StudentDashboard.tsx:553`、`ParentDashboard.tsx:536` | 数字加 `tabular-nums`，格式统一（整数不带小数） |
| A5-6 | `hover:scale` / `active:translate-y-[4px]` 等任意值 | `LoginScreen.tsx:143` 等 | 位移收敛到 2px 步进刻度 |

### B. Flutter（`src/frontend`）

| # | 问题 | 位置 | 修复 |
| --- | --- | --- | --- |
| B1 | **两端品牌分裂**：Flutter 主色樱花粉 `#FF85A2`，React 主色蜜黄 `#705900/#FDD34D` | `lib/theme/app_theme.dart:5` vs `frontend-web/src/index.css` | 统一为蜜黄暖色系（以 React 端设计系统为准迁移），Flutter `primaryColor` 改为 `#FDD34D` 系并重建 `ColorScheme.fromSeed` |
| B2 | 彩色发光阴影 `glowShadow`（8 个文件使用） | `app_theme.dart:109-118` 及使用处 | 删除该函数与全部调用；悬浮阴影统一 `elevatedShadow`（中性色双层） |
| B3 | 彩色阴影 `softShadow` 默认用品牌色 alpha 0.15 | `app_theme.dart:99-107` | 改中性色 `Colors.black.withValues(alpha: 0.06)` |
| B4 | 彩虹渐变定义：`rainbowGradient` / `festivalGradient` / `warmGradient` / `successGradient` | `app_theme.dart:50-75` | 全部删除；成功态用纯 `successColor`，奖励时刻用蜜黄 + 插画表达 |
| B5 | emoji 装饰 8 处 | `lib/screens/**`（🎉🌟✨ 等） | 换 `Icon`（Material Rounded 图标集，与 React 端 lucide 语义对应） |
| B6 | 装饰性泡泡背景 `BubbleBackground`（白色圆点随机漂浮） | `app_theme.dart:376-421` | 删除或改为极少量静态绘本元素；漂浮装饰与 slop 特征"floating elements"同类 |
| B7 | `headlineLarge` 字重 w700 + 负字距 -0.5 | `app_theme.dart:233-252` | 中文标题降为 w500/w600，字距归零（中文负字距影响可读性） |
| B8 | 按钮圆角 24（pill）+ 卡片 20 | `app_theme.dart:78-80` | 统一：按钮 14、卡片 20、输入框 12，嵌套圆角满足 内 = 外 − 内边距 |

---

## 三、优化方案（按优先级分批执行）

### P0 — 生产隐患（立即，改动小收益大）

1. 清除 `LoginScreen.tsx` 预填的测试账号密码（仅 `import.meta.env.DEV` 下预填）。
2. 吉祥物图片本地化：下载到 `frontend-web/public/mascot.png`，替换外链。
3. 检查其余组件是否还有 `googleusercontent.com` 外链（`grep -r "googleusercontent" src/frontend-web`）。

### P1 — 色彩收敛（去 slop 核心）

1. 删除全部 15 处 `blur-3xl` 光斑 div 与 body 上的 radial-gradient，背景回归纯色。
2. `panel-card` / `panel-card-strong` 渐变改纯色暖白。
3. Domain 五色收敛：从蜜黄主题派生低饱和分类色（例如语言 `#c26b5a`、数学 `#4a8f86`、科学 `#4a7f9e`、艺术 `#c98a5a`、社交 `#6f9e7f`），只用于小色点/描边。
4. 全局只有一个 accent（蜜黄 `--color-primary-container`），语义色（success/error/warning）只表状态。

### P2 — 字重与排版

1. `font-black` → `font-medium`，页面主标题最多 `font-semibold`（脚本批量替换 + 人工复核 35 个文件）。
2. `text-[10px]` → `text-xs`（12px）。
3. 删除 `uppercase tracking-widest` 小标签。
4. Google Fonts 只加载 400/500/600。
5. 统计数字加 `tabular-nums`。

### P3 — 图标治理

1. emoji 图标全部替换为 `@/icons`（lucide）：`💬→MessageCircle`、`🔊→Volume2`、`🔒→Lock`、`🏅→Award`、`⚠️→AlertTriangle`、`📖/🔬/🎵→BookOpen/FlaskConical/Music`。
2. Sparkles 49 处收敛到 1 处（AI 对话入口），其余删除或替换语义图标。
3. 统一图标规格：16/18px、stroke 1.5、颜色 = 文字层级色（secondary/muted），与文字间距固定 8px。

### P4 — 动效收敛

1. 删除 `animate-gentle-float` 全部 11 处。
2. `transition-all` → 具名 transition。
3. `tactile-press` scale 0.95 → 0.97。
4. 保留：`voice-pulse`、`sound-bar`（实时状态）、shimmer（仅骨架屏）。

### P5 — Flutter 主题统一

1. `AppTheme.primaryColor` 等色彩对齐 React 蜜黄设计系统。
2. 删除 4 个多色渐变定义与 `glowShadow`。
3. `BubbleBackground` 删除或简化为 1–2 个静态元素。
4. 文本主题字重降级（w700→w500/600），中文负字距归零。

### P6 — 细节统一（最后做）

1. 圆角刻度统一（按钮 12–14 / 卡片 16–20 / 面板 18–20），嵌套圆角满足减法。
2. `floating-nav` 去 20px 大模糊，改纯色 + hairline。
3. 文案复查：界面文字无感叹号、无尾句号、徽章类删除；数字格式统一。

### 明确不动的（产品决策，非 slop）

- 蜜黄暖色主题整体方向（真实设计决策，符合儿童绘本世界）。
- `shadow-tactile` 硬阴影按压感——这是签名细节，儿童触控产品的合理选择。
- 44px 触控目标（`touch-target`）、安全区适配、`prefers-reduced-motion` 支持——这些是良好实践。
- 大圆角风格——儿童产品保留，只做刻度统一而非全部 pill 化。

---

## 四、验收清单（Checklist）

- [ ] 无 `blur-3xl` 光斑、无 body radial 彩色光晕
- [ ] 无 `font-black`；标题 ≤ 600 字重
- [ ] 无 `text-[10px]`；最小字号 12px
- [ ] Sparkles ≤ 1 处；界面无 emoji 图标
- [ ] 无 `animate-gentle-float` / `transition-all`
- [ ] `tactile-press` ≤ 0.98 scale
- [ ] 无测试凭据预填；无 googleusercontent 外链
- [ ] 两端主色一致（蜜黄系）；无彩虹渐变定义
- [ ] 数字 `tabular-nums` 且格式统一
- [ ] 圆角刻度统一，嵌套圆角满足减法
- [ ] 模板测试：把"灵犀伴学"换成别的名字，界面是否仍成立？——固定后应不成立（蜜黄 + 触感按压 + 绘本世界是它自己的）

---

## 五、预期效果

修复后每个界面满足：安静的中性暖色表面 + 唯一蜜黄 accent + 一个亮点时刻（今日任务卡 / 成长报告图表），按压反馈作为签名细节贯穿全局。整体从"每个元素都在喊"变为"内容自己说话"，同时保留儿童产品应有的温暖与触感。
