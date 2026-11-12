import {
  childThemeContextFromUser,
  normalizeChildThemeMode,
  resolveChildTheme,
  type ChildThemeMode,
} from './child-theme';
import { syncChildDensity } from './child-density-store';

export type FontSizeMode = 'normal' | 'large';

export interface AppUISettings {
  volume: number;
  fontSize: FontSizeMode;
  darkMode: boolean;
  /** 孩子端皮肤偏好；'auto' 表示按年龄自动推荐，用户可手动覆盖 */
  childTheme: ChildThemeMode;
}

export interface ChatAvatarSettings {
  userAvatar?: string;
  aiAvatar?: string;
}

const STORAGE_KEY = 'app_ui_settings';

/** UI 设置字段名，用于判断后端用户设置里是否保存过 UI 偏好 */
const UI_SETTING_KEYS = ['volume', 'fontSize', 'darkMode', 'childTheme'] as const;

export const DEFAULT_APP_UI_SETTINGS: AppUISettings = {
  volume: 80,
  fontSize: 'normal',
  darkMode: false,
  childTheme: 'auto',
};

export const DEFAULT_CHAT_AVATAR_SETTINGS: ChatAvatarSettings = {};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function clampVolume(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_APP_UI_SETTINGS.volume;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizeFontSize(value: unknown): FontSizeMode {
  return value === 'large' ? 'large' : 'normal';
}

function normalizeDarkMode(value: unknown): boolean {
  return Boolean(value);
}

export function normalizeAppUISettings(value: unknown): AppUISettings {
  const source = toRecord(value);
  return {
    volume: clampVolume(source.volume),
    fontSize: normalizeFontSize(source.fontSize),
    darkMode: normalizeDarkMode(source.darkMode),
    childTheme: normalizeChildThemeMode(source.childTheme),
  };
}

export function readStoredAppUISettings(): AppUISettings {
  if (typeof window === 'undefined') return DEFAULT_APP_UI_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_UI_SETTINGS;
    return normalizeAppUISettings(JSON.parse(raw));
  } catch {
    return DEFAULT_APP_UI_SETTINGS;
  }
}

export function saveStoredAppUISettings(settings: AppUISettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAppUISettings(settings)));
}

/** 从后端 user.settings 中取出 UI 偏好（兼容嵌套 uiSettings 与平铺两种存法） */
export function getUserAppUISettings(userSettings?: Record<string, unknown>): AppUISettings {
  const settings = toRecord(userSettings);
  const nested = settings.uiSettings;
  if (nested && typeof nested === 'object') return normalizeAppUISettings(nested);

  const hasTopLevel = UI_SETTING_KEYS.some((key) => key in settings);
  if (hasTopLevel) return normalizeAppUISettings(settings);

  return DEFAULT_APP_UI_SETTINGS;
}

/**
 * 合并本地偏好与后端偏好。
 * 后端从未保存过 UI 设置时，以 localStorage 为准 —— 否则用户手动选的主题
 * 在刷新后会被默认值覆盖。后端保存过则后端优先（跨设备同步）。
 */
export function resolveAppUISettings(userSettings?: Record<string, unknown>): AppUISettings {
  const local = readStoredAppUISettings();
  const raw = toRecord(userSettings);
  const nested = raw.uiSettings;

  const hasUserPreference =
    (nested && typeof nested === 'object'
      ? UI_SETTING_KEYS.some((key) => key in (nested as Record<string, unknown>))
      : UI_SETTING_KEYS.some((key) => key in raw));

  if (!hasUserPreference) {
    return normalizeAppUISettings({ ...DEFAULT_APP_UI_SETTINGS, ...local });
  }

  return normalizeAppUISettings({
    ...DEFAULT_APP_UI_SETTINGS,
    ...local,
    ...getUserAppUISettings(userSettings),
  });
}

export function normalizeChatAvatarSettings(value: unknown): ChatAvatarSettings {
  const source = toRecord(value);
  const userAvatar =
    typeof source.userAvatar === 'string' && source.userAvatar.trim().length > 0
      ? source.userAvatar
      : undefined;
  const aiAvatar =
    typeof source.aiAvatar === 'string' && source.aiAvatar.trim().length > 0
      ? source.aiAvatar
      : undefined;

  return { userAvatar, aiAvatar };
}

export function resolveChatAvatarSettings(
  userSettings?: Record<string, unknown>,
): ChatAvatarSettings {
  const settings = toRecord(userSettings);
  const nested = settings.chatAvatars;
  if (nested && typeof nested === 'object') return normalizeChatAvatarSettings(nested);
  return DEFAULT_CHAT_AVATAR_SETTINGS;
}

export interface AppUIApplyContext {
  /** 当前用户，用于 auto 模式按年龄推断皮肤 */
  user?: unknown;
  /** 是否处于学生端路由；家长端强制使用默认蜜黄皮肤 */
  isStudentArea?: boolean;
}

export function applyAppUISettings(
  settings: AppUISettings,
  context: AppUIApplyContext = {},
): void {
  if (typeof document === 'undefined') return;
  const normalized = normalizeAppUISettings(settings);
  const root = document.documentElement;

  root.dataset.fontSize = normalized.fontSize;
  root.dataset.childThemeMode = normalized.childTheme;

  const inStudentArea = context.isStudentArea ?? true;
  const activeTheme: string = inStudentArea
    ? resolveChildTheme(normalized.childTheme, childThemeContextFromUser(context.user))
    : 'honey';
  root.dataset.childTheme = activeTheme;

  // 年龄密度档：CSS 用 data-child-level，React 组件经 store 订阅 useChildDensity。
  // 家长端 activeTheme 恒为 honey（中档），因此家长端行为保持原样。
  root.dataset.childLevel = String(syncChildDensity(activeTheme));

  // 卡通皮肤各自带明暗方案；深色模式只在默认蜜黄皮肤下生效，避免叠加串色。
  root.classList.toggle('theme-dark', normalized.darkMode && activeTheme === 'honey');
  root.style.setProperty('--app-audio-volume', String(normalized.volume / 100));
}

export function getAudioVolume(): number {
  return readStoredAppUISettings().volume / 100;
}

export function mergeUserSettingsWithUI(
  current: Record<string, unknown> | undefined,
  uiSettings: AppUISettings,
): Record<string, unknown> {
  return {
    ...toRecord(current),
    uiSettings: normalizeAppUISettings(uiSettings),
  };
}

export function mergeUserSettings(
  current: Record<string, unknown> | undefined,
  payload: {
    uiSettings?: AppUISettings;
    chatAvatars?: ChatAvatarSettings;
  },
): Record<string, unknown> {
  return {
    ...toRecord(current),
    ...(payload.uiSettings ? { uiSettings: normalizeAppUISettings(payload.uiSettings) } : {}),
    ...(payload.chatAvatars
      ? { chatAvatars: normalizeChatAvatarSettings(payload.chatAvatars) }
      : {}),
  };
}
