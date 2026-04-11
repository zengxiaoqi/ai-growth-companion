import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BottomNavItem {
  key: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
  accent?: boolean;
}

interface BottomNavProps {
  items: BottomNavItem[];
  className?: string;
}

export function BottomNav({ items, className }: BottomNavProps) {
  return (
    <nav className={cn('fixed bottom-safe left-0 right-0 z-50 px-4 pb-safe', className)}>
      <div className="floating-nav mx-auto flex max-w-6xl items-center justify-around rounded-full px-2 py-1.5">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={item.onClick}
            className={cn(
              'touch-target flex min-w-[72px] flex-col items-center rounded-full px-4 py-2 transition-all',
              item.accent ? 'bg-tertiary-container text-on-tertiary-container shadow-inner' : item.active ? 'bg-primary-container/35 text-primary' : 'text-on-surface-variant hover:text-on-surface',
            )}
            aria-label={item.label}
          >
            {item.icon}
            <span className="mt-0.5 text-[10px] font-bold">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
