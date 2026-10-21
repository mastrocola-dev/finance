import { formatDay } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import type { Entry } from '../overview/model.ts'
import { OriginChip, StateChip } from './chips.tsx'
import { installmentOf, signedAmount } from './model.ts'

const meta = (entry: Entry) => [formatDay(entry.dueOn), entry.category, entry.member ?? 'Conjunto', installmentOf(entry)].filter(Boolean).join(' · ')

export const EntriesList = ({ entries, fresh }: { entries: Entry[]; fresh: string | undefined }) => (
  <ul className="m-0 flex list-none flex-col p-0 md:hidden">
    {entries.map((entry) => (
      <li key={entry.id} className={cn('flex items-center gap-3 border-b px-3.5 py-3', entry.id === fresh && 'bg-accent-soft')}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium">{entry.description}</span>
          <span className="truncate text-xs text-muted">{meta(entry)}</span>
          <span className="flex gap-1.5">
            <OriginChip entry={entry} />
            <StateChip entry={entry} />
          </span>
        </div>
        <span className={cn('amount whitespace-nowrap', entry.direction === 'income' && 'text-income')}>{signedAmount(entry)}</span>
      </li>
    ))}
  </ul>
)
