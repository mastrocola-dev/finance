import { formatBrl } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import { Card } from './card.tsx'
import { type VariablePlan, variableLines, variableTotals } from './variable-model.ts'

const percent = (value: number) => `${Math.round(value)}%`

export const VariableSpend = ({ plan }: { plan: VariablePlan }) => {
  const lines = variableLines(plan)
  const totals = variableTotals(plan)
  return (
    <Card id="variable-title" title="Variáveis do mês" aside={totals.unspent > 0n ? `${formatBrl(totals.unspent)} ainda previstos` : undefined}>
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {lines.map((line) => (
          <li key={line.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate">
                {line.name}
                {line.member && <span className="text-muted"> · {line.member}</span>}
              </span>
              <span className="amount text-right text-meta">
                {formatBrl(line.spent)} <span className="text-muted">de {formatBrl(line.estimate)}</span>
              </span>
            </div>
            <div role="img" aria-label={`${line.name}: ${percent(line.percent)} do previsto`} className="h-1.5 overflow-hidden rounded-full bg-sunken md:h-2">
              <div className={cn('h-full rounded-full', line.over ? 'bg-late' : 'bg-expense')} style={{ width: `${Math.min(line.percent, 100)}%` }} />
            </div>
            {line.over && <span className="text-xs text-late">acima do previsto em {formatBrl(line.spent - line.estimate)}</span>}
          </li>
        ))}
      </ul>
      <div className="flex items-baseline gap-3 border-t pt-3">
        <span className="flex-1 text-meta text-muted">Total do mês</span>
        <span className="amount text-meta">
          {formatBrl(totals.spent)} <span className="text-muted">de {formatBrl(totals.estimate)}</span>
        </span>
      </div>
    </Card>
  )
}
