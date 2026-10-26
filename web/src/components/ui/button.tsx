import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils.ts'

export const buttonVariants = cva('inline-flex min-h-11 items-center justify-center gap-2 rounded-field px-4 font-semibold disabled:opacity-50 md:min-h-10', {
  variants: {
    variant: {
      primary: 'bg-accent text-accent-text',
      outline: 'border bg-surface text-text',
      ghost: 'text-text hover:bg-sunken',
    },
    size: {
      default: '',
      icon: 'size-11 px-0 md:size-9',
    },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
})

export const Button = ({ className, variant, size, type = 'button', ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) => <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
