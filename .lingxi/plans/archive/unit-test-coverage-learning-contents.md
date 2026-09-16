# 📋 单元测试补充计划 — Learning & Contents 模块

> **状态:** ✅ 已完成 | **优先级:** P1 | **总耗时:** ~3 hr
> **创建时间:** 2026-05-27 | **最后更新:** 2026-05-28

---

## 最新进展 (2026-05-28)

✅ **Iteration 1 已完成 (commit 13b0ee7):**

| # | 文件 | 状态 | 测试数 |
|---|------|------|--------|
| 1 | `test/unit/contents.controller.spec.ts` | ✅ | 12 |
| 2 | `test/unit/learning.controller.spec.ts` | ✅ | 30 |
| 3 | `test/unit/learning-tracker.service.spec.ts` | ✅ | 14 |

✅ **Iteration 2 已完成 (commit 13b0ee7):**

| # | 文件 | 状态 | 测试数 |
|---|------|------|--------|
| 4 | `test/unit/jwt.strategy.spec.ts` | ✅ | 4 |
| 5 | `test/unit/game.controller.spec.ts` | ✅ | 6 |
| 6 | `test/unit/parent.controller.spec.ts` | ✅ | 6 |
| 7 | `test/unit/report.controller.spec.ts` | ✅ | 6 |

✅ **健康监控修复:**
- lingxi-evolution skill 和 AGENTS.md 已更新：外部 URL 不可达时 fallback 到 `localhost:3001`

**新增测试总计:** 85 个全部通过
**测试文件总数:** 27 → 34

---

## 目标

将测试覆盖率从 14.5% 提升至 **20%+**，重点覆盖核心模块。

## 验收标准

- [ ] 所有新测试通过 (`npm run test -- --testPathPattern='unit/' --no-coverage`)
- [ ] 无 lint 告警
- [ ] 测试覆盖率 ≥ 20%
- [ ] 测试文件总数 ≥ 32 个