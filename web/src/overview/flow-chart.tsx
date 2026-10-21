import { Bar, BarChart, ResponsiveContainer } from 'recharts'
import { formatMonthShort, formatNetShort } from '../lib/format.ts'
import { firstDay } from '../lib/search.ts'
import { cn } from '../lib/utils.ts'
import { Card } from './card.tsx'
import { type FlowMonth, flowSummary } from './model.ts'

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
  const data = months.map(({ month, income, expenses }) => ({ month, income: Number(income), expenses: Number(expenses) }))
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
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barGap={4} barSize={18} accessibilityLayer={false}>
              <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="expenses" fill="var(--color-expense)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
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
