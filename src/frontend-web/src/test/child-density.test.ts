import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHILD_DENSITY,
  CHILD_THEMES,
  childDensityForLevel,
  childDensityForTheme,
} from '../lib/child-theme';
import {
  getChildDensitySnapshot,
  subscribeChildDensity,
  syncChildDensity,
} from '../lib/child-density-store';
import { applyAppUISettings, DEFAULT_APP_UI_SETTINGS } from '../lib/app-settings';

function applyTheme(mode: 'auto' | 'honey' | 'candy' | 'forest' | 'space', student = true) {
  applyAppUISettings(
    { ...DEFAULT_APP_UI_SETTINGS, childTheme: mode },
    { user: { age: 4 }, isStudentArea: student },
  );
}

describe('孩子端年龄密度模型', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-child-theme');
    document.documentElement.removeAttribute('data-child-level');
    syncChildDensity('honey');
  });

  it('三档密度按年龄单调递增，且触控目标始终 ≥ 44px', () => {
    const [low, mid, high] = [CHILD_DENSITY[0], CHILD_DENSITY[1], CHILD_DENSITY[2]];

    expect(low.primaryActions).toBe(1);
    expect(mid.primaryActions).toBe(2);
    expect(high.primaryActions).toBe(3);

    expect(low.discoveryCards).toBeLessThan(mid.discoveryCards);
    expect(mid.discoveryCards).toBeLessThan(high.discoveryCards);
    expect(low.subjects).toBeLessThan(mid.subjects);
    expect(low.todayTasks).toBeLessThan(high.todayTasks);
    expect(low.quickPrompts).toBeLessThanOrEqual(high.quickPrompts);

    for (const density of [low, mid, high]) {
      expect(density.ctaHeight).toBeGreaterThanOrEqual(44);
      expect(density.subjectHeight).toBeGreaterThanOrEqual(44);
    }

    expect(low.textInput).toBe(false);
    expect(mid.textInput).toBe(true);
    expect(high.textInput).toBe(true);
    expect([low.progressMode, mid.progressMode, high.progressMode]).toEqual([
      'stars',
      'ring',
      'checklist',
    ]);
    expect(low.suggestions).toBe(false);
    expect(high.suggestions).toBe(true);
  });

  it('非法 level 一律回落到中档（存量用户与家长端）', () => {
    for (const value of [undefined, null, '', 9, -1, 'abc', {}, 1, '1']) {
      expect(childDensityForLevel(value).level).toBe(1);
    }
    expect(childDensityForLevel(0).level).toBe(0);
    expect(childDensityForLevel('2').level).toBe(2);
  });

  it('皮肤与档位映射单一且与主题元数据一致', () => {
    for (const key of ['honey', 'candy', 'forest', 'space'] as const) {
      expect(childDensityForTheme(key).level).toBe(CHILD_THEMES[key].level);
    }
    expect(childDensityForTheme('candy').level).toBe(0);
    expect(childDensityForTheme('honey').level).toBe(1);
    expect(childDensityForTheme('forest').level).toBe(1);
    expect(childDensityForTheme('space').level).toBe(2);
  });

  it('store 只在档位变化时通知订阅者，且不被 DOM 旧值覆盖', () => {
    syncChildDensity('honey');
    const listener = vi.fn();
    const unsubscribe = subscribeChildDensity(listener);

    syncChildDensity('honey');
    expect(listener).not.toHaveBeenCalled();

    syncChildDensity('candy');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getChildDensitySnapshot().level).toBe(0);

    // 惰性对齐只发生在首次，之后以 sync 为准
    expect(getChildDensitySnapshot().level).toBe(0);
    unsubscribe();

    syncChildDensity('honey');
  });

  it('applyAppUISettings 同时写 data-child-level 并切换密度', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeChildDensity(listener);

    applyTheme('candy');
    expect(document.documentElement.dataset.childTheme).toBe('candy');
    expect(document.documentElement.dataset.childLevel).toBe('0');
    expect(getChildDensitySnapshot().level).toBe(0);
    expect(listener).toHaveBeenCalled();

    applyTheme('space');
    expect(document.documentElement.dataset.childLevel).toBe('2');
    expect(getChildDensitySnapshot().level).toBe(2);

    unsubscribe();
  });

  it('家长端强制 honey，密度保持中档且文字输入可用', () => {
    applyTheme('space', false);
    expect(document.documentElement.dataset.childTheme).toBe('honey');
    expect(document.documentElement.dataset.childLevel).toBe('1');
    expect(getChildDensitySnapshot().textInput).toBe(true);
  });

  it('auto 按年龄推断密度的同时也推断档位', () => {
    applyAppUISettings(
      { ...DEFAULT_APP_UI_SETTINGS, childTheme: 'auto' },
      { user: { age: 3.5 }, isStudentArea: true },
    );
    expect(getChildDensitySnapshot().level).toBe(0);

    applyAppUISettings(
      { ...DEFAULT_APP_UI_SETTINGS, childTheme: 'auto' },
      { user: { age: 5.8 }, isStudentArea: true },
    );
    expect(getChildDensitySnapshot().level).toBe(2);
  });
});
