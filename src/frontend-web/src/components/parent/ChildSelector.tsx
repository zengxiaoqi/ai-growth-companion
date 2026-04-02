import { useState } from 'react';
import { Baby, ChevronDown } from 'lucide-react';
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

  const handleChildClick = (child: User) => {
    if (child.id !== selectedChildId) {
      onSelectChild(child.id);
    }
    setShowPanel(false);
  };

  return (
    <div className="relative bg-surface-container-lowest rounded-2xl p-4 flex items-center gap-4 shadow-sm">
      <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center">
        <Baby className="w-5 h-5 text-on-tertiary-container" />
      </div>
      <div>
        <p className="text-xs font-bold text-outline uppercase tracking-wider">当前学生</p>
        {selectedChild ? (
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold">
              {selectedChild.name} ({selectedChild.age ? `${selectedChild.age}岁` : '未设置'})
            </span>
            <button
              onClick={() => setShowPanel(!showPanel)}
              className={cn(
                "p-0.5 hover:bg-surface-container-high rounded transition-colors",
                showPanel && "rotate-180"
              )}
              aria-label="切换学生"
            >
              <ChevronDown className="w-4 h-4 text-on-surface-variant" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowPanel(true)}
            className="text-sm font-bold text-primary hover:opacity-70 transition-opacity"
          >
            + 关联孩子账号
          </button>
        )}
      </div>
      {showPanel && (
        <div className="absolute top-full mt-2 right-0 bg-surface-container-lowest rounded-2xl p-4 shadow-xl border border-outline-variant/15 z-50 w-80">
          {children.length > 0 && (
            <div className="mb-3 space-y-1">
              {children.map(child => (
                <button
                  key={child.id}
                  onClick={() => handleChildClick(child)}
                  className={cn(
                    "w-full text-left px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                    child.id === selectedChildId ? "bg-primary-container text-on-primary-container" : "hover:bg-surface-container-high"
                  )}
                >
                  {child.name} ({child.age ? `${child.age}岁` : '未设置'})
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-outline-variant/15 pt-3">
            <p className="text-xs font-bold text-on-surface-variant mb-2">关联新的孩子账号</p>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="孩子账号手机号"
                value={linkPhone}
                onChange={(e) => { setLinkPhone(e.target.value); setLinkError(null); }}
                className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 text-sm focus:outline-none focus:border-primary"
                aria-label="孩子账号手机号"
              />
              <button
                onClick={handleLink}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold"
              >
                关联
              </button>
            </div>
            {linkError && <p className="text-xs text-error mt-1">{linkError}</p>}
            {linkSuccess && <p className="text-xs text-green-600 mt-1">关联成功！</p>}
          </div>
        </div>
      )}
    </div>
  );
}
