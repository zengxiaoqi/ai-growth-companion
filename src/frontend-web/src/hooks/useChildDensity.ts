import { useSyncExternalStore } from 'react';
import {
  getChildDensitySnapshot,
  subscribeChildDensity,
} from '../lib/child-density-store';
import { CHILD_DENSITY, type ChildDensity } from '../lib/child-theme';

/**
 * 读取当前孩子端年龄密度档。
 *
 * 皮肤由 `applyAppUISettings` 写到 html[data-child-theme]，store 随之更新；
 * 用 useSyncExternalStore 而非 useState + MutationObserver，是为了避免
 * 并发渲染下 DOM 与 React 状态撕裂。服务端与测试环境回落到中档。
 */
export function useChildDensity(): ChildDensity {
  return useSyncExternalStore(
    subscribeChildDensity,
    getChildDensitySnapshot,
    () => CHILD_DENSITY[1],
  );
}
