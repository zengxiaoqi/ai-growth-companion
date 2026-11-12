import 'package:flutter/material.dart';

import 'app_theme.dart';
import '../services/storage_service.dart';

/// 四套孩子端皮肤。
///
/// - `honey`：现有蜜黄绘本版（默认），色值沿用 [AppTheme]。
/// - `candy` / `forest` / `space`：年龄化皮肤，色值照抄
///   `docs/child-ui-themes-v2-20261112.html` 的 CSS 变量。
enum ChildThemeKey { honey, candy, forest, space }

/// 设置页选项：`auto` 为「跟随年龄」，其余为固定皮肤。
/// 持久化时直接存 [Enum.name]。
enum ChildThemeMode { auto, honey, candy, forest, space }

/// 容错解析持久化字符串：非法值 / 空值一律回退 [ChildThemeMode.auto]。
ChildThemeMode parseChildThemeMode(String? raw) {
  if (raw == null) return ChildThemeMode.auto;
  for (final mode in ChildThemeMode.values) {
    if (mode.name == raw) return mode;
  }
  return ChildThemeMode.auto;
}

/// 把 mode 转成可持久化的字符串。
String childThemeModeToStorage(ChildThemeMode mode) => mode.name;

/// 孩子端皮肤的完整色板，作为 [ThemeExtension] 挂在 [ThemeData.extensions] 上。
///
/// 业务代码可用 `ChildThemePalette.of(context)` 取到当前皮肤 token；
/// 历史代码的 `AppTheme.xxx` 已改为代理全局 [AppTheme.active] 色板，
/// 同样随皮肤变化，无需逐处迁移。
class ChildThemePalette extends ThemeExtension<ChildThemePalette> {
  // ── 颜色 token（对应设计稿 CSS 变量） ──
  final Color paper; // --paper 页面底色
  final Color card; // --card 卡片底色
  final Color ink; // --ink 主文字
  final Color ink2; // --ink-2 次级文字
  final Color edge; // --edge 描边色
  final Color line; // --line 分隔线
  final Color pop; // --pop 强调色
  final Color cta; // --cta 主行动按钮底色
  final Color ctaInk; // --cta-ink 主行动按钮文字
  final Color soft; // --soft 柔和辅助底色

  /// `colorScheme.onPrimary`：叠在 [pop] 上可读的文字/图标色。
  /// 设计稿未单独给这个 token，但 Material 的 ColorScheme 需要；
  /// 三套亮色皮肤 pop 较亮用深色，honey 的 pop 较深用白色。
  final Color onPrimary;

  // ── 形状 token ──
  final double radiusLg; // --r-lg
  final double radiusMd; // --r-md
  final double radiusSm; // --r-sm
  final double borderW; // --bw 描边宽度（honey 无描边，为 0）

  // ── 学科分类色（--s1 ~ --s6） ──
  final List<Color> subjects;

  const ChildThemePalette({
    required this.paper,
    required this.card,
    required this.ink,
    required this.ink2,
    required this.edge,
    required this.line,
    required this.pop,
    required this.cta,
    required this.ctaInk,
    required this.soft,
    required this.onPrimary,
    required this.radiusLg,
    required this.radiusMd,
    required this.radiusSm,
    required this.borderW,
    required this.subjects,
  });

  // ── 四套静态实例 ──

  /// 蜜黄绘本：直接复用 [AppTheme] 蜜黄基准 const 值，保证默认皮肤零视觉回归。
  static const ChildThemePalette honey = ChildThemePalette(
    paper: AppTheme.honeyBackground,
    card: Colors.white,
    ink: AppTheme.honeyText,
    ink2: AppTheme.honeyTextSecondary,
    edge: AppTheme.honeyPrimary,
    line: AppTheme.honeySoftYellow,
    pop: AppTheme.honeyPrimary,
    cta: AppTheme.honeyPrimary,
    ctaInk: Colors.white,
    soft: AppTheme.honeySoftYellow,
    onPrimary: Colors.white,
    radiusLg: AppTheme.honeyCardRadius,
    radiusMd: AppTheme.honeyButtonRadius,
    radiusSm: AppTheme.honeySmallRadius,
    borderW: 0,
    subjects: AppTheme.honeyChildColors,
  );

