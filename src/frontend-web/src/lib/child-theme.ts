/**
 * 孩子端主题（皮肤）单一数据源。
 *
 * 设计来源：
 *   - docs/child-ui-redesign-v1-20261112.html  → honey（蜜黄绘本，v1 克制版）
 *   - docs/child-ui-themes-v2-20261112.html    → candy / forest / space（卡通年龄化版）
 *
 * 约定：
 *   - `ChildThemeMode` 是用户可保存的偏好（含 auto）
 *   - `ChildThemeKey` 是最终实际渲染的皮肤
 *   - CSS 变量由 `index.css` 的 `:root[data-child-theme="…"]` 提供，
 *     切换时只需改 `document.documentElement.dataset.childTheme`，组件代码零改动。
 */

export type ChildThemeKey = 'honey' | 'candy' | 'forest' | 'space';
export type ChildThemeMode = 'auto' | ChildThemeKey;

export interface ChildThemeMeta {
  key: ChildThemeKey;
  name: string;
  age: string;
  tag: string;
  description: string;
  /** 用于设置页预览的 4 个色块 */
  swatches: readonly [string, string, string, string];
  /** 信息密度档位：0 低龄图形优先 / 1 中等 / 2 高密度 */
  level: 0 | 1 | 2;
}

export const CHILD_THEME_KEYS: readonly ChildThemeKey[] = [
  'honey',
  'candy',
  'forest',
  'space',
];

export const CHILD_THEMES: Record<ChildThemeKey, ChildThemeMeta> = {
  honey: {
    key: 'honey',
    name: '蜜黄绘本',
    age: '通用',
    tag: 'v1 · 克制绘本',
    description: '项目原有的蜜黄基调，低饱和、文字优先，适合不想太花哨的时候。',
    swatches: ['#FFF7D5', '#705900', '#FDD34D', '#97DAFF'],
    level: 1,
  },
  candy: {
    key: 'candy',
    name: '糖果云朵国',
    age: '3–4 岁',
    tag: '图形优先 · 大圆角',
    description: '草莓粉奶油底、超大圆角、粗描边和大眼小犀，不依赖识字。',
    swatches: ['#FFF2F7', '#FF6FA5', '#FFD84D', '#7EC8FF'],
    level: 0,
  },
  forest: {
    key: 'forest',
    name: '森林探险队',
    age: '4–5 岁',
    tag: '探索感 · 中等密度',
    description: '嫩芽绿配橘子橙，探险地图感，加入进度环与任务清单。',
    swatches: ['#F1F8E6', '#FF8A3D', '#FFC93C', '#8BD46A'],
    level: 1,
  },
  space: {
    key: 'space',
    name: '星际小队',
    age: '5–6 岁',
    tag: '深色酷感 · 高信息密度',
    description: '深紫夜空配荧光青与亮黄，火箭星球装饰，最像「大孩子」。',
    swatches: ['#241C4E', '#332A68', '#4FE0D0', '#FFD84D'],
    level: 2,
  },
};

export const DEFAULT_CHILD_THEME_MODE: ChildThemeMode = 'auto';

export function isChildThemeKey(value: unknown): value is ChildThemeKey {
  return (
    typeof value === 'string' && (CHILD_THEME_KEYS as readonly string[]).includes(value)
  );
}

/** 容错解析持久化值：非法/缺失一律回退到 auto */
export function normalizeChildThemeMode(value: unknown): ChildThemeMode {
  return value === 'auto' || isChildThemeKey(value)
    ? (value as ChildThemeMode)
    : DEFAULT_CHILD_THEME_MODE;
}

export interface ChildThemeContext {
  age?: number;
  ageRange?: string;
}

/**
 * 从用户对象里提取年龄信息。保持宽松签名，避免与 types.ts 的 User 强耦合。
 * 支持 `user.age`（number / 数字字符串）、`user.ageRange`（'3-4' | '5-6'），
 * 以及 `user.settings.ageRange`。
 */
export function childThemeContextFromUser(user: unknown): ChildThemeContext {
  if (!user || typeof user !== 'object') return {};
  const source = user as Record<string, unknown>;

  let age: number | undefined;
  if (typeof source.age === 'number' && Number.isFinite(source.age)) {
    age = source.age;
  } else if (typeof source.age === 'string' && Number.isFinite(Number(source.age))) {
    age = Number(source.age);
  }

  let ageRange: string | undefined;
  if (typeof source.ageRange === 'string') {
    ageRange = source.ageRange;
  } else if (
    source.settings &&
    typeof source.settings === 'object' &&
    typeof (source.settings as Record<string, unknown>).ageRange === 'string'
  ) {
    ageRange = (source.settings as Record<string, unknown>).ageRange as string;
  }

  return { age, ageRange };
}

