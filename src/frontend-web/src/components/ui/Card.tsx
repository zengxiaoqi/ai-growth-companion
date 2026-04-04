import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel-card', className)} {...props} />;
}

export function CardStrong({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel-card-strong', className)} {...props} />;
}