  /// 糖果云朵国 / 3–4 岁
  static const ChildThemePalette candy = ChildThemePalette(
    paper: Color(0xFFFFF2F7),
    card: Color(0xFFFFFFFF),
    ink: Color(0xFF4A2A46),
    ink2: Color(0xFF8A6A85),
    edge: Color(0xFF4A2A46),
    line: Color(0xFFF6DCE9),
    pop: Color(0xFFFF6FA5),
    cta: Color(0xFFFFD84D),
    ctaInk: Color(0xFF4A2A46),
    soft: Color(0xFFEAF6FF),
    onPrimary: Color(0xFF4A2A46),
    radiusLg: 34,
    radiusMd: 26,
    radiusSm: 18,
    borderW: 3,
    subjects: <Color>[
      Color(0xFFFF8FAF),
      Color(0xFF7FC5F5),
      Color(0xFF69D2A6),
      Color(0xFFFFC65C),
      Color(0xFFC79BEE),
      Color(0xFFFF9FC4),
    ],
  );

  /// 森林探险队 / 4–5 岁
  static const ChildThemePalette forest = ChildThemePalette(
    paper: Color(0xFFF1F8E6),
    card: Color(0xFFFFFFFF),
    ink: Color(0xFF22402C),
    ink2: Color(0xFF5E7A61),
    edge: Color(0xFF22402C),
    line: Color(0xFFDDEEC9),
    pop: Color(0xFFFF8A3D),
    cta: Color(0xFFFFC93C),
    ctaInk: Color(0xFF22402C),
    soft: Color(0xFFE7F5E4),
    onPrimary: Color(0xFF22402C),
    radiusLg: 28,
    radiusMd: 22,
    radiusSm: 16,
    borderW: 3,
    subjects: <Color>[
      Color(0xFFFF9F5A),
      Color(0xFF6FC5A8),
      Color(0xFF8FD05A),
      Color(0xFFFFD166),
      Color(0xFFA7C47F),
      Color(0xFFE88C8C),
    ],
  );

  /// 星际小队 / 5–6 岁（深色）
  static const ChildThemePalette space = ChildThemePalette(
    paper: Color(0xFF241C4E),
    card: Color(0xFF332A68),
    ink: Color(0xFFFFF5E6),
    ink2: Color(0xFFC6BCF0),
    edge: Color(0xFF7B69D6),
    line: Color(0xFF4A3D86),
    pop: Color(0xFF4FE0D0),
    cta: Color(0xFFFFD84D),
    ctaInk: Color(0xFF2A1F52),
    soft: Color(0xFF3B3078),
    onPrimary: Color(0xFF2A1F52),
    radiusLg: 26,
    radiusMd: 20,
    radiusSm: 14,
    borderW: 2.5,
    subjects: <Color>[
      Color(0xFFFF8FB4),
      Color(0xFF7AA8FF),
      Color(0xFF4FE0D0),
      Color(0xFFFFD166),
      Color(0xFFB18BFF),
      Color(0xFFFF9F6E),
    ],
  );

  /// 按皮肤 key 取对应色板。
  static ChildThemePalette ofKey(ChildThemeKey key) {
    switch (key) {
      case ChildThemeKey.honey:
        return honey;
      case ChildThemeKey.candy:
        return candy;
      case ChildThemeKey.forest:
        return forest;
      case ChildThemeKey.space:
        return space;
    }
  }

  /// 从当前 [ThemeData.extensions] 取色板；未挂载时回退 [honey]。
  static ChildThemePalette of(BuildContext context) =>
      Theme.of(context).extension<ChildThemePalette>() ?? honey;

