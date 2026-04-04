import { useState } from 'react';
import { Baby, ChevronDown, Link2 } from '@/icons';
import { cn } from '../../lib/utils';
import type { User } from '@/types';
import { Button, Card } from '../ui';

interface ChildSelectorProps {
  children: User[];
  selectedChildId: number | null;
  onSelectChild: (id: number) => void;
  onLinkChild: (phone: string) => Promise<User>;
  selectedChild: User | undefined;
}

export default function ChildSelector({
  children,
  selectedChildId,
  onSelectChild,
  onLinkChild,
  selectedChild,
}: ChildSelectorProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [linkPhone, setLinkPhone] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  const handleLink = async () => {
    if (!linkPhone.trim()) return;

    setIsLinking(true);
    setLinkError(null);
    setLinkSuccess(false);

    try {
      await onLinkChild(linkPhone.trim());
      setLinkPhone('');
      setLinkSuccess(true);
      setTimeout(() => {
        setLinkSuccess(false);
        setShowPanel(false);
      }, 1200);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '关联失败，请检查手机号是否正确。';
      setLinkError(message);
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="relative min-w-[260px] max-w-full">
      <button
        type="button"
        onClick={() => setShowPanel((open) => !open)}
        className="panel-card flex w-full items-center gap-3 px-3 py-2 text-left"
        aria-expanded={showPanel}
        aria-label="选择孩子"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tertiary-container">
          <Baby className="h-4 w-4 text-on-tertiary-container" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">当前孩子</p>
          <p className="truncate text-sm font-bold text-on-surface">
            {selectedChild
              ? `${selectedChild.name}${selectedChild.age ? ` · ${selectedChild.age}岁` : ''}`
              : '未选择'}
          </p>
        </div>

        <ChevronDown className={cn('h-4 w-4 text-on-surface-variant transition-transform', showPanel && 'rotate-180')} />
      </button>

      {showPanel ? (
        <Card className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-80 max-w-[92vw] space-y-3 p-4">
          {children.length > 0 ? (
            <div className="space-y-1.5">
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => {
                    onSelectChild(child.id);
                    setShowPanel(false);
                  }}
                  className={cn(
                    'touch-target w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors',
                    child.id === selectedChildId
                      ? 'bg-primary-container text-on-primary-container'
                      : 'hover:bg-surface-container',
                  )}
                >
                  {child.name}
                  <span className="ml-2 text-xs opacity-80">{child.age ? `${child.age}岁` : '未设置年龄'}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">当前还没有已关联的孩子账号。</p>
          )}

          <div className="border-t border-outline-variant/20 pt-3">
            <p className="mb-2 text-xs font-bold text-on-surface-variant">关联新孩子账号</p>

            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="输入孩子手机号"
                value={linkPhone}
                onChange={(event) => {
                  setLinkPhone(event.target.value);
                  setLinkError(null);
                }}
                className="h-11 flex-1 rounded-xl border border-outline-variant/35 bg-surface px-3 text-sm outline-none transition focus:border-primary"
                aria-label="输入孩子手机号"
              />
              <Button size="sm" className="h-11" onClick={handleLink} disabled={isLinking || !linkPhone.trim()}>
                <Link2 className="h-4 w-4" />
                关联
              </Button>
            </div>

            {linkError ? <p className="mt-1.5 text-xs font-semibold text-error">{linkError}</p> : null}
            {linkSuccess ? <p className="mt-1.5 text-xs font-semibold text-success">关联成功</p> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
