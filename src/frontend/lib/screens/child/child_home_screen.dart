// UI Refresh: 2026-05-12 — 统一组件 + 微交互动画

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/child_theme.dart';
import '../../components/child_home_experience.dart';
import '../../components/bottom_nav.dart';
import '../../components/top_bar.dart';
import '../games/trivia_quiz_game.dart';
import '../games/country_matching_game.dart';
import '../../providers/user_provider.dart';
import '../../providers/learning_provider.dart';
import '../../providers/content_provider.dart';
import '../ai_chat_screen.dart';
import '../learning/learning_home_screen.dart';
import '../achievement/achievement_screen.dart';
import '../profile/profile_screen.dart';
import '../reward/reward_home_screen.dart';
import 'child_video_screen.dart';
import 'knowledge_daily_screen.dart';

class ChildHomeScreen extends StatefulWidget {
  const ChildHomeScreen({super.key});

  @override
  State<ChildHomeScreen> createState() => _ChildHomeScreenState();
}

class _ChildHomeScreenState extends State<ChildHomeScreen> {
  int _currentIndex = 0;

  static const _navItems = [
    BottomNavItem(key: 'home', label: '首页', icon: Icons.home_rounded),
    BottomNavItem(key: 'learn', label: '学习', icon: Icons.school_rounded),
    BottomNavItem(
        key: 'ai', label: 'AI', icon: Icons.smart_toy_rounded, isAccent: true),
    BottomNavItem(
        key: 'achieve', label: '成就', icon: Icons.emoji_events_rounded),
    BottomNavItem(key: 'me', label: '我的', icon: Icons.person_rounded),
  ];

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = [
      ChildHomeContent(onOpenLearning: () => setState(() => _currentIndex = 1)),
      const LearningHomeScreen(),
      const AIChatScreen(),
      const AchievementScreen(),
      const ProfileScreen(),
    ];
  }

  /// 孩子端 → 家长端切换（需要 PIN 认证）
  void _showSwitchToParentDialog() {
    final pinController = TextEditingController();
    bool isSubmitting = false;
    String? errorMsg;

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (ctx, setState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              title: const Row(
                children: [
                  Text('🔒 ', style: TextStyle(fontSize: 24)),
                  Text('切换到家长端'),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '请输入家长登录密码',
                    style:
                        TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: pinController,
                    keyboardType: TextInputType.visiblePassword,
                    textAlign: TextAlign.center,
                    obscureText: true,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                    decoration: InputDecoration(
                      hintText: '请输入密码',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide:
                            BorderSide(color: AppTheme.primaryColor, width: 2),
                      ),
                    ),
                    autofocus: true,
                    enabled: !isSubmitting,
                  ),
                  if (errorMsg != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      errorMsg!,
                      style:
                          TextStyle(fontSize: 13, color: Colors.red.shade600),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed:
                      isSubmitting ? null : () => Navigator.pop(dialogContext),
                  child: const Text('取消'),
                ),
                ElevatedButton(
                  onPressed: isSubmitting
                      ? null
                      : () async {
                          final pin = pinController.text.trim();
                          if (pin.isEmpty) {
                            setState(() => errorMsg = '请输入家长登录密码');
                            return;
                          }

                          setState(() {
                            isSubmitting = true;
                            errorMsg = null;
                          });

                          final userProvider = context.read<UserProvider>();
                          final error =
                              await userProvider.switchToParentMode(pin);

                          if (!dialogContext.mounted) return;

                          if (error.isEmpty) {
                            Navigator.pop(dialogContext);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: const Text('已切换到家长端'),
                                  behavior: SnackBarBehavior.floating,
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12)),
                                  duration: const Duration(seconds: 1),
                                ),
                              );
                            }
                          } else {
                            setState(() {
                              isSubmitting = false;
                              errorMsg = error;
                            });
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2.5,
                          ),
                        )
                      : const Text('确认切换'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          TopBar(
            title: _navItems[_currentIndex].label,
            subtitle: '灵犀伴学',
            actions: [
              TopBarAction(
                key: 'switchToParent',
                label: '家长端',
                icon: Icons.swap_horiz_rounded,
                onTap: () => _showSwitchToParentDialog(),
              ),
              TopBarAction(
                key: 'settings',
                label: '设置',
                icon: Icons.settings_rounded,
                onTap: () => Navigator.pushNamed(context, '/settings'),
              ),
            ],
          ),
          Expanded(
              child: IndexedStack(index: _currentIndex, children: _screens)),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: BottomNav(
          items: _navItems,
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
        ),
      ),
    );
  }
}

