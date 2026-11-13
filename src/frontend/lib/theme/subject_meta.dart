/// 孩子端学科元数据（学习中心用）。
///
/// 与 [domain_registry.dart] 的区别：
/// - `domain_registry` 是家长报告的固定语义色板，跨皮肤不变；
/// - 这里是孩子端的展示口径，颜色取当前皮肤 `palette.subjects[colorIndex]`，
///   随皮肤（honey / candy / forest / space）一起变化。
///
/// 只做「英文 domain → 中文名 + emoji + 配色槽位」的映射，
/// 未知 key 一律兜底成 `📘`，不抛异常（后端可能新增学科）。
library;

import 'package:flutter/material.dart';

import 'child_theme.dart';

class SubjectMeta {
  final String key;
  final String label;
  final String emoji;

  /// 矢量图标：emoji 在某些 Web 环境下缺字体会变成方块，
  /// 卡片封面 / 页头这类大尺寸位置一律用图标，emoji 只作小装饰。
  final IconData icon;

  /// 在 `palette.subjects` 里的槽位（0–5 循环）。
  final int colorIndex;

  /// 一句话副标题，学科页头部用。
  final String tagline;

  const SubjectMeta({
    required this.key,
    required this.label,
    required this.emoji,
    required this.icon,
    required this.colorIndex,
    required this.tagline,
  });

  Color colorFor(ChildThemePalette palette) {
    final list = palette.subjects;
    if (list.isEmpty) return palette.pop;
    return list[colorIndex % list.length];
  }
}

const List<SubjectMeta> kSubjectMetaList = <SubjectMeta>[
  SubjectMeta(
    key: 'language',
    label: '语言',
    emoji: '🗣️',
    icon: Icons.chat_bubble_rounded,
    colorIndex: 0,
    tagline: '听故事 · 学表达',
  ),
  SubjectMeta(
    key: 'math',
    label: '数学',
    emoji: '🔢',
    icon: Icons.calculate_rounded,
    colorIndex: 1,
    tagline: '数一数 · 找规律',
  ),
  SubjectMeta(
    key: 'science',
    label: '科学',
    emoji: '🔬',
    icon: Icons.science_rounded,
    colorIndex: 2,
    tagline: '问为什么 · 做实验',
  ),
  SubjectMeta(
    key: 'art',
    label: '艺术',
    emoji: '🎨',
    icon: Icons.palette_rounded,
    colorIndex: 3,
    tagline: '涂一涂 · 做手工',
  ),
  SubjectMeta(
    key: 'social',
    label: '社会',
    emoji: '🌍',
    icon: Icons.public_rounded,
    colorIndex: 4,
    tagline: '认识世界 · 学会相处',
  ),
  SubjectMeta(
    key: 'music',
    label: '音乐',
    emoji: '🎵',
    icon: Icons.music_note_rounded,
    colorIndex: 5,
    tagline: '唱一唱 · 打节拍',
  ),
  SubjectMeta(
    key: 'english',
    label: '英语',
    emoji: '🔤',
    icon: Icons.translate_rounded,
    colorIndex: 0,
    tagline: '磨耳朵 · 说单词',
  ),
];

const SubjectMeta _kFallbackSubject = SubjectMeta(
  key: 'general',
  label: '综合',
  emoji: '📘',
  icon: Icons.menu_book_rounded,
  colorIndex: 0,
  tagline: '什么都学一点',
);

/// 容错查询：未知 / 空 key 返回「综合」。
SubjectMeta subjectMetaFor(String? key) {
  if (key == null || key.isEmpty) return _kFallbackSubject;
  for (final meta in kSubjectMetaList) {
    if (meta.key == key) return meta;
  }
  return _kFallbackSubject;
}

/// 中文名快捷方法。
String subjectLabelOf(String? key) => subjectMetaFor(key).label;
