import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHILD_THEME_KEYS,
  childThemeContextFromUser,
  normalizeChildThemeMode,
  resolveChildTheme,
} from '../lib/child-theme';
import {
  DEFAULT_APP_UI_SETTINGS,
  applyAppUISettings,
  normalizeAppUISettings,
  readStoredAppUISettings,
  resolveAppUISettings,
  saveStoredAppUISettings,
} from '../lib/app-settings';

beforeEach(() => {
  localStorage.clear();
  const root = document.documentElement;
  root.removeAttribute('data-child-theme');
  root.removeAttribute('data-child-theme-mode');
  root.classList.remove('theme-dark');
});

describe('child-theme 模型', () => {
  it('四套皮肤元数据完整', () => {
    expect(CHILD_THEME_KEYS).toEqual(['honey', 'candy', 'forest', 'space']);
  });

  it('偏好值容错解析，非法值回退 auto', () => {
    expect(normalizeChildThemeMode('candy')).toBe('candy');
    expect(normalizeChildThemeMode('auto')).toBe('auto');
    expect(normalizeChildThemeMode('nope')).toBe('auto');
    expect(normalizeChildThemeMode(undefined)).toBe('auto');
    expect(normalizeChildThemeMode(null)).toBe('auto');
  });

  it('手动选择时直接返回该皮肤', () => {
    for (const key of CHILD_THEME_KEYS) {
      expect(resolveChildTheme(key, { age: 6 })).toBe(key);
    }
  });

  it('auto 按精确年龄分三档', () => {
    expect(resolveChildTheme('auto', { age: 3 })).toBe('candy');
    expect(resolveChildTheme('auto', { age: 4 })).toBe('candy');
    expect(resolveChildTheme('auto', { age: 5 })).toBe('forest');
    expect(resolveChildTheme('auto', { age: 6 })).toBe('space');
  });

  it('auto 兼容项目现有 ageRange 二分法', () => {
    expect(resolveChildTheme('auto', { ageRange: '3-4' })).toBe('candy');
    expect(resolveChildTheme('auto', { ageRange: '5-6' })).toBe('space');
    expect(resolveChildTheme('auto', { ageRange: '4~5岁' })).toBe('forest');
  });

  it('缺少年龄信息时保持默认蜜黄，不改变存量用户界面', () => {
    expect(resolveChildTheme('auto')).toBe('honey');
    expect(resolveChildTheme('auto', {})).toBe('honey');
  });

  it('从用户对象提取年龄（含数字字符串与嵌套 settings）', () => {
    expect(childThemeContextFromUser({ age: 4 })).toEqual({ age: 4 });
    expect(childThemeContextFromUser({ age: '5' })).toEqual({ age: 5 });
    expect(childThemeContextFromUser({ ageRange: '3-4' })).toEqual({ ageRange: '3-4' });
    expect(childThemeContextFromUser({ settings: { ageRange: '5-6' } })).toEqual({
      ageRange: '5-6',
    });
    expect(childThemeContextFromUser(null)).toEqual({});
  });
});

describe('app-settings 与主题持久化', () => {
  it('normalize 补齐 childTheme，脏数据不抛错', () => {
    expect(normalizeAppUISettings({}).childTheme).toBe('auto');
    expect(normalizeAppUISettings({ childTheme: 'space', volume: 999 }).volume).toBe(100);
    expect(normalizeAppUISettings({ childTheme: 'bogus' }).childTheme).toBe('auto');
  });

  it('本机偏好可读写', () => {
    saveStoredAppUISettings({ ...DEFAULT_APP_UI_SETTINGS, childTheme: 'forest' });
    expect(readStoredAppUISettings().childTheme).toBe('forest');
  });

  it('后端未保存过 UI 设置时以本机偏好为准', () => {
    saveStoredAppUISettings({ ...DEFAULT_APP_UI_SETTINGS, childTheme: 'space' });
    expect(resolveAppUISettings({}).childTheme).toBe('space');
    expect(resolveAppUISettings({ nickname: '小明' }).childTheme).toBe('space');
  });

  it('后端保存过 UI 设置时后端优先（跨设备同步）', () => {
    saveStoredAppUISettings({ ...DEFAULT_APP_UI_SETTINGS, childTheme: 'space' });
    expect(
      resolveAppUISettings({ uiSettings: { childTheme: 'candy' } }).childTheme,
    ).toBe('candy');
    expect(resolveAppUISettings({ childTheme: 'forest' }).childTheme).toBe('forest');
  });

  it('apply 写入根节点，auto 按年龄解析', () => {
    applyAppUISettings(
      { ...DEFAULT_APP_UI_SETTINGS, childTheme: 'auto' },
      { user: { age: 3 }, isStudentArea: true },
    );
    expect(document.documentElement.dataset.childTheme).toBe('candy');
    expect(document.documentElement.dataset.childThemeMode).toBe('auto');
  });

  it('家长端强制蜜黄，不会被孩子端皮肤影响', () => {
    applyAppUISettings(
      { ...DEFAULT_APP_UI_SETTINGS, childTheme: 'space' },
      { user: { age: 6 }, isStudentArea: false },
    );
    expect(document.documentElement.dataset.childTheme).toBe('honey');
  });

  it('卡通皮肤自带明暗方案，深色模式不叠加', () => {
    applyAppUISettings(
      { ...DEFAULT_APP_UI_SETTINGS, darkMode: true, childTheme: 'space' },
      { isStudentArea: true },
    );
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false);

    applyAppUISettings(
      { ...DEFAULT_APP_UI_SETTINGS, darkMode: true, childTheme: 'honey' },
      { isStudentArea: true },
    );
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });
});
