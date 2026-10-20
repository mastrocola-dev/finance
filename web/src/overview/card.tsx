import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'

type Props = { id: string; title: ReactNode; aside?: ReactNode; className?: string; children: ReactNode }

export const Card = ({ id, title, aside, className, children }: Props) => (
  <section aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-3 rounded-card border bg-surface px-[18px] py-4 md:px-6 md:py-5', className)}>
    <div className="flex items-baseline gap-4">
      <h2 id={id} className="m-0 text-section font-semibold">
        {title}
      </h2>
      {aside && <div className="ml-auto text-meta text-muted">{aside}</div>}
    </div>
    {children}
  </section>
)