  @override
  ChildThemePalette copyWith({
    Color? paper,
    Color? card,
    Color? ink,
    Color? ink2,
    Color? edge,
    Color? line,
    Color? pop,
    Color? cta,
    Color? ctaInk,
    Color? soft,
    Color? onPrimary,
    double? radiusLg,
    double? radiusMd,
    double? radiusSm,
    double? borderW,
    List<Color>? subjects,
  }) {
    return ChildThemePalette(
      paper: paper ?? this.paper,
      card: card ?? this.card,
      ink: ink ?? this.ink,
      ink2: ink2 ?? this.ink2,
      edge: edge ?? this.edge,
      line: line ?? this.line,
      pop: pop ?? this.pop,
      cta: cta ?? this.cta,
      ctaInk: ctaInk ?? this.ctaInk,
      soft: soft ?? this.soft,
      onPrimary: onPrimary ?? this.onPrimary,
      radiusLg: radiusLg ?? this.radiusLg,
      radiusMd: radiusMd ?? this.radiusMd,
      radiusSm: radiusSm ?? this.radiusSm,
      borderW: borderW ?? this.borderW,
      subjects: subjects ?? this.subjects,
    );
  }

  @override
  ChildThemePalette lerp(ThemeExtension<ChildThemePalette>? other, double t) {
    if (other is! ChildThemePalette) return this;
    Color lc(Color a, Color b) => Color.lerp(a, b, t) ?? a;
    double ld(double a, double b) => a + (b - a) * t;
    final len = subjects.length < other.subjects.length
        ? subjects.length
        : other.subjects.length;
    return ChildThemePalette(
      paper: lc(paper, other.paper),
      card: lc(card, other.card),
      ink: lc(ink, other.ink),
      ink2: lc(ink2, other.ink2),
      edge: lc(edge, other.edge),
      line: lc(line, other.line),
      pop: lc(pop, other.pop),
      cta: lc(cta, other.cta),
      ctaInk: lc(ctaInk, other.ctaInk),
      soft: lc(soft, other.soft),
      onPrimary: lc(onPrimary, other.onPrimary),
      radiusLg: ld(radiusLg, other.radiusLg),
      radiusMd: ld(radiusMd, other.radiusMd),
      radiusSm: ld(radiusSm, other.radiusSm),
      borderW: ld(borderW, other.borderW),
      subjects:
          List<Color>.generate(len, (i) => lc(subjects[i], other.subjects[i])),
    );
  }
}

/// 把 textTheme 里所有样式的颜色替换为当前皮肤的 ink / ink2。
///
/// 原 [AppTheme.lightTheme] 的 textTheme 每个样式都显式写了 color，
/// 所以 `TextTheme.apply` 不生效，必须逐个 copyWith。
TextTheme _retintTextTheme(TextTheme base, Color ink, Color ink2) {
  TextStyle? tint(TextStyle? style, Color color) =>
      style?.copyWith(color: color);
  return base.copyWith(
    headlineLarge: tint(base.headlineLarge, ink),
    headlineMedium: tint(base.headlineMedium, ink),
    headlineSmall: tint(base.headlineSmall, ink),
    titleLarge: tint(base.titleLarge, ink),
    titleMedium: tint(base.titleMedium, ink),
    titleSmall: tint(base.titleSmall, ink),
    bodyLarge: tint(base.bodyLarge, ink),
    bodyMedium: tint(base.bodyMedium, ink),
    bodySmall: tint(base.bodySmall, ink2),
    labelLarge: tint(base.labelLarge, ink),
    labelMedium: tint(base.labelMedium, ink2),
    labelSmall: tint(base.labelSmall, ink2),
  );
}

