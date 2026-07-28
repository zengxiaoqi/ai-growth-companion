# Bento 集成规划 — 灵犀伴学

> **文档版本**: v1.0  
> **创建日期**: 2026-07-28  
> **项目**: [Bento](https://github.com/nyblnet/bento) — 一个文件 = 一个完整的办公套件，内置编辑器、演示器、播放器

---

## 一、概述

### 1.1 什么是 Bento

Bento 是一个**单 HTML 文件**的幻灯片套件。一个 `.bento.html` 文件包含：
- 完整的幻灯片编辑器（浏览器直接打开即可编辑）
- 演讲者视图和播放功能
- 图表引擎（柱状图/折线图/饼图）
- 动画系统（元素跨页过渡）
- 端到端加密协作
- PDF 导出

**关键特性**：文件顶部是纯 JSON 数据块，任何 AI Agent 都可以直接读写。

### 1.2 集成目标

将 Bento 作为灵犀伴学的**内容呈现和报告生成引擎**，让家长端获得：
- 媲美专业报告的可视化幻灯片
- AI 自动生成内容
- 不依赖任何第三方服务
- 可保存、分享、永久保留

---

## 二、功能规划

### P0 — 核心功能（MVP 优先）

#### 2.1 AI 学习报告幻灯片

**目标**：替代现有的文本版成长报告，转为精美幻灯片

**数据来源**：
- 后端 `Report` 模块：`GET /report`（daily/weekly/monthly）
- `Abilities` 模块：五维能力评估数据
- `Learning` 模块：学习记录
- `Achievements` 模块：成就数据

**幻灯片内容结构**：

```
Slide 1: 封面 — 孩子姓名 + 报告周期 + 年级/年龄
Slide 2: 本周概览 — 学习时长、完成课程数、新解锁成就数
Slide 3: 能力雷达图 — 五维能力对比（嵌入截图或 Bento 原生图表）
Slide 4: 各科趋势 — 近 4 周各科能力变化折线图
Slide 5: 学习内容回顾 — 本周学习了哪些内容，配图标
Slide 6: 成就墙 — 本周解锁的成就徽章
Slide 7: AI 一句话评价 — 个性化鼓励语
Slide 8: 推荐学习内容 — 下周推荐
```

**实现方式**：
- 后端生成 Bento JSON 数据块
- 组装成 `.bento.html` 文件
- 通过 API 返回给前端下载或预览

#### 2.2 AI 诗词鉴赏幻灯片

**目标**：把诗词鉴赏模块的展示升级为幻灯片

**数据来源**：
- `Poetry` 模块：诗词注解、赏析数据
- 文本、图片、翻译

**幻灯片内容结构**：

```
Slide 1: 诗词标题 + 作者 + 朝代
Slide 2: 原文 — 大字排版，适合阅读
Slide 3: 白话翻译 — 逐句解释
Slide 4: 背景故事 — 创作背景 + 作者生平
Slide 5: 赏析 — 重点词句分析
Slide 6: 互动游戏入口 — 点击跳转到 FillBlank 诗词游戏
```

**优势**：Bento 的动画可以让诗词逐句呈现，体验远好于普通文本页面。

#### 2.3 课程内容幻灯片模式

**目标**：为 `lesson_pack` 和 `structured_lesson` 类型内容提供 Bento 视图

**适用场景**：
- 故事类内容 → 翻页式阅读
- 科普类内容 → 图文混合幻灯片
- 课程包 → 目录式导航

**实现方式**：
- 在内容详情页增加「幻灯片模式」切换按钮
- 后端根据内容数据动态生成 Bento HTML
- Flutter 端用 WebView 内嵌展示

---

### P1 — 增强功能

#### 2.4 学习成果分享

**目标**：家长可以将孩子的学习报告分享给家人

**场景**：
- 爷爷奶奶想看看孩子最近学了什么
- 家长群分享学习成果
- 保存到本地作为成长纪念

**流程**：
1. 家长点击「生成分享卡」
2. 后端生成 `.bento.html` 文件
3. 文件通过 `Share.shareXFiles()` 分享
4. 对方用浏览器打开即可查看

**优势**：不需要对方安装任何 App，Bento 文件自带阅读器。

#### 2.5 AI Agent 自动生成内容

**目标**：后端的 AI Agent 框架直接生成 Bento 文档

**现有基础设施**：
- `src/backend/src/modules/ai/` — AI 对话服务
- `src/backend/src/agent-framework/` — Agent 框架
- `src/backend/src/modules/report/` — 报告生成

**新 Agent 工具**：`GenerateBentoDocument`

**工作流程**：
1. Agent 收集数据（报告/诗词/课程）
2. 调用 `GenerateBentoDocument` 工具
3. 工具根据模板和数据生成 Bento JSON
4. 组装成 `.bento.html` 文件
5. 返回文件路径给前端

#### 2.6 多模态内容混合

**目标**：Bento 幻灯片嵌入图片、音频、视频

**集成方式**：
- 诗词配图（从公共 API 或本地资源获取）
- 英文诗歌配音频（TTS 生成）
- 成就徽章图标展示
- 能力雷达图截图

**Bento 原生支持**：图片嵌入、图表绘制，无需额外依赖。

---

### P2 — 进阶功能

#### 2.7 学期/年度成长纪念册

**目标**：将一学期的学习数据打包成一本完整的纪念册

**内容**：
- 学期概览
- 每月亮点
- 能力成长曲线
- 学习的诗词/故事清单
- 解锁的成就全览
- AI 班主任寄语

**意义**：这是家长愿意保存和分享的「作品」，远超普通数据报告。

#### 2.8 协作学习报告

**目标**：利用 Bento 的 E2EE 协作功能，让家长和老师可以协作编辑报告

**场景**：
- 老师可以在报告中添加评语
- 家长可以回复
- 所有数据端到端加密

**实现**：利用 Bento 的 sync relay（blind relay）机制。

#### 2.9 离线学习资料包

**目标**：将多个课程内容打包成一个 Bento 文件，离线可看

**场景**：
- 外出旅行时无网络
- 提前下载好学习内容
- 在偏远地区使用

---

## 三、技术实现方案

### 3.1 架构图

```
┌─────────────────────────────────────────────────────┐
│                   前端 (Flutter)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ 家长端页面   │  │ WebView 容器 │  │ 分享面板    │ │
│  │ (报告入口)  │  │ (内嵌Bento)  │  │ (share_plus)│ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘ │
└─────────┼─────────────────┼──────────────────┼────────┘
          │ HTTP            │ 文件下载         │ 文件分享
          ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────┐
│                   后端 (NestJS)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ BentoService │  │ AI Agent     │  │ Report      │ │
│  │ (生成/管理)  │  │ (自动生成)   │  │ (数据源)    │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                │                   │       │
│  ┌──────┴────────────────┴───────────────────┘       │
│  │ Bento 模板引擎 (JSON 组装)                        │
│  └───────────────────────────────────────────────────┘
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │ bento/ 目录                                       │ │
│  │ ├── templates/  — 幻灯片模板 JSON                 │ │
│  │ ├── output/     — 生成的 .bento.html 文件        │ │
│  │ └── assets/     — 字体、图片等资源                │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 3.2 后端模块设计

**新增模块**: `BentoModule`

```
src/backend/src/modules/bento/
├── bento.module.ts
├── bento.service.ts          — 核心服务：生成、管理 Bento 文件
├── bento.controller.ts       — API 端点
├── interfaces/
│   ├── bento-document.interface.ts  — Bento JSON 类型定义
│   └── bento-template.interface.ts  — 模板接口
├── templates/
│   ├── report-weekly.ts       — 周报模板
│   ├── report-monthly.ts      — 月报模板
│   ├── poetry.ts              — 诗词鉴赏模板
│   ├── lesson-pack.ts         — 课程包模板
│   └── achievement.ts         — 成就展示模板
└── generators/
    ├── bento-file.generator.ts    — 生成 .bento.html 文件
    └── bento-json.generator.ts    — 生成 Bento JSON 数据块
```

### 3.3 API 设计

```
# 学习报告幻灯片
POST   /bento/report/weekly/:childId      → 生成周报幻灯片
POST   /bento/report/monthly/:childId     → 生成月报幻灯片
POST   /bento/report/daily/:childId       → 生成日报幻灯片

# 诗词鉴赏幻灯片
POST   /bento/poetry/:poetryId            → 生成诗词幻灯片

# 课程内容幻灯片
POST   /bento/lesson/:contentId           → 生成课程幻灯片

# 通用
GET    /bento/:fileId                     → 下载 .bento.html 文件
DELETE /bento/:fileId                     → 删除已生成的文件
POST   /bento/from-json                   → 从 JSON 数据生成 Bento 文件
```

### 3.4 Bento JSON 数据模型映射

Bento 的文档模型（参考 `slides/src/model.ts`）核心结构：

```typescript
interface BentoDoc {
  slides: Slide[];       // 幻灯片列表
  theme: Theme;          // 主题配置
  metadata: Metadata;    // 元数据
}

interface Slide {
  id: string;
  elements: Element[];   // 元素列表（文本、图片、图表等）
  background?: Background;
  transition?: Transition;
}
```

灵犀伴学需要封装的模板引擎：

```typescript
// 模板引擎抽象
interface BentoSlideTemplate {
  // 每个模板负责将应用数据转换为 Bento Slide 数组
  toSlides(data: ReportData | PoetryData | LessonData): Slide[];
}
```

### 3.5 前端集成

**Flutter 端**：

```dart
// 1. 报告入口（家长端首页）
Widget buildReportButton() => ElevatedButton(
  onPressed: () => _generateBentoReport(),
  child: Text('生成学习报告幻灯片'),
);

// 2. WebView 预览
Widget buildBentoPreview(String fileUrl) => WebViewWidget(
  initialUrl: fileUrl,  // 后端返回的 .bento.html URL
);

// 3. 分享
Future<void> shareBentoFile(String filePath) async {
  await Share.shareXFiles([XFile(filePath)], text: 'xx的学习报告');
}
```

**Flutter Web 端**：
- 直接使用 `iframe` 或 `WebView` 加载 Bento 文件
- 无需额外依赖

---

## 四、实施路线

### Phase 1 — 基础能力（1-2 天）

| 任务 | 说明 | 预估 |
|------|------|------|
| 1.1 | 搭建 Bento 模板引擎骨架 | 4h |
| 1.2 | 实现周报模板（8 页幻灯片） | 4h |
| 1.3 | 实现 `BentoService` 核心生成逻辑 | 4h |
| 1.4 | 后端 API 端点 | 2h |
| 1.5 | 前端报告入口 + WebView 预览 | 3h |

**产出**：周报可以生成并预览

### Phase 2 — 内容增强（2-3 天）

| 任务 | 说明 | 预估 |
|------|------|------|
| 2.1 | 诗词鉴赏模板 | 4h |
| 2.2 | 课程内容模板 | 3h |
| 2.3 | 分享功能集成 | 2h |
| 2.4 | 图表嵌入（能力雷达图、趋势图） | 4h |
| 2.5 | 动画效果配置 | 2h |

**产出**：多种内容类型支持 Bento 展示

### Phase 3 — AI 自动化（2-3 天）

| 任务 | 说明 | 预估 |
|------|------|------|
| 3.1 | `GenerateBentoDocument` Agent 工具 | 4h |
| 3.2 | AI 自动生成报告幻灯片 | 4h |
| 3.3 | 学期纪念册模板 | 3h |
| 3.4 | 模板可配置化（主题色、字体） | 2h |

**产出**：AI Agent 可以自动生成 Bento 文档

### Phase 4 — 优化（1-2 天）

| 任务 | 说明 | 预估 |
|------|------|------|
| 4.1 | 文件缓存与清理策略 | 2h |
| 4.2 | 错误处理与降级方案 | 2h |
| 4.3 | 多语言支持 | 2h |
| 4.4 | 性能优化 | 2h |

**产出**：生产级可用

---

## 五、Bento 开源项目的优势与风险

### 优势

| 维度 | 说明 |
|------|------|
| **零依赖** | 单 HTML 文件，不依赖任何第三方服务或 CDN |
| **AI 友好** | 数据是纯 JSON，AI Agent 可以直接读写 |
| **永久可用** | 2026 年保存的文件，10 年后照样能打开 |
| **开源** | MIT 协议，可自由修改和集成 |
| **轻量** | ~560 KB，嵌入到 API 响应中无压力 |
| **本地优先** | 支持完全离线使用 |

### 风险与应对

| 风险 | 应对 |
|------|------|
| 项目活跃度不确定 | 核心功能（单文件自包含）已完整可用，即使不更新也能用 |
| 浏览器兼容性 | 使用 File System Access API → 有 download fallback |
| 对 Flutter 的集成复杂度 | 通过 WebView 或文件下载，无需深度嵌入 |
| 中文字体渲染 | Bento 支持自定义字体，后端可嵌入系统字体 |

---

## 六、与现有功能的关系

| 现有功能 | Bento 集成方向 | 关系 |
|---------|---------------|------|
| 成长报告 (`Report` 模块) | 幻灯片版报告 | 增强替代 |
| 诗词鉴赏 (`Poetry` 模块) | 诗词幻灯片 | 展示增强 |
| 课程内容 (`Contents` 模块) | 幻灯片模式 | 新增视图 |
| 成就系统 (`Achievements`) | 成就墙幻灯片 | 展示增强 |
| 分享功能 (`Share.shareXFiles`) | 分享 Bento 文件 | 复用 |
| AI Agent 框架 | 自动生成 Bento 文档 | 新能力 |
| 视频下载 | Bento 文件也可以下载保存 | 类似模式 |

---

## 七、附录

### A. Bento 项目参考链接

- GitHub: https://github.com/nyblnet/bento
- 官网: https://bento.page
- 在线体验: https://bento.page/slides
- 下载: https://bento.page/releases/slides/Bento_Slides.bento.html
- Agent 文档: https://bento.page/agents.md

### B. 相关文件

- 项目架构图: `docs/product-architecture.mmd`
- 实施路线图: `docs/ROADMAP.md`
- 任务看板: `docs/TASK-BOARD.md`