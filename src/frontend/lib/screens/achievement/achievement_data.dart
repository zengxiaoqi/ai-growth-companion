/// 孩子端成就徽章的定义（图标 + 名称 + 达成条件）。
///
/// 成就页与「我的」页共用同一份数据，避免两处写死后不一致；
/// 展示颜色由各页从当前皮肤 [ChildThemePalette.subjects] 取，
/// 因此这里只描述内容、不含颜色。
library;

class ChildAchievement {
  final String name;
  final String icon;
  final String desc;

  /// 解锁门槛：已完成内容数达到该值即点亮。
  /// 用真实学习数据判断，宁可不点亮也不造假「全部达成」。
  final int threshold;

  const ChildAchievement({
    required this.name,
    required this.icon,
    required this.desc,
    required this.threshold,
  });
}

const List<ChildAchievement> kChildAchievements = [
  ChildAchievement(
      name: '初次学习', icon: '🎯', desc: '完成第一个课程', threshold: 1),
  ChildAchievement(
      name: '每日目标', icon: '⭐', desc: '完成 3 个学习任务', threshold: 3),
  ChildAchievement(
      name: '学习小达人', icon: '🏆', desc: '累计完成 5 个课程', threshold: 5),
  ChildAchievement(
      name: '语言高手', icon: '📚', desc: '累计完成 8 个课程', threshold: 8),
  ChildAchievement(
      name: '数学天才', icon: '🔢', desc: '累计完成 12 个课程', threshold: 12),
  ChildAchievement(
      name: '探索者', icon: '🌟', desc: '累计完成 20 个课程', threshold: 20),
];
