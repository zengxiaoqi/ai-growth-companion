import { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw, Sparkles } from '@/icons';
import { cn } from '../../lib/utils';
import api, { type CasualToolsConfig } from '../../services/api';
import { Card } from '../ui';

function Switch({
  checked,
  onToggle,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'touch-target relative h-7 w-12 shrink-0 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-outline-variant/35',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-tactile',
          checked ? 'left-6' : 'left-1',
        )}
      />
    </button>
  );
}

export default function CasualToolsCard({ childId }: { childId: number }) {
  const [config, setConfig] = useState<CasualToolsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    api
      .getCasualTools(childId)
      .then((next) => {
        if (active) setConfig(next);
      })
      .catch((err: any) => {
        if (active) setError(err?.message || '加载失败，请稍后重试。');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [childId]);

  const persist = useCallback(
    async (tools: string[] | null) => {
      if (!config) return;
      const previous = config;
      setConfig({ ...config, override: tools, effective: tools ?? config.default });
      setIsSaving(true);
      setError(null);
      try {
        await api.setCasualTools(childId, tools);
      } catch (err: any) {
        setConfig(previous);
        setError(err?.message || '保存失败，请重试。');
      } finally {
        setIsSaving(false);
      }
    },
    [config, childId],
  );

  const inherit = config?.override === null;

  const handleInheritToggle = useCallback(() => {
    if (!config) return;
    persist(inherit ? [...config.effective] : null);
  }, [config, inherit, persist]);

  const handleToolToggle = useCallback(
    (name: string) => {
      if (!config || inherit) return;
      const next = new Set(config.effective);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      persist(Array.from(next));
    },
    [config, inherit, persist],
  );

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-container/30">
          <Sparkles className="h-6 w-6 text-on-secondary-container" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-medium text-on-surface">碎碎念可用技能</h3>
          <p className="text-sm text-on-surface-variant">
            孩子闲聊时可使用的工具，关闭后该技能不会被调用
          </p>
        </div>
        {isSaving ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-on-surface-variant" /> : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : config ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/15 bg-surface px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface">跟随系统默认</p>
              <p className="text-xs text-on-surface-variant">
                {inherit ? '当前使用默认技能组合' : '已自定义，开启后恢复默认'}
              </p>
            </div>
            <Switch
              checked={inherit}
              onToggle={handleInheritToggle}
              ariaLabel="跟随系统默认技能"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            {config.available.map((tool) => {
              const enabled = config.effective.includes(tool.name);
              return (
                <div
                  key={tool.name}
                  className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/15 bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-on-surface">{tool.label}</p>
                    <p className="text-xs text-on-surface-variant">{tool.description}</p>
                  </div>
                  <Switch
                    checked={enabled}
                    onToggle={() => handleToolToggle(tool.name)}
                    ariaLabel={`${tool.label} ${enabled ? '已启用' : '已禁用'}`}
                    disabled={inherit || isSaving}
                  />
                </div>
              );
            })}
          </div>

          {!inherit ? (
            <button
              type="button"
              onClick={() => persist(null)}
              disabled={isSaving}
              className="touch-target inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container-highest disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              恢复系统默认
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm font-semibold text-error">{error}</p> : null}
    </Card>
  );
}