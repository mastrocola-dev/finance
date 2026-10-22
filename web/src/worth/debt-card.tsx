import { recordProps } from '../lib/record.tsx'
import { cn } from '../lib/utils.ts'
import type { DebtView, Tick } from './model.ts'

const tickColor: Record<Tick['state'], string> = { paid: 'bg-expense', next: 'bg-expense/40', open: 'bg-sunken' }

export const DebtCard = ({ debt, hash }: { debt: DebtView; hash: string }) => (
  <article {...recordProps(`debt-${debt.id}`, hash)} className={cn('flex flex-col gap-2.5 rounded-card border bg-surface px-4 py-3.5 md:px-6 md:py-5', 'aria-[current=true]:border-accent aria-[current=true]:bg-accent-soft')}>
    <div className="flex items-baseline gap-2">
      <h3 className="m-0 text-body font-semibold">{debt.name}</h3>
      <span className="amount ml-auto">{debt.balance}</span>
    </div>
    {debt.ticks.length > 0 && (
      <div role="img" aria-label={debt.label} className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${debt.columns}, minmax(0, 1fr))` }}>
        {debt.ticks.map((tick) => (
          <span key={tick.number} className={cn('h-2.5 rounded-[2px]', tickColor[tick.state])} />
        ))}
      </div>
    )}
    <div className="flex flex-wrap gap-2 text-meta text-muted">
      <span>{debt.progress}</span>
      <span className="ml-auto">{debt.meta}</span>
    </div>
  </article>
)
