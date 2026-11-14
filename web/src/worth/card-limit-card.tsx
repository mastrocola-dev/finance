import { Link } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { Skeleton } from '../components/skeleton.tsx'
import { cn } from '../lib/utils.ts'
import type { CardView } from './card-model.ts'

const ReleaseBars = lazy(() => import('./release-bars.tsx').then(({ ReleaseBars }) => ({ default: ReleaseBars })))

export const CardLimitCard = ({ card }: { card: CardView }) => (
  <article aria-labelledby={`card-${card.id}`} className="flex flex-col gap-2.5 rounded-card border bg-surface px-4 py-3.5 md:px-6 md:py-5">
    <div className="flex flex-wrap items-baseline gap-x-2">
      <h3 id={`card-${card.id}`} className="m-0 text-body font-semibold">
        {card.name}
      </h3>
      <span className="text-meta text-muted">{card.meta}</span>
    </div>
    {card.limit ? (
      <>
        <div role="img" aria-label={card.limit.label} className="h-2.5 overflow-hidden rounded-full bg-sunken">
          <div className={cn('h-full rounded-full', card.limit.over ? 'bg-late' : 'bg-expense')} style={{ width: `${card.limit.percent}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-2 text-meta">
          <span>
            Parcelado: <span className="amount">{card.committed}</span>
          </span>
          <span className={cn('ml-auto', card.limit.over ? 'font-medium text-late' : 'text-muted')}>
            Disponível <span className="amount">{card.limit.available}</span>
            {card.limit.over && ' · acima do limite'}
          </span>
        </div>
      </>
    ) : (
      <div className="flex flex-wrap gap-x-2 text-meta">
        <span>
          Parcelado: <span className="amount">{card.committed}</span>
        </span>
        <Link to="/cadastros" className="ml-auto text-accent">
          Informar o limite em Cadastros
        </Link>
      </div>
    )}
    {card.release && (
      <div className="flex flex-col gap-1.5">
        <span className="text-meta text-muted">{card.release}</span>
        <div role="img" aria-label={card.chartLabel} className="h-20">
          <Suspense fallback={<Skeleton aria-busy="true" className="h-full" />}>
            <ReleaseBars bars={card.bars} />
          </Suspense>
        </div>
      </div>
    )}
  </article>
)
