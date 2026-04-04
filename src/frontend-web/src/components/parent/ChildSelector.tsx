import { useState } from 'react';
import { Baby, ChevronDown, Link2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { User } from '@/types';

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

  const handleLink = async () => {
    if (!linkPhone) return;
    setLinkError(null);
    setLinkSuccess(false);
    try {
      await onLinkChild(linkPhone);
      setLinkPhone('');
      setLinkSuccess(true);
      setTimeout(() => {
        setLinkSuccess(false);
        setShowPanel(false);
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '关联失败，请检查手机号';
      setLinkError(message);
    }
  };

  return (
    <div className="relative min-w-[250px] max-w-full rounded-2xl bg-surface-container-low/70 px-3 py-2.5">
      <button
        onClick={() => setShowPanel((prev) => !prev)}
        className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-surface-container/60"
        aria-expanded={showPanel}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tertiary-container">
          <Baby className="h-4.5 w-4.5 text-on-tertiary-container" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">当前孩子</p>
          <p className="truncate text-sm font-bold text-on-surface">
            {selectedChild ? `${selectedChild.name}${selectedChild.age ? ` · ${selectedChild.age}岁` : ''}` : '未选择'}
          </p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-on-surface-variant transition-transform', showPanel && 'rotate-180')} />
      </button>

      {showPanel && (
        <div className="panel-card absolute right-0 top-[calc(100%+0.5rem)] z-50 w-80 max-w-[90vw] p-4">
          {children.length > 0 ? (
            <div className="mb-3 space-y-1.5">
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => {
                    onSelectChild(child.id);
                    setShowPanel(false);
                  }}
                  className={cn(
                    'w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
                    child.id === selectedChildId
                      ? 'bg-primary-container text-on-primary-container'
                      : 'hover:bg-surface-container',
                  )}
                >
                  {child.name}
                  <span className="ml-2 text-xs opacity-75">{child.age ? `${child.age}岁` : '未设置年龄'}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-sm text-on-surface-variant">暂无已关联的孩子账号</p>
          )}

          <div className="border-t border-outline-variant/20 pt-3">
            <p className="mb-2 text-xs font-bold text-on-surface-variant">关联新的孩子账号</p>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="输入孩子手机号"
                value={linkPhone}
                onChange={(e) => {
                  setLinkPhone(e.target.value);
                  setLinkError(null);
                }}
                className="h-10 flex-1 rounded-lg border border-outline-variant/35 bg-surface-container-lowest px-3 text-sm focus:border-primary focus:outline-none"
                aria-label="孩子账号手机号"
              />
              <button
                onClick={handleLink}
                className="flex h-10 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-bold text-on-primary"
              >
                <Link2 className="h-4 w-4" />
                关联
              </button>
            </div>
            {linkError && <p className="mt-1.5 text-xs text-error">{linkError}</p>}
            {linkSuccess && <p className="mt-1.5 text-xs text-success">关联成功</p>}
          </div>
        </div>
      )}
    </div>
  );
}
