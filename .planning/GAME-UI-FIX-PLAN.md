---
name: Game Components UI/UX Fix Plan
created: 2026-04-02
status: completed
---

# 游戏组件 UI/UX 修复计划

基于 UI/UX Pro Max 规范审查，聚焦屏幕适配和 3-6 岁儿童操作友好性。

---

## P0 - 必须修复

### P0-1: SequencingGame 拖拽改为点按交换
- **问题**: HTML5 拖拽对 3-4 岁精细运动技能不足，无法可靠拖拽
- **修复**: 增加"点按交换模式" — 点击一项高亮，再点击另一项交换位置，保留拖拽作为备选
- **文件**: `src/frontend-web/src/components/games/SequencingGame.tsx`
- **规范**: `gesture-alternative` (不依赖手势交互)、`touch-target-size` (48px 最小)

### P0-2: QuizGame 选项字母圈太小
- **问题**: 字母圈 `w-7 h-7` = 28px，远低于 44px 最小触控目标
- **修复**: 字母圈改为 `w-10 h-10` (40px)，选项按钮加 `min-h-[48px]`、`py-4`
- **文件**: `src/frontend-web/src/components/games/QuizGame.tsx`
- **规范**: `touch-target-size` (48dp Material Design)

### P0-3: 所有游戏按钮统一最小触控高度
- **问题**: 部分按钮 `py-3` 仅约 42px 总高度
- **修复**: 所有主要操作按钮统一 `min-h-[48px]`，包括选项、提交、下一题按钮
- **文件**: QuizGame, FillBlankGame, TrueFalseGame, ConnectionGame, SequencingGame, PuzzleGame
- **规范**: `touch-target-size`、`touch-spacing`

---

## P1 - 强烈建议

### P1-1: MatchingGame 响应式网格
- **问题**: 固定 `grid-cols-3`，4 对 = 8 张牌在小屏太挤
- **修复**: 改为响应式 `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`
- **文件**: `src/frontend-web/src/components/games/MatchingGame.tsx`
- **规范**: `mobile-first`、`breakpoint-consistency`

### P1-2: ConnectionGame 小屏上下布局
- **问题**: 双列 `flex-1` 在 < 360px 屏幕上文字被挤压
- **修复**: 小屏改为上下布局（左列在上、右列在下），中屏以上保持左右布局
- **文件**: `src/frontend-web/src/components/games/ConnectionGame.tsx`
- **规范**: `mobile-first`、`horizontal-scroll` (避免水平溢出)

### P1-3: SequencingGame / PuzzleGame 最大宽度限制
- **问题**: 无最大宽度限制，大屏过度拉伸
- **修复**: 添加 `max-w-lg mx-auto`
- **文件**: SequencingGame.tsx, PuzzleGame.tsx
- **规范**: `container-width`

### P1-4: PuzzleGame 网格大小自适应
- **问题**: `maxWidth: cols * 90px` 仅在小屏合理
- **修复**: 平板/大屏加 `max-w-md mx-auto`，保持居中
- **文件**: `src/frontend-web/src/components/games/PuzzleGame.tsx`
- **规范**: `container-width`、`touch-density`

---

## P2 - 改善体验

### P2-1: 补充 aria-label 无障碍标签
- **问题**: 大量交互元素缺少 aria-label
- **修复**: 所有按钮添加描述性 aria-label，空状态添加无障碍文本
- **文件**: 全部游戏组件
- **规范**: `aria-labels`、`alt-text`

### P2-2: prefers-reduced-motion 支持
- **问题**: 所有动画无 reduced-motion 降级
- **修复**: 添加 Tailwind `motion-reduce:` 前缀，关键动画在 reduced-motion 下降低/跳过
- **文件**: 全部游戏组件
- **规范**: `reduced-motion`

### P2-3: 年龄分级难度提示
- **问题**: 3-4 岁和 5-6 岁使用相同 UI
- **修复**: 3-4 岁多加 emoji/图标辅助，减少纯文字依赖（通过 data 层调整，组件预留）
- **文件**: 后端 generate-activity 的 prompt 模板
- **规范**: `style-match`、`cognitive-load`

---

## 执行顺序

1. P0-2 (QuizGame 字母圈) → 2. P0-3 (全局按钮高度) → 3. P0-1 (SequencingGame 点按交换) → 4. P1-1 (MatchingGame 响应式) → 5. P1-2 (ConnectionGame 小屏布局) → 6. P1-3/P1-4 (最大宽度) → 7. P2-1 (aria-label) → 8. P2-2 (reduced-motion)
