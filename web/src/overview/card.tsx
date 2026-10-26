import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'

type Props = { id: string; title: ReactNode; note?: ReactNode; aside?: ReactNode; className?: string; children: ReactNode }

export const Card = ({ id, title, note, aside, className, children }: Props) => (
  <section aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-3 rounded-card border bg-surface px-[18px] py-4 md:px-6 md:py-5', className)}>
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h2 id={id} className="m-0 text-section font-semibold">
        {title}
      </h2>
      {note && <span className="text-meta text-muted">{note}</span>}
      {aside && <div className="ml-auto text-meta text-muted">{aside}</div>}
    </div>
    {children}
  </section>
)
