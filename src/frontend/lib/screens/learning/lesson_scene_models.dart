import 'package:flutter/material.dart';

// ==================== 数据模型 ====================

/// 场景背景类型
enum BackgroundType { day, night, indoor, seasonal, abstract }

/// 场景背景
class SceneBackground {
  final BackgroundType type;
  final Color? themeColor;
  final Color? accentColor;
  final String? season;

  const SceneBackground({
    this.type = BackgroundType.day,
    this.themeColor,
    this.accentColor,
    this.season,
  });

  factory SceneBackground.fromJson(Map<String, dynamic> json) {
    return SceneBackground(
      type: _parseBackgroundType(json['type']?.toString()),
      themeColor: _parseColor(json['themeColor']),
      accentColor: _parseColor(json['accentColor']),
      season: json['season']?.toString(),
    );
  }
}

/// 场景角色
class SceneCharacter {
  final String id;
  final String label;
  final String? pose;
  final String? mood;
  final Color? color;

  const SceneCharacter({
    required this.id,
    required this.label,
    this.pose,
    this.mood,
    this.color,
  });

  factory SceneCharacter.fromJson(Map<String, dynamic> json) {
    return SceneCharacter(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      pose: json['pose']?.toString(),
      mood: json['mood']?.toString(),
      color: _parseColor(json['color']),
    );
  }
}

/// 场景道具
class SceneItem {
  final String id;
  final String label;
  final String? kind;
  final String? state;
  final Color? color;

  const SceneItem({
    required this.id,
    required this.label,
    this.kind,
    this.state,
    this.color,
  });

  factory SceneItem.fromJson(Map<String, dynamic> json) {
    return SceneItem(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      kind: json['kind']?.toString(),
      state: json['state']?.toString(),
      color: _parseColor(json['color']),
    );
  }
}

/// 场景视觉配置
class SceneVisual {
  final SceneBackground? background;
  final List<SceneCharacter> characters;
  final List<SceneItem> items;
  final List<String> effects;
  final String? caption;
  final String? templateId;
  final Map<String, dynamic>? templateParams;

  const SceneVisual({
    this.background,
    this.characters = const [],
    this.items = const [],
    this.effects = const [],
    this.caption,
    this.templateId,
    this.templateParams,
  });

  factory SceneVisual.fromJson(Map<String, dynamic> json) {
    return SceneVisual(
      background: json['background'] != null
          ? SceneBackground.fromJson(json['background'])
          : null,
      characters: (json['characters'] as List?)
              ?.map((e) => SceneCharacter.fromJson(e))
              .toList() ??
          [],
      items: (json['items'] as List?)
              ?.map((e) => SceneItem.fromJson(e))
              .toList() ??
          [],
      effects: (json['effects'] as List?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      caption: json['caption']?.toString(),
      templateId: json['templateId']?.toString(),
      templateParams: json['templateParams'] as Map<String, dynamic>?,
    );
  }
}

/// 描红目标类型
enum TraceTargetKind { glyph, polyline }

/// 描红目标（文字）
class TraceGlyphTarget {
  final String id;
  final String label;
  final String text;
  final double? fontSize;

  const TraceGlyphTarget({
    required this.id,
    required this.label,
    required this.text,
    this.fontSize,
  });

  factory TraceGlyphTarget.fromJson(Map<String, dynamic> json) {
    return TraceGlyphTarget(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      text: json['text']?.toString() ?? '',
      fontSize: json['fontSize'] != null
          ? double.tryParse(json['fontSize'].toString())
          : null,
    );
  }
}

/// 描红目标（折线形状）
class TracePolylineTarget {
  final String id;
  final String label;
  final List<Offset> points;

  const TracePolylineTarget({
    required this.id,
    required this.label,
    required this.points,
  });

  factory TracePolylineTarget.fromJson(Map<String, dynamic> json) {
    final pts = (json['points'] as List?)
            ?.map((p) => Offset(
                  (p['x'] as num).toDouble(),
                  (p['y'] as num).toDouble(),
                ))
            .toList() ??
        [];
    return TracePolylineTarget(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      points: pts,
    );
  }
}

/// 描红交互
class TracePathInteraction {
  final String? prompt;
  final List<dynamic> targets; // TraceGlyphTarget | TracePolylineTarget
  final double? minCoverage;

  const TracePathInteraction({
    this.prompt,
    required this.targets,
    this.minCoverage,
  });

  factory TracePathInteraction.fromJson(Map<String, dynamic> json) {
    final targets = <dynamic>[];
    for (final t in (json['targets'] as List?) ?? []) {
      final kind = t['kind']?.toString();
      if (kind == 'glyph') {
        targets.add(TraceGlyphTarget.fromJson(t));
      } else if (kind == 'polyline') {
        targets.add(TracePolylineTarget.fromJson(t));
      }
    }
    return TracePathInteraction(
      prompt: json['prompt']?.toString(),
      targets: targets,
      minCoverage: json['minCoverage'] != null
          ? double.tryParse(json['minCoverage'].toString())
          : null,
    );
  }
}

/// 活动交互
class LaunchActivityInteraction {
  final String? prompt;
  final String activityType;
  final Map<String, dynamic> activityData;

  const LaunchActivityInteraction({
    this.prompt,
    required this.activityType,
    required this.activityData,
  });

