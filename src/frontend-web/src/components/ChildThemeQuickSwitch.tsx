import { useState } from 'react';
import { Palette, Star } from '@/icons';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import {
  applyAppUISettings,
  mergeUserSettingsWithUI,
  readStoredAppUISettings,
  saveStoredAppUISettings,
  type AppUISettings,
} from '../lib/app-settings';
import {
  CHILD_THEMES,
  CHILD_THEME_KEYS,
  type ChildThemeKey,
} from '../lib/child-theme';

const THEME_EMOJI: Record<ChildThemeKey, string> = {
  honey: '📖',
  candy: '🍭',
  forest: '🌿',
  space: '🚀',
};

function readActiveTheme(): ChildThemeKey {
  if (typeof document === 'undefined') return 'honey';
  const value = document.documentElement.dataset.childTheme;
  return CHILD_THEME_KEYS.includes(value as ChildThemeKey)
    ? (value as ChildThemeKey)
    : 'honey';
}

/**
 * 孩子端首页的快捷换肤入口。
 * 与设置页共用同一份 AppUISettings：先写本机并立即生效，再尽力同步到账号，
 * 同步失败也不影响本机使用（刷新后仍会从 localStorage 恢复）。
 */
export default function ChildThemeQuickSwitch() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ChildThemeKey>(readActiveTheme);

  const choose = (key: ChildThemeKey) => {
    const next: AppUISettings = { ...readStoredAppUISettings(), childTheme: key };

    saveStoredAppUISettings(next);
    applyAppUISettings(next, { user, isStudentArea: true });
    setActive(key);
    setOpen(false);

    if (user?.id) {
      const merged = mergeUserSettingsWithUI(
        user.settings as Record<string, unknown> | undefined,
        next,
      );
      api
        .updateUser(user.id, { settings: merged })
        .then((updated) => {
          localStorage.setItem('auth_user', JSON.stringify(updated));
          window.dispatchEvent(
            new CustomEvent('user-settings-updated', { detail: updated }),
          );
        })
        .catch(() => {
          // 本机偏好已经生效，跨设备同步失败不影响使用
        });
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="换皮肤"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="touch-target flex items-center gap-1.5 rounded-xl bg-tertiary-container/70 px-2.5 py-2 text-sm font-bold text-on-tertiary-container transition-tactile hover:brightness-95"
      >
        <Palette className="h-5 w-5" />
        <span className="hidden sm:inline">换皮肤</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="关闭换皮肤"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="选择孩子端主题"
            className="absolute right-0 top-full z-50 mt-2 w-[19rem] rounded-2xl border border-outline-variant/20 bg-surface p-3 shadow-xl"
          >
            <p className="mb-1 text-sm font-bold text-on-surface">给小犀换一身衣服吧！</p>
            <p className="mb-3 text-xs text-on-surface-variant">
              点一下就立刻变，随时可以换回来～
            </p>

            <div className="grid grid-cols-2 gap-2">
              {CHILD_THEME_KEYS.map((key) => {
                const meta = CHILD_THEMES[key];
                const selected = active === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => choose(key)}
                    className={cn(
                      'touch-target relative flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition-tactile',
                      selected
                        ? 'border-primary bg-primary-container/25'
                        : 'border-outline-variant/20 bg-surface-container-low hover:bg-surface-container',
                    )}
                  >
                    <span className="flex gap-1">
                      {meta.swatches.slice(0, 3).map((color) => (
                        <span
                          key={color}
                          className="h-4 w-4 rounded-full border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="text-xs font-bold text-on-surface">
                      {THEME_EMOJI[key]} {meta.name}
                    </span>
                    <span className="text-[10px] text-on-surface-variant">{meta.age}</span>
                    {selected ? (
                      <Star className="absolute right-2 top-2 h-3.5 w-3.5 fill-current text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-on-surface-variant">
              设置页里还可以选「跟随年龄」，让皮肤随账号年龄自动切换。
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
