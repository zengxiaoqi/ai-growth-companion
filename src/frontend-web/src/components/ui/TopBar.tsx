import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconButton } from './Button';

interface TopBarAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface TopBarProps {
  title: string;
  subtitle?: string;
  leftSlot?: ReactNode;
  actions?: TopBarAction[];
  className?: string;
}

export function TopBar({ title, subtitle, leftSlot, actions = [], className }: TopBarProps) {
  return (
    <header className={cn('sticky top-0 z-40 px-3 pt-safe md:px-6', className)}>
      <div className="panel-card-strong mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {leftSlot}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">{title}</h1>
            {subtitle ? <p className="text-xs font-semibold text-on-surface-variant">{subtitle}</p> : null}
          </div>
        </div>
        {actions.length > 0 ? (
          <div className="flex items-center gap-1.5 md:gap-2">
            {actions.map((action) => (
              <IconButton
                key={action.key}
                aria-label={action.label}
                onClick={action.onClick}
                className={cn(action.danger ? 'text-error hover:bg-error-container/20' : 'text-on-surface-variant hover:bg-surface-container')}
              >
                {action.icon}
              </IconButton>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
