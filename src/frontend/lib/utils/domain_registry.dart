/// Single source of truth for the parent-report learning-domain enumeration.
///
/// Mirrors the backend registry at
/// src/backend/src/common/domain/learning-domains.ts (no shared codegen) — keep
/// the key set, order and labels identical. This fixed report palette is
/// deliberately NOT the skin-driven positional child-home palette.
library;

import 'package:flutter/material.dart';

class DomainSpec {
  final String key;
  final String label;
  final Color color;
  final IconData? icon;
  final String? emoji;

  const DomainSpec({
    required this.key,
    required this.label,
    required this.color,
    this.icon,
    this.emoji,
  });
}

const List<DomainSpec> kLearningDomains = <DomainSpec>[
  DomainSpec(key: 'language', label: '语言', color: Color(0xFF006384)),
  DomainSpec(key: 'math', label: '数学', color: Color(0xFF586000)),
  DomainSpec(key: 'science', label: '科学', color: Color(0xFF705900)),
  DomainSpec(key: 'art', label: '艺术', color: Color(0xFFB9AE6E)),
  DomainSpec(key: 'social', label: '社交', color: Color(0xFFB02500)),
  DomainSpec(key: 'english', label: '英语', color: Color(0xFF6A4C93)),
];

/// Tolerant lookup: unknown keys fall back to a neutral spec labelled with the
/// raw key. firstWhere requires orElse or it throws.
DomainSpec domainSpec(String key) => kLearningDomains.firstWhere(
      (d) => d.key == key,
      orElse: () =>
          DomainSpec(key: key, label: key, color: const Color(0xFF9E9E9E)),
    );

String domainLabel(String key) => domainSpec(key).label;

Color domainColor(String key) => domainSpec(key).color;