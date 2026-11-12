// 成就页 —— 只作为 push 页面存在（底部导航不再单独占一个 Tab）。
//
// 入口：「我的」页「我的徽章 · 看全部」、首页次级动作「看看我的成就」、
// 设置页底部入口。所以这里恒有返回按钮，版式按「从我的进入的详情页」设计：
// 一个标题头 → 星星总览 → 徽章网格 → 学习进度，不再套第二层 TopBar。

import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../theme/child_density.dart';
import '../../theme/child_theme.dart';
import '../../theme/animation_utils.dart';
import '../../components/child_home_experience.dart';
import 'achievement_data.dart';

class AchievementScreen extends StatelessWidget {
  /// 已完成的内容数（来自 LearningProvider），用于点亮徽章 / 算星星。
  /// 传 0 时页面显示「还没开始」态，不造假数字。
  final int completedCount;

  /// 当前可学内容总数，用于进度百分比；为 0 时按已完成数与徽章数推算。
  final int totalContents;

  const AchievementScreen({
    super.key,
    this.completedCount = 0,
    this.totalContents = 0,
  });

  int get _stars => completedCount * 3;

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final density = palette.density;

    final earned =
        kChildAchievements.where((a) => completedCount >= a.threshold).length;

    // push 进来的页面必须自带 Scaffold：否则没有 Material 祖先，
    // Text 会退回 Flutter 的「错误文本样式」（黑底 + 黄双下划线）。
    return Scaffold(
      backgroundColor: palette.paper,
      body: BubbleBackground(
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(context, palette),
                const SizedBox(height: 16),
                _buildStarsCard(palette, earned),
                if (earned == 0) ...[
                  const SizedBox(height: 12),
                  _buildEmptyHint(palette),
                ],
                const SizedBox(height: 24),
                ChildSectionTitle(
                  title: '徽章墙',
                  icon: Icons.workspace_premium_rounded,
                  trailing: Text(
                    '$earned / ${kChildAchievements.length}',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: palette.ink2,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                _buildAchievementsGrid(palette, density, {
                  for (var i = 0; i < kChildAchievements.length; i++)
                    i: palette.subjects[i % palette.subjects.length],
                }),
                const SizedBox(height: 26),
                ChildSectionTitle(
                  title: '学习进度',
                  icon: Icons.trending_up_rounded,
                ),
                const SizedBox(height: 12),
                ..._buildProgressItems(palette, earned),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, ChildThemePalette palette) {
    return Row(
      children: [
        GestureDetector(
          onTap: () => Navigator.of(context).maybePop(),
          child: Container(
            width: 42,
            height: 42,
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
      ],
    );
  }

  /// 星星总览：主色渐变贴纸，四套皮肤都跟随主色（不写死金色）
  Widget _buildStarsCard(ChildThemePalette palette, int earned) {
    return ChildSticker(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      strong: true,
      gradient: LinearGradient(
        colors: [palette.cta, palette.pop],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: palette.ctaInk.withValues(alpha: 0.18),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.star_rounded, color: palette.ctaInk, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('累计获得',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: palette.ctaInk.withValues(alpha: 0.85))),
                const SizedBox(height: 2),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text('$_stars',
                        style: TextStyle(
                            fontSize: 34,
                            height: 1.05,
                            fontWeight: FontWeight.w900,
                            color: palette.ctaInk)),
                    const SizedBox(width: 6),
                    Text('颗星星',
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: palette.ctaInk.withValues(alpha: 0.85))),
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: palette.ctaInk.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('$earned',
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: palette.ctaInk)),
                Text('枚徽章',
                    style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        color: palette.ctaInk.withValues(alpha: 0.85))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 一枚徽章都没点亮时的提示：把「空」讲清楚，别让孩子以为是坏了
  Widget _buildEmptyHint(ChildThemePalette palette) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color:
            Color.alphaBlend(palette.pop.withValues(alpha: 0.12), palette.card),
        borderRadius: BorderRadius.circular(palette.radiusMd),
      ),
      child: Row(
        children: [
          Icon(Icons.lightbulb_rounded, size: 18, color: palette.pop),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '完成第一个学习任务，就能点亮第一枚徽章',
              style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: palette.ink2),
            ),
          ),
        ],
      ),
    );
  }

  /// 徽章网格：低龄两列大卡，中高龄三列小卡（一屏能看到整墙）
  Widget _buildAchievementsGrid(
    ChildThemePalette palette,
    ChildDensity density,
    Map<int, Color> colors,
  ) {
    final columns = density.level == 0 ? 2 : 3;
    final ratio = columns == 2 ? 1.0 : 0.9;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: ratio,
      ),
      itemCount: kChildAchievements.length,
      itemBuilder: (context, index) {
        final item = kChildAchievements[index];
        return _AchievementBadge(
          item: item,
          color: colors[index]!,
          index: index,
          compact: columns == 3,
          showDesc: density.showMeta,
          unlocked: completedCount >= item.threshold,
          remaining: (item.threshold - completedCount).clamp(0, 99),
        );
      },
    );
  }

  List<Widget> _buildProgressItems(ChildThemePalette palette, int earned) {
    final courseTotal = totalContents > 0 ? totalContents : completedCount;
    final items = <({String label, double value, IconData icon, Color color})>[
      (
        label: '完成课程',
        value: courseTotal > 0
            ? (completedCount / courseTotal).clamp(0.0, 1.0)
            : 0.0,
        icon: Icons.auto_stories_rounded,
        color: palette.subjects[3],
      ),
      (
        label: '收集徽章',
        value: kChildAchievements.isEmpty
            ? 0.0
            : (earned / kChildAchievements.length).clamp(0.0, 1.0),
        icon: Icons.workspace_premium_rounded,
        color: palette.subjects[0],
      ),
      (
        label: '获得星星',
        value: courseTotal > 0
            ? (_stars / (courseTotal * 3)).clamp(0.0, 1.0)
            : 0.0,
        icon: Icons.star_rounded,
        color: palette.subjects[1],
      ),
    ];

    return items
        .map((item) => _ProgressItem(
              label: item.label,
              value: item.value,
              icon: item.icon,
              color: item.color,
            ))
        .toList();
  }
}

