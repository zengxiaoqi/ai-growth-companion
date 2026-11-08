// UI Refresh: 2026-05-12 — 统一组件 + 微交互动画

import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../theme/animation_utils.dart';
import '../../components/app_card.dart';
import '../../components/section_header.dart';

class AchievementScreen extends StatefulWidget {
  const AchievementScreen({super.key});

  @override
  State<AchievementScreen> createState() => _AchievementScreenState();
}

class _AchievementScreenState extends State<AchievementScreen> {

  @override
  Widget build(BuildContext context) {
    // 模拟成就数据
    final achievements = [
      {'name': '初次学习', 'icon': '🎯', 'desc': '完成第一个课程', 'color': AppTheme.primaryColor},
      {'name': '每日目标', 'icon': '⭐', 'desc': '完成每日学习任务', 'color': AppTheme.softYellow},
      {'name': '学习小达人', 'icon': '🏆', 'desc': '累计学习 7 天', 'color': AppTheme.secondaryColor},
      {'name': '语言高手', 'icon': '📚', 'desc': '完成 10 个语言主题', 'color': AppTheme.accentColor},
      {'name': '数学天才', 'icon': '🔢', 'desc': '完成 10 个数学主题', 'color': AppTheme.softPurple},
      {'name': '探索者', 'icon': '🌟', 'desc': '尝试所有学科', 'color': const Color(0xFFE3BC45)},
    ];

    const stars = 25;

    return BubbleBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 顶部标题
              _buildHeader(),
              const SizedBox(height: 20),
              
              // 星星总数卡片
              _buildStarsCard(stars),
              const SizedBox(height: 24),
              
              // 成就列表
              _buildAchievementsList(achievements),
              const SizedBox(height: 24),
              
              // 进度条
              _buildProgressSection(),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return const SectionHeader(
      title: '成就徽章',
      icon: Icons.emoji_events_rounded,
    );
  }

  Widget _buildStarsCard(int stars) {
    return AppCard(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      gradient: const LinearGradient(
        colors: [Color(0xFFE3BC45), Color(0xFFFFD700)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      boxShadow: AppTheme.glowShadow(const Color(0xFFE3BC45)),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.star_rounded, color: Colors.white, size: 32),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '累计获得',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.white70,
                ),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '$stars',
                    style: const TextStyle(
                      fontSize: 48,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8, left: 8),
                    child: Text(
                      '星星',
                      style: TextStyle(
                        fontSize: 18,
                        color: Colors.white70,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(width: 12),
          const Text('🌟', style: TextStyle(fontSize: 36)),
        ],
      ),
    );
  }

  Widget _buildAchievementsList(List<Map<String, dynamic>> achievements) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: '已获得',
          icon: Icons.military_tech_rounded,
        ),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.3,
          ),
          itemCount: achievements.length,
          itemBuilder: (context, index) {
            final a = achievements[index];
            return _AchievementBadge(
              name: a['name'] as String,
              icon: a['icon'] as String,
              desc: a['desc'] as String,
              color: a['color'] as Color,
              index: index,
            );
          },
        ),
      ],
    );
  }

  Widget _buildProgressSection() {
    final progressItems = [
      {'label': '连续学习', 'value': 0.6, 'icon': Icons.local_fire_department_rounded, 'color': AppTheme.primaryColor},
      {'label': '完成主题', 'value': 0.4, 'icon': Icons.auto_stories_rounded, 'color': AppTheme.secondaryColor},
      {'label': '获得星星', 'value': 0.5, 'icon': Icons.star_rounded, 'color': AppTheme.softYellow},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: '学习进度',
          icon: Icons.bar_chart_rounded,
        ),
        const SizedBox(height: 12),
        ...progressItems.map((item) => _ProgressItem(
          label: item['label'] as String,
          value: item['value'] as double,
          icon: item['icon'] as IconData,
          color: item['color'] as Color,
        )),
      ],
    );
  }
}

class _AchievementBadge extends StatelessWidget {
  final String name;
  final String icon;
  final String desc;
  final Color color;
  final int index;

  const _AchievementBadge({
    required this.name,
    required this.icon,
    required this.desc,
    required this.color,
    required this.index,
  });

  @override
  Widget build(BuildContext context) {
    return PressAnimation(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.0, end: 1.0),
        duration: Duration(milliseconds: 300 + index * 100),
        curve: Curves.easeOutBack,
        builder: (context, value, child) {
          return Transform.scale(
            scale: value,
            child: Opacity(opacity: value, child: child),
          );
        },
        child: AppCard(
          padding: const EdgeInsets.all(16),
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.2),
              blurRadius: 15,
              offset: const Offset(0, 5),
            ),
          ],
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [color.withValues(alpha: 0.2), color.withValues(alpha: 0.1)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      shape: BoxShape.circle,
                    ),
                    child: Text(icon, style: const TextStyle(fontSize: 28)),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: AppTheme.accentColor,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: const Icon(Icons.check, color: Colors.white, size: 12),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                name,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: color,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text(
                desc,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppTheme.textSecondary,
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProgressItem extends StatelessWidget {
  final String label;
  final double value;
  final IconData icon;
  final Color color;

  const _ProgressItem({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      color: Colors.white,
      boxShadow: [
        BoxShadow(
          color: color.withValues(alpha: 0.1),
          blurRadius: 15,
          offset: const Offset(0, 5),
        ),
      ],
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppTheme.smallRadius),
            ),
            child: Icon(icon, size: 24, color: color),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 10),
                Stack(
                  children: [
                    Container(
                      height: 10,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(5),
                      ),
                    ),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 500),
                      height: 10,
                      width: MediaQuery.of(context).size.width * 0.5 * value,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [color, color.withValues(alpha: 0.7)],
                        ),
                        borderRadius: BorderRadius.circular(5),
                        boxShadow: [
                          BoxShadow(
                            color: color.withValues(alpha: 0.3),
                            blurRadius: 5,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppTheme.smallRadius),
            ),
            child: Text(
              '${(value * 100).toInt()}%',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}