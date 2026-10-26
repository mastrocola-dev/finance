import { formatBrl } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import type { Overview } from './model.ts'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export const KpiCards = ({ data }: { data: Overview }) => {
  const kpis = [
    { label: 'Saldo previsto', value: data.balance, sub: 'Receitas menos despesas do mês' },
    { label: 'Recebido', value: data.income.received, sub: `${data.income.receivedCount} de ${plural(data.income.count, 'receita', 'receitas')}`, tone: 'text-income' },
    { label: 'Pago', value: data.expenses.paid, sub: `${data.expenses.paidCount} de ${plural(data.expenses.count, 'conta', 'contas')}` },
    { label: 'Em aberto', value: data.open, sub: data.expenses.late > 0n ? `${formatBrl(data.expenses.late)} em atraso` : 'Nada em atraso', late: data.expenses.late > 0n },
  ]
  return (
    <section aria-label="Indicadores" className="hidden grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4 md:grid">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="flex flex-col gap-2 rounded-card border bg-surface px-5 py-[18px]">
          <span className="text-meta text-muted">{kpi.label}</span>
          <span className={cn('amount text-kpi font-medium tracking-[-0.02em]', kpi.tone)}>{formatBrl(kpi.value)}</span>
          <span className={cn('text-xs text-muted', kpi.late && 'text-late')}>{kpi.sub}</span>
        </div>
      ))}
    </section>
  )
}
