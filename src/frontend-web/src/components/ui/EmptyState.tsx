import type { ReactNode } from 'react';
import { Card } from './Card';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <Card className="p-8 text-center">
      {icon ? <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container">{icon}</div> : null}
      <h3 className="text-base font-black text-on-surface">{title}</h3>
      {description ? <p className="mt-1 text-sm text-on-surface-variant">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button className="mt-4" onClick={onAction}>{actionLabel}</Button>
      ) : null}
    </Card>
  );
}
