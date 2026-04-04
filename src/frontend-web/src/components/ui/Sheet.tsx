import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  side?: 'left' | 'right' | 'bottom';
  children: ReactNode;
}

export function Sheet({ open, onOpenChange, title, side = 'right', children }: SheetProps) {
  const positionClass = side === 'left'
    ? 'left-0 top-0 h-full w-[min(92vw,420px)]'
    : side === 'bottom'
      ? 'bottom-0 left-0 right-0 max-h-[85dvh] w-full rounded-t-3xl'
      : 'right-0 top-0 h-full w-[min(92vw,420px)]';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[180] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'fixed z-[190] bg-surface-container-lowest p-4 shadow-2xl outline-none',
            side !== 'bottom' && 'border-l border-outline-variant/20',
            positionClass,
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            {title ? <Dialog.Title className="text-base font-black text-on-surface">{title}</Dialog.Title> : <span />}
            <Dialog.Close className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container">
              <XMarkIcon className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
