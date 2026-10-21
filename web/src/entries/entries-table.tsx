import { formatDay } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import type { Entry } from '../overview/model.ts'
import { OriginChip, StateChip } from './chips.tsx'
import { installmentOf, signedAmount } from './model.ts'

const columns = ['Data', 'Descrição', 'Categoria', 'Conta', 'Quem', 'Origem', 'Situação']

const cell = 'border-b px-4 py-3'

export const EntriesTable = ({ entries, fresh }: { entries: Entry[]; fresh: string | undefined }) => (
  <table className="hidden w-full min-w-[860px] border-collapse md:table">
    <thead>
      <tr className="text-left text-xs text-muted">
        {columns.map((column) => (
          <th key={column} scope="col" className={cn(cell, 'font-medium')}>
            {column}
          </th>
        ))}
        <th scope="col" className={cn(cell, 'text-right font-medium')}>
          Valor
        </th>
      </tr>
    </thead>
    <tbody>
      {entries.map((entry) => (
        <tr key={entry.id} className={cn(entry.id === fresh && 'bg-accent-soft')}>
          <td className={cn(cell, 'whitespace-nowrap text-muted tabular-nums')}>{formatDay(entry.dueOn)}</td>
          <td className={cn(cell, 'font-medium')}>
            {entry.description}
            {installmentOf(entry) && <span className="ml-2 text-xs font-normal text-muted">{installmentOf(entry)}</span>}
          </td>
          <td className={cell}>{entry.category}</td>
          <td className={cn(cell, 'whitespace-nowrap text-muted')}>{entry.account ?? '—'}</td>
          <td className={cell}>{entry.member ?? 'Conjunto'}</td>
          <td className={cell}>
            <OriginChip entry={entry} />
          </td>
          <td className={cell}>
            <StateChip entry={entry} />
          </td>
          <td className={cn(cell, 'amount whitespace-nowrap text-right', entry.direction === 'income' && 'text-income')}>{signedAmount(entry)}</td>
        </tr>
      ))}
    </tbody>
  </table>
)