class ChildHomeContent extends StatefulWidget {
  const ChildHomeContent({super.key, this.onOpenLearning});

  /// 学科大图标点击后切到「学习」Tab（由 [ChildHomeScreen] 提供）。
  final VoidCallback? onOpenLearning;

  @override
  State<ChildHomeContent> createState() => _ChildHomeContentState();
}

class _ChildHomeContentState extends State<ChildHomeContent> {
  @override
  void initState() {
    super.initState();
    // 主任务 / 今日任务依赖内容列表；为空时拉一次。
    // 失败由 ContentProvider 吞掉，下面的构建逻辑会自动回退内置内容，
    // 孩子端看不到任何「暂无数据」。
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final contentProvider = context.read<ContentProvider>();
      if (contentProvider.contents.isEmpty && !contentProvider.isLoading) {
        contentProvider.loadContents();
      }
    });
  }

  int? get _childId {
    final user = context.read<UserProvider>();
    final id = user.activeChildId ?? user.currentUser?['id'];
    if (id is int) return id;
    return int.tryParse('$id');
  }

  void _push(Widget page) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => page),
    );
  }

  void _openCompanion() {
    Navigator.push(
      context,
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => const AIChatScreen(),
        transitionsBuilder: (_, animation, __, child) {
          return ScaleTransition(
            scale: animation,
            child: FadeTransition(opacity: animation, child: child),
          );
        },
        transitionDuration: const Duration(milliseconds: 300),
      ),
    );
  }

  void _openContent(Map<String, dynamic> content) {
    final type = content['contentType']?.toString() ?? '';
    final isStructured = type == 'structured_lesson' || type == 'video_lesson';
    Navigator.pushNamed(
      context,
      isStructured ? '/learning/structuredLesson' : '/learning/contentDetail',
      arguments: <String, dynamic>{
        'contentId': content['id'],
        'childId': _childId,
      },
    );
  }

  /// 首屏唯一主任务：真实内容 → 内置兜底。
  /// 任何一层为空都不会出现「暂无 / 暂时不可用」，最后一层永远有可行动作。
  ChildPrimaryTask _buildPrimaryTask(List<Map<String, dynamic>> contents) {
    if (contents.isNotEmpty) {
      final content = contents.first;
      final title = (content['title'] as String?)?.trim() ?? '';
      final topic = (content['topic'] as String?)?.trim() ?? '';
      final summary = (content['summary'] as String?)?.trim() ?? '';
      return ChildPrimaryTask(
        kicker: '今天先玩这个',
        title: title.isEmpty ? '认识数字 1–5' : title,
        meta: topic.isNotEmpty
            ? '$topic · 六步小课程'
            : (summary.isNotEmpty ? summary : '看 · 听 · 读 · 写 · 练 · 评'),
        buttonLabel: '开始学习',
        onStart: () => _openContent(content),
      );
    }

    return ChildPrimaryTask(
      kicker: '今天先玩这个',
      title: '认识数字 1–5',
      meta: '一起数苹果，跟着小犀玩一关 🍎',
      buttonLabel: '和小犀一起玩',
      onStart: _openCompanion,
    );
  }

  List<ChildTodayTask> _buildTodayTasks(
    List<Map<String, dynamic>> contents,
  ) {
    final items = <ChildTodayTask>[];
    for (final content in contents.skip(1).take(5)) {
      final title = (content['title'] as String?)?.trim() ?? '';
      if (title.isEmpty) continue;
      final topic = (content['topic'] as String?)?.trim() ?? '';
      final domain = _domainLabel(content['domain']?.toString());
      items.add(
        ChildTodayTask(
          id: '${content['id']}',
          title: title,
          subtitle: topic.isNotEmpty ? '$topic · $domain' : domain,
          onOpen: () => _openContent(content),
        ),
      );
    }
    return items;
  }

  String _domainLabel(String? domain) {
    switch (domain) {
      case 'language':
        return '语言';
      case 'math':
        return '数学';
      case 'science':
        return '科学';
      case 'art':
        return '艺术';
      case 'social':
        return '社会';
      case 'music':
        return '音乐';
      default:
        return '综合';
    }
  }

  List<ChildMoreEntry> _buildMoreEntries() {
    return <ChildMoreEntry>[
      ChildMoreEntry(
        emoji: '🧠',
        label: '知识问答',
        onTap: () => _push(
          TriviaQuizGame(onExit: () => Navigator.pop(context)),
        ),
      ),
      ChildMoreEntry(
        emoji: '🚩',
        label: '国旗配对',
        onTap: () => _push(
          CountryMatchingGame(onExit: () => Navigator.pop(context)),
        ),
      ),
      ChildMoreEntry(
        emoji: '📜',
        label: '诗词鉴赏',
        onTap: () => Navigator.pushNamed(context, '/poetry'),
      ),
      ChildMoreEntry(
        emoji: '🎵',
        label: '音乐乐园',
        onTap: () => Navigator.pushNamed(context, '/music'),
      ),
      ChildMoreEntry(
        emoji: '📚',
        label: '知识书',
        onTap: () => Navigator.pushNamed(context, '/book-skill/browse'),
      ),
      ChildMoreEntry(
        emoji: '⭐',
        label: '积分奖惩',
        onTap: () => _push(const RewardHomeScreen()),
      ),
      ChildMoreEntry(
        emoji: '🎬',
        label: '视频学习',
        onTap: () => _push(const ChildVideoScreen()),
      ),
      ChildMoreEntry(
        emoji: '🌤',
        label: '每日知识',
        onTap: () => _push(const KnowledgeDailyScreen()),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final learningProvider = context.watch<LearningProvider>();
    final contents = context.watch<ContentProvider>().contents;

    final palette = ChildThemePalette.of(context);
    final density = palette.density;
    final userName = userProvider.currentUser?['name']?.toString() ?? '小朋友';

    // 星星来自今天完成的内容数（0–3），没有数据时是 0，不造假。
    final stars = learningProvider.completedContents.length.clamp(0, 3);
    final todayTasks = _buildTodayTasks(contents);

    return BubbleBackground(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            ChildHomeHero(
              userName: userName,
              task: _buildPrimaryTask(contents),
              stars: stars,
              density: density,
              onOpenCompanion: _openCompanion,
              secondaryActions: <ChildSecondaryAction>[
                ChildSecondaryAction(
                  label: '听小犀讲故事',
                  emoji: '🎧',
                  onSelect: _openCompanion,
                ),
                ChildSecondaryAction(
                  label: '看看我的成就',
                  emoji: '🏅',
                  onSelect: () => _push(const AchievementScreen()),
                ),
              ],
            ),
            const SizedBox(height: 28),
            ChildDiscoverySection(
              density: density,
              onOpenCompanion: _openCompanion,
            ),
            const SizedBox(height: 28),
            ChildSubjectGrid(
              density: density,
              onPick: (_) => widget.onOpenLearning?.call(),
              onMusic: () => Navigator.pushNamed(context, '/music'),
            ),
            if (todayTasks.isNotEmpty) ...<Widget>[
              const SizedBox(height: 28),
              ChildTodayTaskList(density: density, tasks: todayTasks),
            ],
            const SizedBox(height: 28),
            ChildMoreGrid(entries: _buildMoreEntries()),
          ],
        ),
      ),
    );
  }
}
