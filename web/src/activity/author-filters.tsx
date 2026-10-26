import { cn } from '../lib/utils.ts'
import type { AuditFilter } from './model.ts'

type Props = { filters: AuditFilter[]; chosen: string; onChoose: (filter: AuditFilter) => void }

export const AuthorFilters = ({ filters, chosen, onChoose }: Props) => (
  <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
    <legend className="sr-only">Autor</legend>
    {filters.map((filter) => (
      <button key={filter.key} type="button" aria-pressed={filter.key === chosen} onClick={() => onChoose(filter)} className={cn('min-h-11 rounded-full border bg-surface px-3.5 text-meta text-text md:min-h-9', filter.key === chosen && 'border-accent bg-accent-soft text-accent')}>
        {filter.label} <span className="ml-1 text-muted tabular-nums">{filter.count}</span>
      </button>
    ))}
  </fieldset>
)