/**
 * 把偏好解析成实际皮肤。
 * auto 档：优先按精确年龄分三档；没有年龄时按项目现有 ageRange 二分；
 * 完全缺少年龄信息时回退 honey，避免改变存量用户的界面。
 */
export function resolveChildTheme(
  mode: ChildThemeMode,
  context: ChildThemeContext = {},
): ChildThemeKey {
  const normalized = normalizeChildThemeMode(mode);
  if (normalized !== 'auto') return normalized;

  const { age, ageRange } = context;
  if (typeof age === 'number' && Number.isFinite(age) && age > 0) {
    if (age < 4.5) return 'candy';
    if (age < 5.5) return 'forest';
    return 'space';
  }

  if (ageRange === '3-4') return 'candy';
  if (ageRange === '5-6') return 'space';

  // 兼容 '3~4岁' 之类的自由格式
  const match = typeof ageRange === 'string' ? ageRange.match(/(\d+(?:\.\d+)?)/) : null;
  if (match) {
    const start = Number(match[1]);
    if (start >= 5) return 'space';
    if (start >= 4) return 'forest';
    return 'candy';
  }

  return 'honey';
}

/* -------------------------------------------------------------------------- */
/* 年龄密度层                                                                  */
/*                                                                            */
/* 设计来源：docs/child-ui-themes-v2-20261112.html 第 04 节。                    */
/* 原则：三档不是三套组件，而是同一组件读下面这些开关，避免代码分叉。            */
/* 所有开关都必须有消费方；新增字段时同步补组件与测试。                         */
/* -------------------------------------------------------------------------- */

export type ChildDensityLevel = 0 | 1 | 2;
export type ChildProgressMode = 'stars' | 'ring' | 'checklist';

export interface ChildDensity {
  level: ChildDensityLevel;
  /** 首屏主动作数量（1 → 2 → 3），多出的动作降级为次要按钮 */
  primaryActions: 1 | 2 | 3;
  /** 「今天的小发现」卡片张数 */
  discoveryCards: number;
  /** 学科入口个数 */
  subjects: number;
  /** 学科网格在 sm 断点以上的列数 */
  subjectColumns: 2 | 3;
  /** 「今天要做的事」默认露出条数 */
  todayTasks: number;
  /** AI 快捷提问个数 */
  quickPrompts: number;
  /** 是否显示文字输入框：低龄档只保留语音，不要求识字 */
  textInput: boolean;
  /** 进度呈现：纯图形星星 → 进度环+数字 → 任务勾选清单 */
  progressMode: ChildProgressMode;
  /** 主按钮最小高度 px（触控目标始终 ≥ 44px） */
  ctaHeight: number;
  /** 学科按钮最小高度 px */
  subjectHeight: number;
  /** 是否显示 AI 建议行 */
  suggestions: boolean;
  /** 是否显示学科/课程的辅助文字（低龄档只留图形） */
  showMeta: boolean;
}

export const CHILD_DENSITY: Record<ChildDensityLevel, ChildDensity> = {
  0: {
    level: 0,
    primaryActions: 1,
    discoveryCards: 3,
    subjects: 4,
    subjectColumns: 2,
    todayTasks: 1,
    quickPrompts: 3,
    textInput: false,
    progressMode: 'stars',
    ctaHeight: 66,
    subjectHeight: 118,
    suggestions: false,
    showMeta: false,
  },
  1: {
    level: 1,
    primaryActions: 2,
    discoveryCards: 4,
    subjects: 6,
    subjectColumns: 3,
    todayTasks: 2,
    quickPrompts: 3,
    textInput: true,
    progressMode: 'ring',
    ctaHeight: 56,
    subjectHeight: 102,
    suggestions: false,
    showMeta: true,
  },
  2: {
    level: 2,
    primaryActions: 3,
    discoveryCards: 5,
    subjects: 6,
    subjectColumns: 3,
    todayTasks: 3,
    quickPrompts: 4,
    textInput: true,
    progressMode: 'checklist',
    ctaHeight: 48,
    subjectHeight: 98,
    suggestions: true,
    showMeta: true,
  },
};

/** 容错解析：任何非法 level 都回落到中档（也是存量用户/家长端的默认档） */
export function childDensityForLevel(level: unknown): ChildDensity {
  if (level === 0 || level === '0') return CHILD_DENSITY[0];
  if (level === 2 || level === '2') return CHILD_DENSITY[2];
  return CHILD_DENSITY[1];
}

export function childDensityForTheme(key: ChildThemeKey): ChildDensity {
  return childDensityForLevel(CHILD_THEMES[key]?.level);
}
