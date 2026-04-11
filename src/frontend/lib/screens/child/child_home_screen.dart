import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/user_provider.dart';
import '../../providers/learning_provider.dart';
import '../ai_chat_screen.dart';
import '../learning/learning_home_screen.dart';
import '../achievement/achievement_screen.dart';
import '../profile/profile_screen.dart';

class ChildHomeScreen extends StatefulWidget {
  const ChildHomeScreen({super.key});

  @override
  State<ChildHomeScreen> createState() => _ChildHomeScreenState();
}

class _ChildHomeScreenState extends State<ChildHomeScreen> with SingleTickerProviderStateMixin {
  int _currentIndex = 0;
  late AnimationController _animationController;
  late Animation<double> _bounceAnimation;
  
  final List<Widget> _screens = [
    const ChildHomeContent(),
    const LearningHomeScreen(),
    const AchievementScreen(),
    const ProfileScreen(),
  ];

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);
    
    _bounceAnimation = Tween<double>(begin: 0, end: 10).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: _buildBottomNav(),
      extendBody: true,
    );
  }

  Widget _buildBottomNav() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withOpacity(0.15),
            blurRadius: 30,
            offset: const Offset(0, -5),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
          backgroundColor: Colors.transparent,
          elevation: 0,
          items: [
            _buildNavItem(Icons.home_rounded, '首页', 0),
            _buildNavItem(Icons.school_rounded, '学习', 1),
            _buildNavItem(Icons.emoji_events_rounded, '成就', 2),
            _buildNavItem(Icons.person_rounded, '我的', 3),
          ],
        ),
      ),
    );
  }

  BottomNavigationBarItem _buildNavItem(IconData icon, String label, int index) {
    final isSelected = _currentIndex == index;
    return BottomNavigationBarItem(
      icon: AnimatedBuilder(
        animation: _bounceAnimation,
        builder: (context, child) {
          return Transform.translate(
            offset: Offset(0, isSelected ? -_bounceAnimation.value : 0),
            child: child,
          );
        },
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.primaryColor.withOpacity(0.1) : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Icon(
            icon,
            size: 26,
            color: isSelected ? AppTheme.primaryColor : AppTheme.textSecondary.withOpacity(0.5),
          ),
        ),
      ),
      label: label,
    );
  }
}

class ChildHomeContent extends StatelessWidget {
  const ChildHomeContent({super.key});

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final learningProvider = context.watch<LearningProvider>();
    final userName = userProvider.currentUser?['name'] ?? '小朋友';
    final todayMinutes = learningProvider.todayMinutes;

    return BubbleBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 欢迎语带装饰
              _buildWelcomeSection(userName),
              const SizedBox(height: 24),
              
              // 今日学习时长卡片
              _buildStudyTimeCard(todayMinutes),
              const SizedBox(height: 24),
              
              // AI 伙伴入口
              _buildAICompanionCard(context),
              const SizedBox(height: 24),
              
              // 功能入口
              _buildFunctionSection(context),
              const SizedBox(height: 20),
            ],
          ),
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
              Row(
                children: [
                  const Text('✨', style: TextStyle(fontSize: 16)),
                  const SizedBox(width: 4),
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
        // 右边装饰星星
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
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppTheme.primaryColor, Color(0xFFFF9EBB)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: AppTheme.glowShadow(AppTheme.primaryColor),
      ),
      child: Stack(
        children: [
          // 背景装饰
          Positioned(
            right: -20,
            top: -20,
            child: Icon(
              Icons.auto_awesome,
              size: 100,
              color: Colors.white.withOpacity(0.15),
            ),
          ),
          Positioned(
            right: 30,
            bottom: -10,
            child: const Text('📚', style: TextStyle(fontSize: 50)),
          ),
          // 内容
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
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
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
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
      child: Container(
        width: double.infinity,
        height: 170,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [AppTheme.secondaryColor, Color(0xFF9AD0E8)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(24),
          boxShadow: AppTheme.glowShadow(AppTheme.secondaryColor),
        ),
        child: Stack(
          children: [
            // 装饰云朵
            Positioned(
              right: 30,
              top: 20,
              child: CloudDecoration(size: 60, color: Colors.white.withOpacity(0.2)),
            ),
            Positioned(
              right: 80,
              bottom: 30,
              child: CloudDecoration(size: 40, color: Colors.white.withOpacity(0.15)),
            ),
            // 魔法棒装饰
            Positioned(
              right: 20,
              bottom: 20,
              child: Icon(
                Icons.auto_awesome,
                size: 70,
                color: Colors.white.withOpacity(0.25),
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
                          color: Colors.white.withOpacity(0.25),
                          borderRadius: BorderRadius.circular(16),
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
                          color: Colors.white.withOpacity(0.85),
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
        const Row(
          children: [
            Text('🎨', style: TextStyle(fontSize: 20)),
            SizedBox(width: 8),
            Text(
              '更多功能',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
            ),
          ],
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
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: widget.color.withOpacity(0.2),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      widget.color.withOpacity(0.15),
                      widget.color.withOpacity(0.05),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(20),
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