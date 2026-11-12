// 成就页 — 与孩子端 v2 主题（四皮肤 + 年龄密度）对齐
//
// 既作为底部导航的「成就」tab，也会被首页「看看我的成就」push 进来：
// 有可 pop 的路由时才显示返回按钮，tab 模式下不出现多余按钮。

import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../theme/child_density.dart';
import '../../theme/child_theme.dart';
import '../../theme/animation_utils.dart';
import '../../components/child_home_experience.dart';
import 'achievement_data.dart';

class AchievementScreen extends StatefulWidget {
  /// 是否为 push 进来的页面（只有这时才显示返回按钮；
  /// 作为底部导航 tab 时不该出现返回箭头）。
  final bool showBack;

  const AchievementScreen({super.key, this.showBack = false});

  @override
  State<AchievementScreen> createState() => _AchievementScreenState();
}

class _AchievementScreenState extends State<AchievementScreen> {
  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final density = palette.density;

    // 徽章内容取自共享数据，颜色从当前皮肤的学科色板取，四套皮肤各有配色。
    final achievements = <({ChildAchievement item, Color color})>[
      for (var i = 0; i < kChildAchievements.length; i++)
        (
          item: kChildAchievements[i],
          color: palette.subjects[i % palette.subjects.length],
        ),
    ];

    const stars = 25;

    return BubbleBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(palette),
              const SizedBox(height: 16),
              _buildStarsCard(palette, stars),
              const SizedBox(height: 22),
              _sectionTitle(palette, '已获得的徽章', '🏅'),
              const SizedBox(height: 12),
              _buildAchievementsGrid(palette, density, achievements),
              const SizedBox(height: 24),
              _sectionTitle(palette, '学习进度', '📈'),
              const SizedBox(height: 12),
              ..._buildProgressItems(palette),
            ],
          ),
        ),
      ),
    );
  }

  /// 顶部：可返回时才给返回按钮（tab 模式下不显示）
  Widget _buildHeader(ChildThemePalette palette) {
    final canPop = widget.showBack;
    return Row(children: [
      if (canPop) ...[
        GestureDetector(
          onTap: () => Navigator.of(context).maybePop(),
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: palette.card,
              shape: BoxShape.circle,
              border: palette.isCartoon
                  ? Border.all(color: palette.line, width: 2)
                  : null,
            ),
            child: Icon(Icons.arrow_back_rounded, size: 22, color: palette.ink),
          ),
        ),
        const SizedBox(width: 12),
      ],
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('我的成就',
                style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: palette.ink)),
            const SizedBox(height: 2),
            Text('每学会一件事，就多一枚徽章',
                style: TextStyle(fontSize: 13, color: palette.ink2)),
          ],
        ),
      ),
    ]);
  }

  Widget _sectionTitle(ChildThemePalette palette, String title, String emoji) {
    return Row(children: [
      Text(emoji, style: const TextStyle(fontSize: 18)),
      const SizedBox(width: 6),
      Text(title,
          style: TextStyle(
              fontSize: 17, fontWeight: FontWeight.w800, color: palette.ink)),
    ]);
  }

  /// 星星总数：主色渐变贴纸，四套皮肤都跟随主色（不再写死金色）
  Widget _buildStarsCard(ChildThemePalette palette, int stars) {
    return ChildSticker(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      strong: true,
      gradient: LinearGradient(
        colors: [palette.cta, palette.pop],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: palette.ctaInk.withValues(alpha: 0.18),
            shape: BoxShape.circle,
          ),
          child: Icon(Icons.star_rounded, color: palette.ctaInk, size: 30),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('累计获得',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: palette.ctaInk.withValues(alpha: 0.85))),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('$stars',
                      style: TextStyle(
                          fontSize: 40,
                          height: 1.1,
                          fontWeight: FontWeight.w900,
                          color: palette.ctaInk)),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6, left: 6),
                    child: Text('颗星星',
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: palette.ctaInk.withValues(alpha: 0.85))),
                  ),
                ],
              ),
            ],
          ),
        ),
        const Text('🌟', style: TextStyle(fontSize: 34)),
      ]),
    );
  }

  /// 徽章网格：低龄两列大卡、高龄三列小卡
  Widget _buildAchievementsGrid(ChildThemePalette palette, ChildDensity density,
      List<({ChildAchievement item, Color color})> achievements) {
    final columns = density.level == 2 ? 3 : 2;
    final ratio = density.level == 0
        ? 1.05
        : density.level == 2
            ? 0.86
            : 1.25;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: ratio,
      ),
      itemCount: achievements.length,
      itemBuilder: (context, index) {
        final a = achievements[index];
        return _AchievementBadge(
          name: a.item.name,
          icon: a.item.icon,
          desc: a.item.desc,
          color: a.color,
          index: index,
          compact: columns == 3,
          showDesc: density.showMeta,
        );
      },
    );
  }

  List<Widget> _buildProgressItems(ChildThemePalette palette) {
    final items = [
      {
        'label': '连续学习',
        'value': 0.6,
        'icon': Icons.local_fire_department_rounded,
        'color': palette.subjects[0],
      },
      {
        'label': '完成主题',
        'value': 0.4,
        'icon': Icons.auto_stories_rounded,
        'color': palette.subjects[3],
      },
      {
        'label': '获得星星',
        'value': 0.5,
        'icon': Icons.star_rounded,
        'color': palette.subjects[1],
      },
    ];
    return items
        .map((item) => _ProgressItem(
              label: item['label'] as String,
              value: item['value'] as double,
              icon: item['icon'] as IconData,
              color: item['color'] as Color,
            ))
        .toList();
  }
}

