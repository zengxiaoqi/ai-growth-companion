export type FontSizeMode = 'normal' | 'large';

export interface AppUISettings {
  volume: number;
  fontSize: FontSizeMode;
  darkMode: boolean;
}

export interface ChatAvatarSettings {
  userAvatar?: string;
  aiAvatar?: string;
}

const STORAGE_KEY = 'app_ui_settings';

export const DEFAULT_APP_UI_SETTINGS: AppUISettings = {
  volume: 80,
  fontSize: 'normal',
  darkMode: false,
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

export function getUserAppUISettings(userSettings?: Record<string, unknown>): AppUISettings {
  const settings = toRecord(userSettings);
  const nested = settings.uiSettings;
  if (nested && typeof nested === 'object') return normalizeAppUISettings(nested);

  const hasTopLevel =
    'volume' in settings ||
    'fontSize' in settings ||
    'darkMode' in settings;
  if (hasTopLevel) return normalizeAppUISettings(settings);

  return DEFAULT_APP_UI_SETTINGS;
}

export function resolveAppUISettings(userSettings?: Record<string, unknown>): AppUISettings {
  const local = readStoredAppUISettings();
  const user = getUserAppUISettings(userSettings);
  return normalizeAppUISettings({
    ...DEFAULT_APP_UI_SETTINGS,
    ...local,
    ...user,
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

export function resolveChatAvatarSettings(userSettings?: Record<string, unknown>): ChatAvatarSettings {
  const settings = toRecord(userSettings);
  const nested = settings.chatAvatars;
  if (nested && typeof nested === 'object') return normalizeChatAvatarSettings(nested);
  return DEFAULT_CHAT_AVATAR_SETTINGS;
}

export function applyAppUISettings(settings: AppUISettings): void {
  if (typeof document === 'undefined') return;
  const normalized = normalizeAppUISettings(settings);
  const root = document.documentElement;
  root.dataset.fontSize = normalized.fontSize;
  root.classList.toggle('theme-dark', normalized.darkMode);
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
    ...(payload.chatAvatars ? { chatAvatars: normalizeChatAvatarSettings(payload.chatAvatars) } : {}),
  };
}
