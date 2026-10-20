import type { ComponentProps } from 'react'
import { cn } from '../lib/utils.ts'

export const Skeleton = ({ className, ...props }: ComponentProps<'div'>) => <div aria-hidden="true" className={cn('rounded-control bg-sunken motion-safe:animate-pulse', className)} {...props} />
