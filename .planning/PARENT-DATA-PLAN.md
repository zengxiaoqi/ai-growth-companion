---
name: Parent Dashboard Real Data Implementation Plan
created: 2026-04-02
status: in-progress
---

# 家长端功能真实数据替换计划

## 现状分析

后端 parent / assignment / report 模块均已实现真实数据库操作。
前端 ParentDashboard 部分功能使用硬编码/模拟数据，需要替换为真实 API 调用。

---

## P0 - 硬编码模拟数据（必须修复）

### P0-1: 能力趋势数据 — fallbackTrendData
- **问题**: `fallbackTrendData` 是写死的 6 周数据，始终使用假数据
- **修复**: 后端 `report` 模块新增趋势接口 `GET /report/trend?userId=&weeks=6`，前端调用真实 API
- **后端文件**: `src/backend/src/modules/report/report.service.ts`, `report.controller.ts`
- **前端文件**: `src/frontend-web/src/components/ParentDashboard.tsx`, `src/services/api.ts`

### P0-2: 最近掌握技能 — recentMastered
- **问题**: `recentMastered` 是写死的 3 项技能标签
- **修复**: 从 `abilities` 接口或新增 `GET /report/recent-skills?userId=&limit=3` 提取最近提升的能力项
- **后端文件**: `src/backend/src/modules/report/report.service.ts`
- **前端文件**: `src/frontend-web/src/components/ParentDashboard.tsx`, `src/services/api.ts`

### P0-3: AI 洞察面板 — 静态文案
- **问题**: AI 洞察区域显示固定中文文案"逻辑思维发展迅速..."，没有调用 AI
- **修复**: 后端调用 AI 模块基于孩子学习数据生成个性化洞察文本，或从 report 接口的 `insights` 字段取
- **后端文件**: `src/backend/src/modules/report/report.service.ts` (已有 `generateInsights`)
- **前端文件**: `src/frontend-web/src/components/ParentDashboard.tsx`

### P0-4: 百分位排名 — 硬编码 "85%"
- **问题**: "超越了 85% 的同龄学生" 是写死的
- **修复**: 后端计算真实百分位（基于同年龄段用户能力分数），或直接移除该指标
- **后端文件**: `src/backend/src/modules/report/report.service.ts`
- **前端文件**: `src/frontend-web/src/components/ParentDashboard.tsx`

---

## P1 - 功能完善（强烈建议）

### P1-1: 家长布置任务界面
- **问题**: 后端 assignment API 已就绪，前端 AIChat 的 `assignActivity` 工具已实现，但家长端没有独立的"布置任务"入口
- **修复**: ParentDashboard 添加"布置任务"区域，显示科目选择 → AI 生成题目 → 确认布置
- **前端文件**: `ParentDashboard.tsx` 或新建 `AssignTaskPanel.tsx`

### P1-2: 查看孩子任务完成情况
- **问题**: 后端 `GET /assignments/parent/:parentId` 已实现，前端 `api.getParentAssignments()` 已定义但未在家长端展示
- **修复**: 在 ParentDashboard 添加任务列表，显示每个任务的状态（待完成/已完成）、得分
- **前端文件**: `ParentDashboard.tsx`

### P1-3: API 方法不一致
- **问题**: 前端 `updateControls` 用 `PATCH`，后端用 `@Put` 装饰器
- **修复**: 统一为 `@Patch` 或 `@Put`
- **文件**: `src/backend/src/modules/parent/parent.controller.ts`, `src/frontend-web/src/services/api.ts`

---

## P2 - 数据质量（改善体验）

### P2-1: Report 接口 streak 计算 N+1 性能问题
- **问题**: `calculateStreak()` 最多 30 次数据库查询
- **修复**: 改为单次聚合查询 `GROUP BY date(createdAt)`
- **文件**: `src/backend/src/modules/report/report.service.ts`

### P2-2: 能力雷达图降级逻辑
- **问题**: `api.getAbilities()` 失败时使用 `fallbackAbilities` 静默降级，用户无法区分
- **修复**: 显示错误提示或骨架屏，而非假数据
- **文件**: `ParentDashboard.tsx`

---

## 执行顺序

1. P0-1 (能力趋势 API) → 2. P0-2 (最近技能) → 3. P0-3 (AI 洞察) → 4. P0-4 (百分位排名) → 5. P1-3 (API 一致性) → 6. P1-1 (布置任务界面) → 7. P1-2 (任务列表) → 8. P2-1 (性能优化) → 9. P2-2 (降级提示)
