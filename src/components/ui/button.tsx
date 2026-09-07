import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600', { variants: { variant: { default: 'bg-teal-700 text-white hover:bg-teal-800', outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50', ghost: 'text-slate-600 hover:bg-slate-100' }, size: { default: 'h-10 px-4', sm: 'h-8 px-3', icon: 'h-9 w-9' } }, defaultVariants: { variant: 'default', size: 'default' } });
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) { const Comp = asChild ? Slot.Root : 'button'; return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />; }