  factory LaunchActivityInteraction.fromJson(Map<String, dynamic> json) {
    return LaunchActivityInteraction(
      prompt: json['prompt']?.toString(),
      activityType: json['activityType']?.toString() ?? '',
      activityData:
          (json['activityData'] as Map<String, dynamic>?) ?? {},
    );
  }
}

/// 场景交互（联合类型）
class SceneInteraction {
  final String type;
  final TracePathInteraction? tracePath;
  final LaunchActivityInteraction? launchActivity;

  const SceneInteraction({
    required this.type,
    this.tracePath,
    this.launchActivity,
  });

  factory SceneInteraction.fromJson(Map<String, dynamic> json) {
    final type = json['type']?.toString() ?? '';
    return SceneInteraction(
      type: type,
      tracePath: type == 'trace_path'
          ? TracePathInteraction.fromJson(json)
          : null,
      launchActivity: type == 'launch_activity'
          ? LaunchActivityInteraction.fromJson(json)
          : null,
    );
  }
}

/// 课程场景
class LessonScene {
  final String id;
  final String title;
  final String narration;
  final String? onScreenText;
  final int durationSec;
  final SceneVisual? visual;
  final SceneInteraction? interaction;

  const LessonScene({
    required this.id,
    required this.title,
    this.narration = '',
    this.onScreenText,
    this.durationSec = 6,
    this.visual,
    this.interaction,
  });

  factory LessonScene.fromJson(Map<String, dynamic> json) {
    return LessonScene(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      narration: json['narration']?.toString() ?? '',
      onScreenText: json['onScreenText']?.toString(),
      durationSec: int.tryParse(json['durationSec']?.toString() ?? '6') ?? 6,
      visual: json['visual'] != null
          ? SceneVisual.fromJson(json['visual'])
          : null,
      interaction: json['interaction'] != null
          ? SceneInteraction.fromJson(json['interaction'])
          : null,
    );
  }
}

/// 完成策略
enum CompletionPolicyType { allScenes, anyInteraction }

class LessonSceneCompletionPolicy {
  final CompletionPolicyType type;
  final int? passingScore;
  final double? minCoverage;

  const LessonSceneCompletionPolicy({
    this.type = CompletionPolicyType.allScenes,
    this.passingScore,
    this.minCoverage,
  });

  factory LessonSceneCompletionPolicy.fromJson(Map<String, dynamic> json) {
    return LessonSceneCompletionPolicy(
      type: json['type']?.toString() == 'any_interaction'
          ? CompletionPolicyType.anyInteraction
          : CompletionPolicyType.allScenes,
      passingScore: json['passingScore'] != null
          ? int.tryParse(json['passingScore'].toString())
          : null,
      minCoverage: json['minCoverage'] != null
          ? double.tryParse(json['minCoverage'].toString())
          : null,
    );
  }
}

/// 场景模式
enum LessonSceneMode { playback, guidedTrace, activityShell }

/// 课程场景文档
class LessonSceneDocument {
  final LessonSceneMode mode;
  final List<LessonScene> scenes;
  final LessonSceneCompletionPolicy? completionPolicy;

  const LessonSceneDocument({
    this.mode = LessonSceneMode.playback,
    required this.scenes,
    this.completionPolicy,
  });

  factory LessonSceneDocument.fromJson(Map<String, dynamic> json) {
    final modeStr = json['mode']?.toString();
    final mode = modeStr == 'guided_trace'
        ? LessonSceneMode.guidedTrace
        : modeStr == 'activity_shell'
            ? LessonSceneMode.activityShell
            : LessonSceneMode.playback;

    return LessonSceneDocument(
      mode: mode,
      scenes: (json['scenes'] as List?)
              ?.map((e) => LessonScene.fromJson(e))
              .toList() ??
          [],
      completionPolicy: json['completionPolicy'] != null
          ? LessonSceneCompletionPolicy.fromJson(json['completionPolicy'])
          : null,
    );
  }
}

/// 描红结果
class TraceResult {
  final double coverage;
  final int attempts;
  final int score;

  const TraceResult({
    required this.coverage,
    required this.attempts,
    required this.score,
  });
}

/// 活动结果
class ActivityResult {
  final int score;
  final int totalQuestions;
  final int correctAnswers;
  final int? timeSpent;

  const ActivityResult({
    required this.score,
    required this.totalQuestions,
    required this.correctAnswers,
    this.timeSpent,
  });
}

// ==================== 辅助函数 ====================

BackgroundType _parseBackgroundType(String? s) {
  switch (s) {
    case 'night':
      return BackgroundType.night;
    case 'indoor':
      return BackgroundType.indoor;
    case 'seasonal':
      return BackgroundType.seasonal;
    case 'abstract':
      return BackgroundType.abstract;
    default:
      return BackgroundType.day;
  }
}

Color? _parseColor(dynamic value) {
  if (value == null) return null;
  final s = value.toString().replaceAll('#', '').trim();
  if (s.isEmpty) return null;
  try {
    if (s.length == 6) {
      return Color(int.parse('FF$s', radix: 16));
    } else if (s.length == 8) {
      return Color(int.parse(s, radix: 16));
    }
  } catch (_) {}
  return null;
}
