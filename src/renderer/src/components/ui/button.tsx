import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@renderer/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-control text-[12px] font-medium transition-[background-color,color,box-shadow,opacity,transform] duration-170 ease-desktop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.96]',
  {
    variants: {
      variant: {
        default: 'bg-accent text-[var(--text-inverse)] shadow-sm hover:bg-[var(--accent-hover)]',
        muted: 'bg-muted text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--line-soft)] hover:bg-[var(--bg-tertiary)] hover:text-foreground',
        ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-muted hover:text-foreground',
        sidebar: 'bg-[var(--sidebar-control)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-control-hover)] hover:text-foreground'
      },
      size: {
        default: 'h-[34px] px-3 py-1.5',
        sm: 'h-[30px] rounded-[8px] px-2.5 text-[11px]',
        icon: 'h-[34px] w-[34px] rounded-[8px] p-0',
        compactIcon: 'h-[30px] w-[30px] rounded-[8px] p-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
