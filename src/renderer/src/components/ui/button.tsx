import type { ComponentProps } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-control px-3 font-mono text-[10px] font-semibold tracking-[.08em] whitespace-nowrap uppercase transition-[filter,transform,background-color] duration-180 ease-quiet hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary shadow-[0_0_0_1px_rgba(235,165,28,.4),0_8px_24px_-8px_rgba(235,165,28,.55)] hover:brightness-108',
        secondary: 'border border-border-strong bg-transparent text-on-surface hover:bg-surface-hover',
        ghost: 'text-on-surface-muted hover:bg-surface-raised hover:text-on-surface'
      }
    },
    defaultVariants: { variant: 'primary' }
  }
)

export function Button({ className, variant, asChild = false, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, className }))} {...props} />
}
