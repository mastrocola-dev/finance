import { formatBrl } from '../lib/format.ts'
import { type Overview, percentOf } from './model.ts'

const percent = (value: number) => `${Math.round(value)}%`

export const BalanceHero = ({ data }: { data: Overview }) => {
  const paid = percentOf(data.expenses.paid, data.income.total)
  const pending = percentOf(data.expenses.pending, data.income.total)
  const late = percentOf(data.expenses.late, data.income.total)
  const stats = [
    { label: 'Recebido', value: data.income.received, tone: 'text-income' },
    { label: 'Pago', value: data.expenses.paid, tone: 'text-text' },
    { label: 'Em aberto', value: data.open, tone: data.expenses.late > 0n ? 'text-late' : 'text-text' },
  ]
  return (
    <div className="flex flex-col gap-2 md:hidden">
      <section aria-label="Saldo previsto" className="flex flex-col gap-1.5 rounded-hero border bg-surface p-[18px]">
        <span className="text-meta text-muted">Saldo previsto</span>
        <span className="amount text-kpi-hero font-medium tracking-[-0.02em]">{formatBrl(data.balance)}</span>
        <div role="img" aria-label={`Despesas são ${percent(paid + pending + late)} das receitas: ${percent(paid)} pagas, ${percent(pending)} pendentes, ${percent(late)} atrasadas`} className="mt-2 flex h-2 overflow-hidden rounded-full bg-sunken">
          <div className="bg-expense" style={{ width: `${Math.min(paid, 100)}%` }} />
          <div className="bg-pending" style={{ width: `${Math.min(pending, 100)}%` }} />
          <div className="bg-late" style={{ width: `${Math.min(late, 100)}%` }} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          <span>Pago {percent(paid)}</span>
          <span>Pendente {percent(pending)}</span>
          <span className="text-late">Atrasado {percent(late)}</span>
          <span className="ml-auto">das receitas</span>
        </div>
      </section>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-col gap-1 rounded-[12px] border bg-surface px-2.5 py-3">
            <span className="text-xs text-muted">{stat.label}</span>
            <span className={`amount truncate text-xs ${stat.tone}`}>{formatBrl(stat.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
