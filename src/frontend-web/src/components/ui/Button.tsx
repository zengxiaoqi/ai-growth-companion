import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:brightness-95 active:translate-y-0.5',
  secondary: 'bg-secondary-container text-on-secondary-container hover:brightness-95 active:translate-y-0.5',
  ghost: 'bg-transparent text-on-surface hover:bg-surface-container active:bg-surface-container-high',
  danger: 'bg-error text-white hover:brightness-95 active:translate-y-0.5',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  icon: 'h-11 w-11 p-0',
};

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex touch-target items-center justify-center gap-2 rounded-xl font-bold transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:translate-y-0',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({ className, size = 'icon', ...props }: ButtonProps) {
  return <Button size={size} variant="ghost" className={cn('rounded-full', className)} {...props} />;
}
