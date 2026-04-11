import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-shimmer rounded-2xl', className)} {...props} aria-hidden="true" />;
}