class _AchievementBadge extends StatelessWidget {
  final String name;
  final String icon;
  final String desc;
  final Color color;
  final int index;
  final bool compact;
  final bool showDesc;

  const _AchievementBadge({
    required this.name,
    required this.icon,
    required this.desc,
    required this.color,
    required this.index,
    this.compact = false,
    this.showDesc = true,
  });

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
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
        child: ChildSticker(
          padding: EdgeInsets.all(compact ? 10 : 14),
          background: palette.card,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    padding: EdgeInsets.all(compact ? 8 : 12),
                    decoration: BoxDecoration(
                      color: Color.alphaBlend(
                          color.withValues(alpha: 0.18), palette.card),
                      shape: BoxShape.circle,
                      border: palette.isCartoon
                          ? Border.all(color: color, width: 2)
                          : null,
                    ),
                    child: Text(icon,
                        style: TextStyle(fontSize: compact ? 22 : 28)),
                  ),
                  if (!compact)
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        padding: const EdgeInsets.all(3),
                        decoration: BoxDecoration(
                          color: palette.subjects[2],
                          shape: BoxShape.circle,
                          border: Border.all(color: palette.card, width: 2),
                        ),
                        child:
                            Icon(Icons.check, color: palette.ctaInk, size: 11),
                      ),
                    ),
                ],
              ),
              SizedBox(height: compact ? 6 : 10),
              Text(
                name,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: compact ? 12 : 14,
                  color: palette.ink,
                ),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (showDesc) ...[
                const SizedBox(height: 3),
                Text(
                  desc,
                  style: TextStyle(fontSize: 10.5, color: palette.ink2),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
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
    final palette = ChildThemePalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: ChildSticker(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        background: palette.card,
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                color: Color.alphaBlend(
                    color.withValues(alpha: 0.16), palette.card),
                borderRadius: BorderRadius.circular(palette.radiusSm),
              ),
              child: Icon(icon, size: 22, color: color),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14.5,
                      color: palette.ink,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // 用 FractionallySizedBox 取代「屏宽 × 0.5 × 比例」的硬编码宽度，
                  // 窄屏/平板都不会溢出或过短。
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Container(
                      height: 10,
                      color: Color.alphaBlend(
                          color.withValues(alpha: 0.16), palette.card),
                      child: FractionallySizedBox(
                        alignment: Alignment.centerLeft,
                        widthFactor: value.clamp(0.0, 1.0),
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [color, color.withValues(alpha: 0.72)],
                            ),
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Color.alphaBlend(
                    color.withValues(alpha: 0.14), palette.card),
                borderRadius: BorderRadius.circular(palette.radiusSm),
              ),
              child: Text(
                '${(value * 100).toInt()}%',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                  color: color,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