class _AchievementBadge extends StatelessWidget {
  final ChildAchievement item;
  final Color color;
  final int index;
  final bool compact;
  final bool showDesc;
  final bool unlocked;
  final int remaining;

  const _AchievementBadge({
    required this.item,
    required this.color,
    required this.index,
    this.compact = false,
    this.showDesc = true,
    this.unlocked = true,
    this.remaining = 0,
  });

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final tint = unlocked ? color : palette.ink2;

    return PressAnimation(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.0, end: 1.0),
        duration: Duration(milliseconds: 260 + index * 70),
        curve: Curves.easeOutBack,
        builder: (context, value, child) {
          return Transform.scale(
            scale: value.clamp(0.0, 1.0),
            child: Opacity(opacity: value.clamp(0.0, 1.0), child: child),
          );
        },
        child: ChildSticker(
          padding: EdgeInsets.all(compact ? 10 : 14),
          background: palette.card,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    padding: EdgeInsets.all(compact ? 9 : 12),
                    decoration: BoxDecoration(
                      color: Color.alphaBlend(
                          tint.withValues(alpha: unlocked ? 0.18 : 0.10),
                          palette.card),
                      shape: BoxShape.circle,
                      border: palette.isCartoon
                          ? Border.all(
                              color: unlocked
                                  ? color
                                  : palette.line.withValues(alpha: 0.9),
                              width: 2)
                          : null,
                    ),
                    child: Text(
                      item.icon,
                      style: TextStyle(
                        fontSize: compact ? 20 : 26,
                        // 未点亮的徽章压暗，但仍然看得出是什么图形
                        color: unlocked ? null : palette.ink2,
                      ),
                    ),
                  ),
                  Positioned(
                    right: -2,
                    bottom: -2,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        color: unlocked ? palette.subjects[2] : palette.soft,
                        shape: BoxShape.circle,
                        border: Border.all(color: palette.card, width: 2),
                      ),
                      child: Icon(
                        unlocked ? Icons.check_rounded : Icons.lock_rounded,
                        color: unlocked ? palette.ctaInk : palette.ink2,
                        size: 10,
                      ),
                    ),
                  ),
                ],
              ),
              SizedBox(height: compact ? 8 : 10),
              Text(
                item.name,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: compact ? 12 : 14,
                  color: unlocked ? palette.ink : palette.ink2,
                ),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (showDesc) ...[
                const SizedBox(height: 3),
                Text(
                  unlocked ? item.desc : '还差 $remaining 个',
                  style: TextStyle(
                    fontSize: 10.5,
                    height: 1.25,
                    color: palette.ink2.withValues(alpha: 0.9),
                  ),
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
      padding: const EdgeInsets.only(bottom: 10),
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
              child: Icon(icon, size: 20, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          label,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: palette.ink,
                          ),
                        ),
                      ),
                      Text(
                        '${(value * 100).round()}%',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 12.5,
                          color: color,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 7),
                  // FractionallySizedBox 取代「屏宽 × 0.5 × 比例」的硬编码，
                  // 窄屏/平板都不会溢出或过短。
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Container(
                      height: 9,
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
          ],
        ),
      ),
    );
  }
}
