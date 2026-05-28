# 📋 单元测试补充计划 — Learning & Contents 模块

> **状态:** 🔄 进行中 (Iteration 1 部分完成) | **优先级:** P1 | **估算:** 剩余 ~1.5 hr
> **创建时间:** 2026-05-27 | **最后更新:** 2026-05-28

---

## 最新进展 (2026-05-28)

✅ **已完成 (commit b30d310):**
- `contents.service.spec.ts` — +120 行，从 4 个测试扩展到 10 个（parent control filters, childId without record, combined filters, default pagination）
- `learning.service.spec.ts` — +116 行，从 7 个测试扩展到 14 个（findById, findByUser, getTodayStatsWithSources, update edge cases）
- 测试总数: 24 个全部通过（原 11 个）
- 覆盖率: 13.8% → **14.5%**

---

## 剩余任务

### Iteration 1 剩余（~1 hr）

| # | 文件 | 状态 | 估算 |
|---|------|------|------|
| 1 | `test/unit/contents.controller.spec.ts` | ❌ 未开始 | 30 min |
| 2 | `test/unit/learning.controller.spec.ts` | ❌ 未开始 | 45 min |
| 3 | `test/unit/learning-tracker.service.spec.ts` | ❌ 未开始 | 30 min |

### Iteration 2（~1.5 hr）

| # | 文件 | 状态 | 估算 |
|---|------|------|------|
| 4 | `test/unit/jwt.strategy.spec.ts` | ❌ 未开始 | 15 min |
| 5 | `test/unit/game.controller.spec.ts` | ❌ 未开始 | 20 min |
| 6 | `test/unit/game.service.spec.ts` | ❌ 未开始 | 20 min |
| 7 | `test/unit/parent.controller.spec.ts` | ❌ 未开始 | 20 min |
| 8 | `test/unit/report.controller.spec.ts` | ❌ 未开始 | 15 min |

---

## 目标

将测试覆盖率从 14.5% 提升至 **20%+**，重点覆盖核心模块。

## 验收标准

- [ ] 所有新测试通过 (`npm run test -- --testPathPattern='unit/' --no-coverage`)
- [ ] 无 lint 告警
- [ ] 测试覆盖率 ≥ 20%
- [ ] 测试文件总数 ≥ 32 个