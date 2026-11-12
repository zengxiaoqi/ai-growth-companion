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

  const ChildAchievement({
    required this.name,
    required this.icon,
    required this.desc,
  });
}

const List<ChildAchievement> kChildAchievements = [
  ChildAchievement(name: '初次学习', icon: '🎯', desc: '完成第一个课程'),
  ChildAchievement(name: '每日目标', icon: '⭐', desc: '完成每日学习任务'),
  ChildAchievement(name: '学习小达人', icon: '🏆', desc: '累计学习 7 天'),
  ChildAchievement(name: '语言高手', icon: '📚', desc: '完成 10 个语言主题'),
  ChildAchievement(name: '数学天才', icon: '🔢', desc: '完成 10 个数学主题'),
  ChildAchievement(name: '探索者', icon: '🌟', desc: '尝试所有学科'),
];
