import { Link } from '@tanstack/react-router'
import { formatBrl, formatDay } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import { Card } from './card.tsx'
import { type Entry, type Overview, percentOf } from './model.ts'

const meta = (entry: Entry) => [entry.state === 'late' ? `Venceu ${formatDay(entry.dueOn)}` : `Vence ${formatDay(entry.dueOn)}`, entry.member ?? 'Conjunto', entry.installmentNumber && `parcela ${entry.installmentNumber}`].filter(Boolean).join(' · ')

export const DueBills = ({ data, limit = 3 }: { data: Overview; limit?: number }) => {
  const { paidCount, count } = data.expenses
  const progress = Math.round(percentOf(BigInt(paidCount), BigInt(count)))
  return (
    <Card id="due-title" title="Para pagar" aside={`${paidCount} de ${count} pagas`} className="flex-[1_1_300px]">
      <div role="img" aria-label={`${progress}% das contas pagas`} className="h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className="h-full bg-ok" style={{ width: `${progress}%` }} />
      </div>
      {data.due.length === 0 ? (
        <p className="m-0 py-2 text-muted">Tudo pago neste mês.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {data.due.slice(0, limit).map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 border-b py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">{entry.description}</span>
                <span className={cn('text-xs text-muted', entry.state === 'late' && 'text-late')}>{meta(entry)}</span>
              </div>
              <div className="ml-auto flex flex-col items-end gap-1">
                <span className="amount">{formatBrl(entry.amount.cents)}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', entry.state === 'late' ? 'bg-late-soft text-late' : 'bg-pending-soft text-pending')}>{entry.state === 'late' ? 'Atrasada' : 'Pendente'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link to="/contas" className="mt-auto font-medium text-accent">
        Ver contas do mês →
      </Link>
    </Card>
  )
}
