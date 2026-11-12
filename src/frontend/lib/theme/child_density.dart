/// 孩子端「年龄密度档」——与 Web 端 `src/lib/child-theme.ts` 的
/// `CHILD_DENSITY` 保持同一份口径。
///
/// 三档不是三套组件：所有组件读同一份 [ChildDensity] 开关，
/// 未指定时默认中档，保证组件可独立使用、家长端行为稳定。
///
/// - level 0（3–4 岁 / candy）：每屏只放一个主动作、纯图形星星、
///   探索卡 3 张、学科 4 个、按钮 66px。
/// - level 1（4–5 岁 / honey、forest）：进度环、探索卡 4 张、
///   学科 6 个、按钮 56px。
/// - level 2（5–6 岁 / space）：任务勾选清单、探索卡 5 张带摘要、
///   按钮 48px、多一个「看看我的成就」次要动作。
library;

/// 进度展示形态：图形星星 → 进度环 + 数字 → 任务勾选清单。
enum ChildProgressMode { stars, ring, checklist }

class ChildDensity {
  /// 0 / 1 / 2
  final int level;

  /// 主任务下方可展示的次要动作数（含主任务本身）。
  final int primaryActions;

  /// 「今天的小发现」横滑卡张数。
  final int discoveryCards;

  /// 学科大图标数量。
  final int subjects;

  /// 学科网格列数。
  final int subjectColumns;

  /// 「今天要做的事」首屏露出条数。
  final int todayTasks;

  /// AI 对话快捷提问个数。
  final int quickPrompts;

  /// 是否提供文字输入（低龄只给语音）。
  final bool textInput;

  /// 进度展示形态。
  final ChildProgressMode progressMode;

  /// 主行动按钮最小高度。
  final double ctaHeight;

  /// 学科按钮最小高度。
  final double subjectHeight;

  /// AI 对话是否显示「你可以问」建议行。
  final bool suggestions;

  /// 卡片是否展示摘要文案（低龄不展示，降低阅读负担）。
  final bool showMeta;

  const ChildDensity({
    required this.level,
    required this.primaryActions,
    required this.discoveryCards,
    required this.subjects,
    required this.subjectColumns,
    required this.todayTasks,
    required this.quickPrompts,
    required this.textInput,
    required this.progressMode,
    required this.ctaHeight,
    required this.subjectHeight,
    required this.suggestions,
    required this.showMeta,
  });
}

const ChildDensity _kDensityLevel0 = ChildDensity(
  level: 0,
  primaryActions: 1,
  discoveryCards: 3,
  subjects: 4,
  subjectColumns: 2,
  todayTasks: 1,
  quickPrompts: 3,
  textInput: false,
  progressMode: ChildProgressMode.stars,
  ctaHeight: 66,
  subjectHeight: 118,
  suggestions: false,
  showMeta: false,
);

const ChildDensity _kDensityLevel1 = ChildDensity(
  level: 1,
  primaryActions: 2,
  discoveryCards: 4,
  subjects: 6,
  subjectColumns: 3,
  todayTasks: 2,
  quickPrompts: 3,
  textInput: true,
  progressMode: ChildProgressMode.ring,
  ctaHeight: 56,
  subjectHeight: 102,
  suggestions: false,
  showMeta: true,
);

const ChildDensity _kDensityLevel2 = ChildDensity(
  level: 2,
  primaryActions: 3,
  discoveryCards: 5,
  subjects: 6,
  subjectColumns: 3,
  todayTasks: 3,
  quickPrompts: 4,
  textInput: true,
  progressMode: ChildProgressMode.checklist,
  ctaHeight: 48,
  subjectHeight: 98,
  suggestions: true,
  showMeta: true,
);

const Map<int, ChildDensity> kChildDensity = <int, ChildDensity>{
  0: _kDensityLevel0,
  1: _kDensityLevel1,
  2: _kDensityLevel2,
};

/// 容错解析：任何非法 level 都回落到中档（也是存量用户 / 家长端默认档）。
ChildDensity childDensityForLevel(Object? level) {
  final parsed = level is int ? level : int.tryParse('$level');
  return kChildDensity[parsed] ?? _kDensityLevel1;
}
