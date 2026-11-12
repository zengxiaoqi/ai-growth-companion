/**
 * 孩子端年龄密度的外部 store（纯 TS，无 React 依赖）。
 *
 * 主题切换由 applyAppUISettings 直接写 document.documentElement.dataset，
 * 不会触发 React 重渲染。这里用一个极小的可订阅 store 把「当前密度档」
 * 同步给 useSyncExternalStore，让所有消费组件在换肤瞬间一起更新。
 *
 * 同时也兼容 DOM 已经被其它代码改过的情况：getSnapshot 会惰性对齐 dataset。
 */

import {
  childDensityForTheme,
  isChildThemeKey,
  type ChildDensity,
  type ChildDensityLevel,
  type ChildThemeKey,
} from './child-theme';

const listeners = new Set<() => void>();
let snapshot: ChildDensity = childDensityForTheme('honey');
/** DOM 只在首次读取时用于对齐；之后一律以 syncChildDensity 为准 */
let initialized = false;

function themeKeyFromDom(): ChildThemeKey {
  if (typeof document === 'undefined') return 'honey';
  const key = document.documentElement.dataset.childTheme;
  return isChildThemeKey(key) ? key : 'honey';
}

/**
 * 由 `applyAppUISettings` 在每次应用设置时调用。
 * 返回当前档位，供调用方写入 `data-child-level`（CSS 也需要这个属性）。
 */
export function syncChildDensity(themeKey: string): ChildDensityLevel {
  initialized = true;
  const key: ChildThemeKey = isChildThemeKey(themeKey) ? themeKey : 'honey';
  const next = childDensityForTheme(key);
  if (next.level !== snapshot.level) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  return next.level;
}

export function subscribeChildDensity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getChildDensitySnapshot(): ChildDensity {
  // 惰性对齐：首次挂载时 DOM 可能已经带着非默认皮肤。
  // 只做一次，否则会把 syncChildDensity 刚写入的档位又拉回 DOM 的旧值。
  if (!initialized) {
    const fromDom = childDensityForTheme(themeKeyFromDom());
    if (fromDom.level !== snapshot.level) snapshot = fromDom;
    initialized = true;
  }
  return snapshot;
}

/** 供测试与 SSR 使用：显式指定档位 */
export function setChildDensityForTest(themeKey: string): void {
  syncChildDensity(themeKey);
}
