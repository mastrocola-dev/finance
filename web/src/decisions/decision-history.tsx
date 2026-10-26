import { formatBrl } from '../lib/format.ts'
import { recordProps } from '../lib/record.tsx'
import { cn } from '../lib/utils.ts'
import { chip } from './decision-card.tsx'
import { closedDay, type Decision, statusLabels } from './model.ts'

const tones: Record<Decision['status'], string> = { proposed: 'bg-pending-soft text-pending', confirmed: 'bg-ok-soft text-ok', rejected: 'bg-late-soft text-late', withdrawn: 'bg-pending-soft text-pending' }

export const DecisionHistory = ({ decisions, hash }: { decisions: Decision[]; hash: string }) => (
  <ul className="m-0 flex list-none flex-col p-0">
    {decisions.map((decision) => (
      <li key={decision.id} {...recordProps(`decision-${decision.id}`, hash)} className={cn('flex items-center gap-2.5 border-b py-2.5', 'aria-[current=true]:bg-accent-soft')}>
        <span className={cn(chip, tones[decision.status])}>{statusLabels[decision.status]}</span>
        <span className="min-w-0 flex-1 text-meta">{decision.title}</span>
        {decision.amount && <span className="amount hidden text-meta text-muted sm:inline">{formatBrl(decision.amount.cents)}</span>}
        <span className="text-xs text-muted">{closedDay(decision)}</span>
      </li>
    ))}
  </ul>
)