/// 以 [AppTheme.lightTheme] 为基础构造某套皮肤的 [ThemeData]。
///
/// 覆盖 colorScheme / scaffoldBackgroundColor / cardTheme / textTheme /
/// appBarTheme / bottomNavigationBarTheme / inputDecorationTheme /
/// elevatedButtonTheme / floatingActionButtonTheme，并挂上 [ChildThemePalette]。
///
/// `space` 使用 [Brightness.dark] 的 ColorScheme，其余用 light。
ThemeData buildChildTheme(ChildThemeKey key) {
  final base = AppTheme.lightTheme;
  final palette = ChildThemePalette.ofKey(key);
  final isDark = key == ChildThemeKey.space;

  // fromSeed 负责生成一整套 container / variant 角色色（并按 brightness
  // 给出深浅），再覆盖设计稿指定的关键语义色。
  final colorScheme = ColorScheme.fromSeed(
    seedColor: palette.pop,
    brightness: isDark ? Brightness.dark : Brightness.light,
  ).copyWith(
    primary: palette.pop,
    onPrimary: palette.onPrimary,
    secondary: palette.cta,
    onSecondary: palette.ctaInk,
    surface: palette.card,
    onSurface: palette.ink,
    surfaceContainerHighest: palette.soft,
    outline: palette.line,
    error: palette.pop,
    onError: palette.onPrimary,
  );

  return base.copyWith(
    brightness: isDark ? Brightness.dark : Brightness.light,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: palette.paper,
    cardTheme: CardThemeData(
      color: palette.card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(palette.radiusLg),
        side: palette.borderW > 0
            ? BorderSide(color: palette.edge, width: palette.borderW)
            : BorderSide.none,
      ),
    ),
    textTheme: _retintTextTheme(base.textTheme, palette.ink, palette.ink2),
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.bold,
        color: palette.ink,
      ),
      iconTheme: IconThemeData(color: palette.ink),
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: palette.card,
      selectedItemColor: palette.pop,
      unselectedItemColor: palette.ink2.withValues(alpha: 0.6),
      type: BottomNavigationBarType.fixed,
      elevation: 0,
      selectedLabelStyle: const TextStyle(
        fontWeight: FontWeight.bold,
        fontSize: 12,
      ),
      unselectedLabelStyle: const TextStyle(fontSize: 11),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: palette.card,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(palette.radiusMd),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(palette.radiusMd),
        borderSide: BorderSide(color: palette.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(palette.radiusMd),
        borderSide: BorderSide(
          color: palette.pop,
          width: palette.borderW > 0 ? palette.borderW : 2,
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      hintStyle: TextStyle(color: palette.ink2.withValues(alpha: 0.6)),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: palette.cta,
        foregroundColor: palette.ctaInk,
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(palette.radiusMd),
        ),
        elevation: 0,
        textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: palette.cta,
      foregroundColor: palette.ctaInk,
      elevation: 5,
      shape: const CircleBorder(),
    ),
    extensions: <ThemeExtension<dynamic>>[palette],
  );
}

/// 主题元数据，供设置页渲染选项卡片。
class ChildThemeMeta {
  final ChildThemeMode mode;
  final String name; // 中文名
  final String desc; // 一句话描述
  final String ageLabel; // 年龄标签
  final List<Color> swatches; // 色板小圆点
  final bool isDark; // 是否深色皮肤（用于标签配色）

  const ChildThemeMeta({
    required this.mode,
    required this.name,
    required this.desc,
    required this.ageLabel,
    required this.swatches,
    this.isDark = false,
  });
}

