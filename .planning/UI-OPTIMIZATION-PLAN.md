# UI 优化方案文档

## 项目信息

- **项目**: 灵犀伴学 (AI Growth Companion)
- **前端**: React 19 + Vite 6 + Tailwind CSS v4
- **日期**: 2026-03-31
- **范围**: `src/frontend-web/` 全部组件

---

## 一、问题总览

| 优先级 | 类别 | 问题数 | 影响范围 |
|--------|------|--------|----------|
| P0 | 无障碍 (Accessibility) | 5 | 所有交互组件 |
| P0 | 触控交互 (Touch) | 4 | StudentDashboard, AIChat |
| P1 | 性能 (Performance) | 5 | 全局 |
| P1 | 布局响应式 (Layout) | 4 | ModeSelection, Dashboard |
| P1 | 动画 (Animation) | 4 | 所有动画组件 |
| P2 | 表单体验 (Forms) | 4 | Login, Register, ModeSelection |
| P2 | 颜色排版 (Typography) | 3 | 全局 |
| P2 | 图表数据 (Charts) | 4 | ParentDashboard |

---

## 二、P0 — 立即修复

### 2.1 无障碍修复

| # | 问题 | 文件 | 修复方案 |
|---|------|------|----------|
| 1 | icon-only 按钮缺少 aria-label | AIChat, StudentDashboard, ParentDashboard, ContentDetail | 所有纯图标按钮添加 `aria-label` |
| 2 | 聊天消息无 aria-live | AIChat.tsx | 消息容器加 `aria-live="polite"` |
| 3 | Quiz 选项用 div 而非语义化元素 | QuizEngine.tsx | 改用 fieldset/legend + radio input |
| 4 | input focus ring 不可见 | LoginScreen, RegisterScreen | 移除 `focus:outline-none`，改用 `focus:ring-2 focus:ring-primary` |
| 5 | 动态内容无屏幕阅读器通知 | QuizEngine 反馈、语音波形 | 加 `role="status"` / `aria-live` |

### 2.2 Emoji 替换为 SVG

| # | 当前 | 替换为 | 文件 |
|---|------|--------|------|
| 1 | 🌱 (种子) | `<Sprout />` lucide icon | AchievementShowcase |
| 2 | 🌿 (发芽) | `<Sprout className="text-green-500" />` | AchievementShowcase |
| 3 | 🌳 (小树) | `<TreePine />` | AchievementShowcase |
| 4 | 🏆 (奖杯) | `<Trophy />` | AchievementShowcase, QuizEngine |
| 5 | 🔒 (锁) | `<Lock />` / `<LockOpen />` | AchievementShowcase |
| 6 | ⭐ (星星) | `<Star />` | 多个组件 |

### 2.3 触控目标修复

| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| 1 | 导航栏图标 < 44px | StudentDashboard 底部导航 | 加 `min-w-[48px] min-h-[48px]` |
| 2 | Emergency FAB 太小 | StudentDashboard | 从当前尺寸扩大到 48×48 |
| 3 | 设置/退出图标点击区域不足 | StudentDashboard header | 用 `p-2` 扩展 touch target |
| 4 | 聊天面板移动端缺少关闭手势 | AIChat | 添加 `drag="y"` 下拉关闭 |

---

## 三、P1 — 短期优化

### 3.1 性能优化

| # | 优化项 | 文件 | 方案 |
|---|--------|------|------|
| 1 | 路由级代码分割 | App.tsx | `React.lazy()` + `Suspense` 拆分 Dashboard、ContentDetail 等 |
| 2 | 图片懒加载 | StudentDashboard, ContentDetail | `<img loading="lazy" />` |
| 3 | 图片尺寸声明 | 推荐卡片、内容缩略图 | 添加 `width`/`height` 或 `aspect-ratio` |
| 4 | 硬编码颜色替换为 token | 多处 `text-gray-500`, `bg-gray-100` | 替换为自定义 token |

### 3.2 布局响应式

| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| 1 | ModeSelection 固定 w-80 | ModeSelection.tsx | 改为 `w-full max-w-xs` |
| 2 | 底部导航遮挡内容 | Dashboard | 主内容区加 `pb-20` |
| 3 | 推荐轮播无滚动指示 | StudentDashboard | 加分页 dots |
| 4 | 全屏 overlay 缺少返回手势 | ContentDetail, AchievementShowcase | 添加边缘滑动返回 |

### 3.3 动画优化

| # | 问题 | 方案 |
|---|------|------|
| 1 | 无 reduced-motion 支持 | 引入 `useReducedMotion()` hook，reduced 时简化/禁用动画 |
| 2 | 语音波形无 reduced 支持 | reduced 时改为静态播放指示器 |
| 3 | 缺少退出动画 | 视图切换添加 `exit` 属性，时长为 enter 的 60-70% |
| 4 | Quiz 完成动画过重 | 减少同时动画元素为 1-2 个 |

---

## 四、P2 — 中期改进

### 4.1 表单体验

| # | 优化 | 文件 |
|---|------|------|
| 1 | onBlur inline validation | LoginScreen, RegisterScreen |
| 2 | 密码显示/隐藏切换 | LoginScreen, RegisterScreen |
| 3 | PIN 输入短暂显示后掩码 | ModeSelection |
| 4 | 空状态引导文案 | 课程列表、成就列表 |

### 4.2 颜色排版一致性

| # | 优化 | 方案 |
|---|------|------|
| 1 | 中文字体回退 | index.css 添加 PingFang SC / Microsoft YaHei |
| 2 | 硬编码颜色统一 | 全部替换为语义化 token |
| 3 | 行高统一 | body `leading-relaxed`，标题 `leading-tight` |

### 4.3 图表改进

| # | 优化 | 文件 |
|---|------|------|
| 1 | 添加 Tooltip | ParentDashboard 所有 recharts |
| 2 | 数据为空时显示空状态 | ParentDashboard |
| 3 | 雷达图添加 Legend | ParentDashboard |
| 4 | 色盲友好配色 | ParentDashboard 图表色板 |

---

## 五、执行计划

### Phase 1: P0 无障碍 + 触控 (本次执行)

```
1. AchievementShowcase — Emoji → SVG 图标替换
2. QuizEngine — 语义化 HTML (fieldset/radio) + aria 属性
3. AIChat — aria-live + 手势关闭
4. 全组件 — icon-only 按钮 aria-label 补全
5. Login/Register — focus ring 修复
6. Dashboard — 触控目标尺寸修复
```

### Phase 2: P1 性能 + 布局 + 动画

```
1. App.tsx — React.lazy 代码分割
2. 全组件 — 图片 lazy loading + 尺寸声明
3. 响应式布局修复 (ModeSelection, 底部导航间距)
4. 推荐轮播分页指示器
5. useReducedMotion hook + 全组件适配
6. 退出动画补全
```

### Phase 3: P2 表单 + 排版 + 图表

```
1. 表单 inline validation + 密码切换
2. 中文字体回退 + 颜色 token 统一
3. 图表 Tooltip + 空状态 + Legend
4. 空状态引导文案
```

---

## 六、验证标准

- [ ] 所有 icon-only 按钮有 aria-label
- [ ] 所有触控目标 ≥ 44px
- [ ] 无 emoji 作为结构性图标
- [ ] Focus ring 在所有可交互元素上可见
- [ ] Quiz 使用语义化 HTML
- [ ] 聊天消息有 aria-live
- [ ] 图片有 lazy loading 和尺寸声明
- [ ] 动画尊重 prefers-reduced-motion
- [ ] 布局在 375px / 768px / 1024px 均正常
- [ ] 颜色对比度 ≥ 4.5:1
