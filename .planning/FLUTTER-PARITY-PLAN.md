# Flutter 端功能完善计划

目标：根据 Web 端功能，完善 Flutter 端（灵犀伴学）

## 功能差距分析

### 已有（Flutter）
- SplashScreen
- ChildHomeScreen
- ParentHomeScreen
- AIChatScreen
- AchievementScreen
- LearningHomeScreen
- ProfileScreen
- UserProvider, ContentProvider, LearningProvider
- ApiService, AiService, StorageService

### 缺失（需从 Web 端对齐）

#### Phase 1: 基础框架 ✅
1. **登录/注册页面** ✅ — auth/login_screen.dart (505行)
2. **模式选择页面** ✅ — auth/mode_selection_screen.dart (242行)
3. **底部导航** ✅ — parent_home_screen.dart 内嵌 BottomNav
4. **TopBar** ✅ — parent_home_screen.dart 内嵌 TopBar
5. **设置页面** ✅ — settings/settings_screen.dart (300行)
- **路由更新** ✅ — app.dart 已更新
- **API 接口扩展** ✅ — api_service.dart 新增登录/注册/课程进度等接口
- **Provider 扩展** ✅ — user_provider.dart, content_provider.dart
- **Storage 扩展** ✅ — storage_service.dart 新增 token/用户信息存储

#### Phase 2: 孩子端增强 ✅ 基本完成
6. **内容详情页** ✅ — content/content_detail_screen.dart (650行)
7. **结构化课程视图** ✅ — learning/structured_lesson_view.dart (705行)
8. **游戏系统**（7/7种 + 框架）✅
   - GameRenderer ✅ — games/game_renderer.dart (320行)
   - GameCompletionScreen ✅ — games/game_completion_screen.dart (142行)
   - QuizGame ✅ — games/quiz_game.dart (334行)
   - TrueFalseGame ✅ — games/true_false_game.dart (305行)
   - MatchingGame ✅ — games/matching_game.dart (402行)
   - FillBlankGame ✅ — games/fill_blank_game.dart (478行)
   - SequencingGame ✅ — games/sequencing_game.dart (460行)
   - ConnectionGame ✅ — games/connection_game.dart (411行)
   - PuzzleGame ✅ — games/puzzle_game.dart (366行)
9. **通知面板** ✅ — notification_panel.dart (150行)

#### Phase 3: 家长端增强 ✅ 基本完成
10. **家长控制面板** ✅ — parent/parental_controls_screen.dart (534行)
11. **能力雷达图** ✅ — parent/ability_radar_screen.dart (473行，fl_chart)
12. **能力趋势图** ✅ — parent/ability_trend_screen.dart (466行，fl_chart)
13. **作业管理** ✅ — parent/assignment_manager_screen.dart (1441行)
14. **课程包管理** ✅ — parent/course_pack_manager_screen.dart (836行)
15. **成长报告** ✅ — parent/growth_report_screen.dart (939行，fl_chart)
16. **课程生成器** ❌ — 移动端简化，合并到课程包管理中
17. **AI 洞察面板** ✅ — parent/ai_insights_panel.dart (432行)
18. **孩子选择器** ✅ — parent/child_selector.dart (233行)

#### Phase 4: 高级功能 ✅ 完成
19. **紧急呼叫** ✅ — child/emergency_call_screen.dart (542行)
20. **动画场景播放器** ✅ — learning/animation_scene_player.dart (737行)

## 进度汇总
- **Phase 1**: ✅ 全部完成
- **Phase 2**: ✅ 90% 完成（7种游戏全部完成！）
- **Phase 3**: ✅ 87% 完成（7/8个组件完成，课程生成器合并到课程包管理）
- **Phase 4**: ✅ 全部完成（紧急呼叫 + 动画场景播放器）

**总体进度: ~90%**

## 实现顺序
Phase 1 → Phase 2 → Phase 3 → Phase 4

## 技术要点
- 状态管理：已有 Provider + Riverpod，继续使用
- 图表：使用 fl_chart 包实现雷达图和趋势图
- 游戏：使用 Flutter 原生 Widget 实现，不依赖 p5.js/Three.js
- API 对接：已有 ApiService，扩展新接口
