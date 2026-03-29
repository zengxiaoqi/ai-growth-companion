import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';

class AchievementScreen extends StatelessWidget {
  const AchievementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // 模拟成就数据
    final achievements = [
      {'name': '初次学习', 'icon': '🎯', 'desc': '完成第一个课程', 'color': AppTheme.primaryColor},
      {'name': '每日目标', 'icon': '⭐', 'desc': '完成每日学习任务', 'color': AppTheme.softYellow},
      {'name': '学习小达人', 'icon': '🏆', 'desc': '累计学习 7 天', 'color': AppTheme.secondaryColor},
      {'name': '语言高手', 'icon': '📚', 'desc': '完成 10 个语言主题', 'color': AppTheme.accentColor},
      {'name': '数学天才', 'icon': '🔢', 'desc': '完成 10 个数学主题', 'color': AppTheme.softPurple},
      {'name': '探索者', 'icon': '🌟', 'desc': '尝试所有学科', 'color': const Color(0xFFFFCE4E)},
    ];

    final stars = 25;

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
    return Row(
      children: [
        const Text('🏆', style: TextStyle(fontSize: 28)),
        const SizedBox(width: 8),
        const Expanded(
          child: Text(
            '成就徽章',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.bold,
              color: AppTheme.textColor,
            ),
          ),
        ),
        const StarDecoration(size: 24, color: AppTheme.softYellow),
        const SizedBox(width: 8),
        const Text('✨', style: TextStyle(fontSize: 24)),
      ],
    );
  }

  Widget _buildStarsCard(int stars) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFFCE4E), Color(0xFFFFD700)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: AppTheme.glowShadow(const Color(0xFFFFCE4E)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
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
        const Row(
          children: [
            Text('🎖️', style: TextStyle(fontSize: 20)),
            SizedBox(width: 8),
            Text(
              '已获得',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
            ),
          ],
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
      {'label': '连续学习', 'value': 0.6, 'emoji': '🔥', 'color': AppTheme.primaryColor},
      {'label': '完成主题', 'value': 0.4, 'emoji': '📖', 'color': AppTheme.secondaryColor},
      {'label': '获得星星', 'value': 0.5, 'emoji': '⭐', 'color': AppTheme.softYellow},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Text('📊', style: TextStyle(fontSize: 20)),
            SizedBox(width: 8),
            Text(
              '学习进度',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ...progressItems.map((item) => _ProgressItem(
          label: item['label'] as String,
          value: item['value'] as double,
          emoji: item['emoji'] as String,
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
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: 300 + index * 100),
      curve: Curves.easeOutBack,
      builder: (context, value, child) {
        return Transform.scale(
          scale: value,
          child: Opacity(opacity: value, child: child),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.2),
              blurRadius: 15,
              offset: const Offset(0, 5),
            ),
          ],
        ),
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
                      colors: [color.withOpacity(0.2), color.withOpacity(0.1)],
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
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey[600],
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class _ProgressItem extends StatelessWidget {
  final String label;
  final double value;
  final String emoji;
  final Color color;

  const _ProgressItem({
    required this.label,
    required this.value,
    required this.emoji,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.1),
            blurRadius: 15,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(emoji, style: const TextStyle(fontSize: 24)),
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
                        color: color.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(5),
                      ),
                    ),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 500),
                      height: 10,
                      width: MediaQuery.of(context).size.width * 0.5 * value,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [color, color.withOpacity(0.7)],
                        ),
                        borderRadius: BorderRadius.circular(5),
                        boxShadow: [
                          BoxShadow(
                            color: color.withOpacity(0.3),
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
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
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