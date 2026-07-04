// UI Refresh: 2026-05-12 — 统一组件 + 微交互动画

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/animation_utils.dart';
import '../../components/bottom_nav.dart';
import '../../components/top_bar.dart';
import '../../components/app_card.dart';
import '../../components/section_header.dart';
import '../../providers/user_provider.dart';
import '../../providers/learning_provider.dart';
import '../ai_chat_screen.dart';
import '../learning/learning_home_screen.dart';
import '../achievement/achievement_screen.dart';
import '../profile/profile_screen.dart';
import '../reward/reward_home_screen.dart';
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
    BottomNavItem(key: 'ai', label: 'AI', icon: Icons.smart_toy_rounded, isAccent: true),
    BottomNavItem(key: 'achieve', label: '成就', icon: Icons.emoji_events_rounded),
    BottomNavItem(key: 'me', label: '我的', icon: Icons.person_rounded),
  ];

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = [
      const ChildHomeContent(),
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
                  const Text(
                    '请输入家长登录密码',
                    style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
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
                        borderSide: const BorderSide(color: AppTheme.primaryColor, width: 2),
                      ),
                    ),
                    autofocus: true,
                    enabled: !isSubmitting,
                  ),
                  if (errorMsg != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      errorMsg!,
                      style: TextStyle(fontSize: 13, color: Colors.red.shade600),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: isSubmitting ? null : () => Navigator.pop(dialogContext),
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
                          final error = await userProvider.switchToParentMode(pin);

                          if (!dialogContext.mounted) return;

                          if (error.isEmpty) {
                            Navigator.pop(dialogContext);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: const Text('已切换到家长端'),
                                  behavior: SnackBarBehavior.floating,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
          Expanded(child: _screens[_currentIndex]),
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
  const ChildHomeContent({super.key});

  @override
  State<ChildHomeContent> createState() => _ChildHomeContentState();
}

class _ChildHomeContentState extends State<ChildHomeContent> {
  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final learningProvider = context.watch<LearningProvider>();
    final userName = userProvider.currentUser?['name'] ?? '小朋友';
    final todayMinutes = learningProvider.todayMinutes;

    return BubbleBackground(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BounceIn(
              child: _buildWelcomeSection(userName),
            ),
            const SizedBox(height: 24),
            _buildStudyTimeCard(todayMinutes),
            const SizedBox(height: 24),
            _buildAICompanionCard(context),
            const SizedBox(height: 24),
            _buildFunctionSection(context),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildWelcomeSection(String userName) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text('🌸', style: TextStyle(fontSize: 28)),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      '你好，$userName',
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textColor,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Row(
                children: [
                  Text('✨', style: TextStyle(fontSize: 16)),
                  SizedBox(width: 4),
                  Text(
                    '今天也要努力学习哦~',
                    style: TextStyle(
                      fontSize: 16,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const Column(
          children: [
            StarDecoration(size: 24, color: AppTheme.softYellow),
            SizedBox(height: 8),
            StarDecoration(size: 16, color: AppTheme.softPink),
          ],
        ),
      ],
    );
  }

  Widget _buildStudyTimeCard(int todayMinutes) {
    return AppCard(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      gradient: const LinearGradient(
        colors: [AppTheme.primaryColor, Color(0xFFFF9EBB)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      boxShadow: AppTheme.glowShadow(AppTheme.primaryColor),
      child: Stack(
        children: [
          Positioned(
            right: -20,
            top: -20,
            child: Icon(
              Icons.auto_awesome,
              size: 100,
              color: Colors.white.withValues(alpha: 0.15),
            ),
          ),
          const Positioned(
            right: 30,
            bottom: -10,
            child: Text('📚', style: TextStyle(fontSize: 50)),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(AppTheme.smallRadius),
                    ),
                    child: const Icon(Icons.access_time, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    '今日学习',
                    style: TextStyle(
                      fontSize: 18,
                      color: Colors.white70,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '$todayMinutes',
                    style: const TextStyle(
                      fontSize: 56,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.only(bottom: 12, left: 8),
                    child: Text(
                      '分钟',
                      style: TextStyle(
                        fontSize: 20,
                        color: Colors.white70,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('🌟', style: TextStyle(fontSize: 14)),
                    SizedBox(width: 4),
                    Text(
                      '棒棒的！',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.white,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAICompanionCard(BuildContext context) {
    return GestureDetector(
      onTap: () {
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
      },
      child: AppCard(
        width: double.infinity,
        height: 170,
        gradient: const LinearGradient(
          colors: [AppTheme.secondaryColor, Color(0xFF9AD0E8)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: AppTheme.glowShadow(AppTheme.secondaryColor),
        child: Stack(
          children: [
            Positioned(
              right: 30,
              top: 20,
              child: CloudDecoration(size: 60, color: Colors.white.withValues(alpha: 0.2)),
            ),
            Positioned(
              right: 80,
              bottom: 30,
              child: CloudDecoration(size: 40, color: Colors.white.withValues(alpha: 0.15)),
            ),
            Positioned(
              right: 20,
              bottom: 20,
              child: Icon(
                Icons.auto_awesome,
                size: 70,
                color: Colors.white.withValues(alpha: 0.25),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(AppTheme.cardRadius),
                        ),
                        child: const Text('🦄', style: TextStyle(fontSize: 32)),
                      ),
                      const SizedBox(width: 12),
                      const Text(
                        '小犀',
                        style: TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.chat_bubble_outline, color: Colors.white70, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        '点击开始聊天~',
                        style: TextStyle(
                          fontSize: 16,
                          color: Colors.white.withValues(alpha: 0.85),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFunctionSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: '更多功能',
          emoji: '🎨',
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _FunctionCard(
                icon: Icons.school_rounded,
                title: '学习',
                emoji: '📖',
                color: AppTheme.accentColor,
                onTap: () {},
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: _FunctionCard(
                icon: Icons.emoji_events_rounded,
                title: '成就',
                emoji: '🏆',
                color: const Color(0xFFDDA0DD),
                onTap: () {},
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // 积分奖惩入口
        GestureDetector(
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const RewardHomeScreen(),
              ),
            );
          },
          child: AppCard(
            padding: const EdgeInsets.all(20),
            gradient: const LinearGradient(
              colors: [Color(0xFFFFCE4E), Color(0xFFFFB347)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: AppTheme.softShadow(const Color(0xFFFFCE4E)),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Text('⭐', style: TextStyle(fontSize: 32)),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '积分奖惩',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '打卡好习惯，兑换好礼',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.white.withValues(alpha: 0.9),
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.arrow_forward_ios_rounded,
                  color: Colors.white,
                  size: 18,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _FunctionCard extends StatefulWidget {
  final IconData icon;
  final String title;
  final String emoji;
  final Color color;
  final VoidCallback onTap;

  const _FunctionCard({
    required this.icon,
    required this.title,
    required this.emoji,
    required this.color,
    required this.onTap,
  });

  @override
  State<_FunctionCard> createState() => _FunctionCardState();
}

class _FunctionCardState extends State<_FunctionCard> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 150),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.95).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _controller.forward(),
      onTapUp: (_) {
        _controller.reverse();
        widget.onTap();
      },
      onTapCancel: () => _controller.reverse(),
      child: AnimatedBuilder(
        animation: _scaleAnimation,
        builder: (context, child) {
          return Transform.scale(
            scale: _scaleAnimation.value,
            child: child,
          );
        },
        child: AppCard(
          padding: const EdgeInsets.all(20),
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: widget.color.withValues(alpha: 0.2),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      widget.color.withValues(alpha: 0.15),
                      widget.color.withValues(alpha: 0.05),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(AppTheme.cardRadius),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(widget.emoji, style: const TextStyle(fontSize: 28)),
                    const SizedBox(width: 8),
                    Icon(widget.icon, size: 36, color: widget.color),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Text(
                widget.title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