/// 设置页「孩子端主题」卡片的 5 个选项：跟随年龄 + 四套皮肤。
const List<ChildThemeMeta> kChildThemeOptions = <ChildThemeMeta>[
  ChildThemeMeta(
    mode: ChildThemeMode.auto,
    name: '跟随年龄',
    desc: '按孩子年龄自动匹配皮肤',
    ageLabel: '自动',
    swatches: <Color>[
      Color(0xFFFDD34D),
      Color(0xFFFF6FA5),
      Color(0xFFFF8A3D),
      Color(0xFF4FE0D0),
    ],
  ),
  ChildThemeMeta(
    mode: ChildThemeMode.honey,
    name: '蜜黄绘本',
    desc: '温暖手绘 · 经典默认',
    ageLabel: '通用',
    swatches: <Color>[
      Color(0xFFFDD34D),
      Color(0xFF705900),
      Color(0xFFC26B5A),
      Color(0xFF4A8F86),
    ],
  ),
  ChildThemeMeta(
    mode: ChildThemeMode.candy,
    name: '糖果云朵国',
    desc: '甜美粉彩 · 圆润软萌',
    ageLabel: '3–4 岁',
    swatches: <Color>[
      Color(0xFFFF6FA5),
      Color(0xFFFFD84D),
      Color(0xFFFF8FAF),
      Color(0xFF7FC5F5),
    ],
  ),
  ChildThemeMeta(
    mode: ChildThemeMode.forest,
    name: '森林探险队',
    desc: '清新草木 · 自然探险',
    ageLabel: '4–5 岁',
    swatches: <Color>[
      Color(0xFFFF8A3D),
      Color(0xFFFFC93C),
      Color(0xFFFF9F5A),
      Color(0xFF6FC5A8),
    ],
  ),
  ChildThemeMeta(
    mode: ChildThemeMode.space,
    name: '星际小队',
    desc: '深空夜色 · 星际冒险',
    ageLabel: '5–6 岁',
    isDark: true,
    swatches: <Color>[
      Color(0xFF4FE0D0),
      Color(0xFFFFD84D),
      Color(0xFF7AA8FF),
      Color(0xFFB18BFF),
    ],
  ),
];

/// 孩子端主题状态：持久化 mode，按年龄解析 auto，产出 themeData / palette。
class ChildThemeController extends ChangeNotifier {
  ChildThemeController(this._storage) {
    _mode = parseChildThemeMode(_storage.getChildThemeMode());
  }

  final StorageService _storage;

  late ChildThemeMode _mode;
  double? _age;

  ChildThemeMode get mode => _mode;
  double? get age => _age;

  /// auto 时按年龄推断：<4.5 → candy，<5.5 → forest，≥5.5 → space；
  /// 无年龄 → honey（保持现有默认外观）。
  ChildThemeKey get resolvedKey {
    switch (_mode) {
      case ChildThemeMode.honey:
        return ChildThemeKey.honey;
      case ChildThemeMode.candy:
        return ChildThemeKey.candy;
      case ChildThemeMode.forest:
        return ChildThemeKey.forest;
      case ChildThemeMode.space:
        return ChildThemeKey.space;
      case ChildThemeMode.auto:
        final a = _age;
        if (a == null) return ChildThemeKey.honey;
        if (a < 4.5) return ChildThemeKey.candy;
        if (a < 5.5) return ChildThemeKey.forest;
        return ChildThemeKey.space;
    }
  }

  ThemeData get themeData => buildChildTheme(resolvedKey);
  ChildThemePalette get palette => ChildThemePalette.ofKey(resolvedKey);

  /// 切换模式并落盘。先 notify 让 UI 即时换肤，再异步持久化。
  Future<void> setMode(ChildThemeMode mode) async {
    if (mode == _mode) return;
    _mode = mode;
    notifyListeners();
    await _storage.saveChildThemeMode(childThemeModeToStorage(mode));
  }

  /// 同步当前用户年龄（仅影响 auto 模式）。
  /// 年龄来自 UserProvider，不做持久化；接受 num / String / null。
  void setAge(Object? age) {
    double? parsed;
    if (age is num) {
      parsed = age.toDouble();
    } else if (age is String) {
      parsed = double.tryParse(age);
    }
    if (parsed == _age) return;
    _age = parsed;
    // 仅 auto 模式下年龄变化会改变解析结果，其余模式无需重建。
    if (_mode == ChildThemeMode.auto) notifyListeners();
  }
}
