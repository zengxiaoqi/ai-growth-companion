📊 灵犀伴学 每日进化报告 — 2026-11-24

## 近期变更

**上游同步 (29 commits)**:
- `feat(video): 动作改关键帧表，加挥手/拍手/叉腰只改数据` — 核心改动：将肢体动词改为关键帧驱动（puppet keyframe），渲染器零改动
- `feat(video): WorldView 支持整课尺度字段 scaleSlide/scaleRef` — 场景比例统一化
- `refactor(video): 场地改为配方数据，渲染器只认图层原语` — venue system restructured
- `fix(db): add migration for video QA columns missing in production` — 数据库修复（本次分析的起点）

**本地修改**:
- `src/backend/src/modules/voice/edge-tts-v2.ts` + `voice.service.ts` — Edge TTS V2 令牌兼容层重构（将 protocol 模块 patch 改为直接 patch EdgeTTS 类和 Constants 常量）
- `video-generation-agent.service.spec.ts` — 已更新测试断言以匹配 vector→local 路径迁移
- Prettier 格式化若干测试文件

## 当前能力矩阵

| 模块 | 完成度 | 状态 |
|------|--------|------|
| Child Experience | 100% | ✅ Flutter Web 待重建（122 files stale） |
| Parent Dashboard | 100% | ✅ |
| Content System | 100% | ✅ |
| Infrastructure | 100% | ✅ 部署健康 HTTPS:200 |
| Code Quality | 98% | ⚠️ 8 个上游视频生成测试过期需跟进 |

## 指标统计

```
Backend TS files:    361  lines  ~75k
Frontend Dart files: 170  lines  ~85k  
Web files:           132  lines  ~37k
Content JSON:         53  lines  ~8k
Total:             ~205k lines
```

## 测试状态

**整体通过率**: 99.7% (2367 passed / 8 failed)

- ✅ Voice tests (55): 全部通过 — Edge TTS V2 补丁正常编译运行
- ❌ Video-generation-agent (8/20): **上游 venue 重构导致结构变更**，这些测试因 `DYNAMIC_REMOTION_MISSING_CHARACTER_ASSET` 异常而失败 — 属于 upstream 改动需要适配新 API 的预存问题
- ✅ 其余所有 unit 测试: 2367 passed

## 部署状态

```
HTTPS: https://lingxi.chataifree.eu.org/ → 200 OK ✅
Cloudflare Tunnel: active (4 days uptime) ✅
Nginx: ✅ `/uploads/` location 使用 `^~` 优先级 ✅
Flutter Web: v1787475203 (3 days stale, 122 lib files newer than build) ⚠️
Backend process: PID 481, node v22.22.0, running via systemd ✅
```

## 🎯 今日建议行动

| 优先级 | 任务 | 风险 | 备注 |
|--------|------|------|------|
| P0 | 推送本地 voice TTS 改动到 origin/main | 低 | edge-tts-v2.ts + voice.service.ts + 相关测试 |
| P1 | 更新 video-generation-agent.service.spec.ts 中 8 个过期测试 | 中 | 配合上游 venue-keyframe 重构，需理解新的 manifest 结构后修正 |
| P2 | Flutter Web 重建（122 文件 stale） | 低 | 下次有网时执行 `flutter build web` |
| P2 | 清理 git stash（3 条无用历史 stash） | 低 | `git stash drop @{$i}` |

## 🔮 下一步规划

1. **短期（本周）**：将本地语音 TTS 修复推送，处理 8 个过期视频生成测试
2. **中期**：关注 venue-v1 关键帧渲染方案的完整回归验证
3. **长期**：继续推进 Ph6 语音交互增强剩余部分（AI 对话升级）

## 已验证事项

- [x] Backend build clean (`nest build`)
- [x] Voice tests passing (55/55)
- [x] Merge conflict resolved (learning.controller.spec.ts)
- [x] Deployment health checked (HTTPS 200)
- [ ] Flutter Web rebuild (needs network)

---
*分析 #184 · 累计 800 commits · 距离上次分析 2 天*
