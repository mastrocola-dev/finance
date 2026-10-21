import { Link } from '@tanstack/react-router'
import type { AppSearch } from '../lib/search.ts'
import { cn } from '../lib/utils.ts'
import { type AuditItem, describeAudit } from './describe.ts'
import { DiffTable } from './diff-table.tsx'
import { actionLabel, diffOf, entityLabel, onBehalfOf, targetOf, timeOf, whoLabel } from './model.ts'

const tones: Record<AuditItem['author'], string> = { claude: 'bg-claude-soft text-claude', member: 'bg-sunken text-text', import: 'bg-sunken text-muted', system: 'bg-sunken text-muted' }

const RecordLink = ({ item }: { item: AuditItem }) => {
  const target = targetOf(item)
  if (!target) return null
  const className = 'col-start-2 mt-2 justify-self-start text-meta text-accent md:col-start-3 md:row-start-1 md:mt-0 md:self-center'
  if (target.to === '/lancamentos')
    return (
      <Link to="/lancamentos" search={(previous: AppSearch) => ({ ...previous, ...(target.month && { month: target.month }) })} className={className}>
        Ver registro
      </Link>
    )
  return (
    <Link to={target.to} className={className}>
      Ver registro
    </Link>
  )
}

export const AuditEvent = ({ item }: { item: AuditItem }) => {
  const behalf = onBehalfOf(item)
  const diff = diffOf(item)
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 border-t px-4 py-4 first:border-t-0 md:grid-cols-[3.25rem_minmax(0,1fr)_auto] md:gap-x-4 md:px-5">
      <span className="pt-0.5 text-meta text-muted tabular-nums">{timeOf(item.at)}</span>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', tones[item.author])}>{whoLabel(item)}</span>
          {behalf && <span className="text-xs text-muted">a pedido de {behalf}</span>}
          <span className="text-xs text-muted">
            · {actionLabel(item)} · {entityLabel(item)}
          </span>
        </div>
        <span className="font-medium break-words">{describeAudit(item)}</span>
        {diff.length > 0 && <DiffTable rows={diff} />}
      </div>
      <RecordLink item={item} />
    </li>
  )
}
