import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex h-11 items-center gap-1 rounded-full bg-surface-container p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'touch-target inline-flex h-9 min-w-[72px] items-center justify-center rounded-full px-3 text-xs font-bold text-on-surface-variant transition-colors data-[state=active]:bg-background data-[state=active]:text-on-surface data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-3 outline-none', className)} {...props} />;
}
