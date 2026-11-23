📊 灵犀伴学 每日进化报告 — 2026-11-24

## 近期变更

**本轮分析周期 (8 commits since last report):**
- `d70b6f4` fix(db): add migration for video QA columns missing in production
- `324070b` fix(llm): recover XML-style tool calls emitted in content by gateways
- `64a4599` deploy: expose backend port 3000 for Flutter Web
- `329696f` deploy: mount Flutter Web build into backend static assets
- `149599f` fix(dev): make stop.bat reliably kill process trees and verify ports
- `1874b2d` Merge branch 'main' of ssh://ssh.github.com:443/zengxiaoqi/ai-growth-companion
- `d0a17da` feat: 同步本地课程增强、安全配置与部署文档
- `f234d05` ci: add InstaBox compose deployment config

**本分析报告期间 (8 new commits on upstream main):**
- `4b045cc` feat(video): 动作改关键帧表，加挥手/拍手/叉腰只改数据
- `a774b62` docs: 动作关键帧表方案，原地动作数据化
- `2271622` chore(video): 渲染版本升到 venue-v1
- `86b9790` feat(video): WorldView 支持整课尺度字段 scaleSlide/scaleRef
- `4cb5aad` feat(video): venue 改幕级，场地随幕变、基准缩放整课不变
- + 更多 video 渲染 refactor commits (venue-prefab, puppet skeleton, etc.)

**已提交修复:**
- `8e05740` fix(voice): improve EdgeTTS V2 token patch; fix(video-test): update asset assertions
  - Edge TTS V2 兼容层优化：改用直接 patch class prototype 和 Constants 的方式
  - video-generation-agent 测试断言更新：vector→local 路径迁移

## 当前能力矩阵

| 模块 | 完成度 | 待优化 |
|------|--------|--------|
| Child Experience | 100% | Flutter Web 有 122 文件 stale |
| Parent Dashboard | 100% | ✅ |
| Content System | 100% | ✅ |
| Infrastructure | 100% | ✅ HTTPS 200, tunnel 正常 |
| Code Quality | 98% | ⚠️ 8 个 upstream 视频生成测试需适配新 API |

## 🎯 今日建议行动

1. **P0 — Flutter Web rebuild**: 122 个 lib 文件比构建产物新，需要重建部署到 CDN
2. **P1 — Fix 8 个过期的 video-generation-agent 测试**: upstream venue/puppet 重构后测试断言需要更新
3. **P2 — Git stash cleanup**: 清理 3 条历史无用 stash
4. **P2 — 验证上游 video render 功能**: venue-v1 重构后的实际渲染效果

## 🔮 下一步规划

1. **短期 (本周)**: Flutter Web rebuild → P1 test fixes → 验证所有功能
2. **中期 (P6 收尾)**: 语音交互完整测试 + AI对话升级验证
3. **长期 (Ph7 vision)**: 智能推荐引擎 + 家长社区

## 统计

- **Backend**: 361 TS files, ~75k lines
- **Flutter**: 170 Dart files, ~85k lines  
- **Web**: 132 TS/TSX files, ~37k lines
- **Content**: 53 JSON files, ~8k lines
- **Tests**: 2375 total, 2367 passing, 8 failing (upstream venue API)
- **Deploy**: HTTPS 200 OK, Cloudflare tunnel active 4+ days
- **Flutter Build**: v1787475203 (stale — 122 files newer)

---
*Analysis #184 · Total commits: 801 · Status: Committed & needs rebase-push*
