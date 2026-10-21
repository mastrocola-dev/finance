import { lazy, Suspense } from 'react'
import { Skeleton } from '../components/skeleton.tsx'
import { formatMonthShort, formatNetShort } from '../lib/format.ts'
import { firstDay } from '../lib/search.ts'
import { cn } from '../lib/utils.ts'
import { Card } from './card.tsx'
import { type FlowMonth, flowSummary } from './model.ts'

const FlowBars = lazy(() => import('./flow-bars.tsx').then(({ FlowBars }) => ({ default: FlowBars })))

const Legend = () => (
  <span className="flex gap-3.5">
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-income" />
      Receitas
    </span>
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-expense" />
      Despesas
    </span>
  </span>
)

export const FlowChart = ({ months }: { months: FlowMonth[] }) => {
  const current = months.at(-1)?.month
  const columns = { gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }
  return (
    <Card id="flow-title" title="Receitas × despesas" note={`últimos ${months.length} meses`} aside={<Legend />} className="flex-1 gap-4">
      <div role="img" aria-label={flowSummary(months)} className="flex flex-col gap-2 border-b pb-2">
        <div className="grid text-center text-[11px] text-muted tabular-nums" style={columns}>
          {months.map(({ month, net }) => (
            <span key={month}>{formatNetShort(net)}</span>
          ))}
        </div>
        <div className="h-40">
          <Suspense fallback={<Skeleton aria-busy="true" className="h-full" />}>
            <FlowBars months={months} />
          </Suspense>
        </div>
      </div>
      <div className="grid text-center text-xs text-muted" style={columns}>
        {months.map(({ month }) => (
          <span key={month} className={cn(month === current && 'font-semibold text-text')}>
            {formatMonthShort(firstDay(month))}
          </span>
        ))}
      </div>
    </Card>
  )
}
