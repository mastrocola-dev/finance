import { Check } from 'lucide-react'
import { formatBrl } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import type { Entry } from '../overview/model.ts'
import { billMeta } from './model.ts'

export const BillRow = ({ bill, onToggle }: { bill: Entry; onToggle: () => void }) => {
  const paid = bill.state === 'paid'
  const late = bill.state === 'late'
  return (
    <li>
      <button type="button" aria-pressed={paid} onClick={onToggle} className={cn('flex min-h-15 w-full items-center gap-3 rounded-field border bg-surface px-3.5 py-2.5 text-left text-text', late && 'border-late/40')}>
        <span aria-hidden="true" className={cn('flex size-6 flex-none items-center justify-center rounded-[7px] border-2 border-muted text-surface', paid && 'border-ok bg-ok', late && 'border-late')}>
          {paid && <Check size={14} strokeWidth={3} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn('truncate font-medium', paid && 'text-muted')}>{bill.description}</span>
          <span className={cn('text-xs text-muted', late && 'text-late')}>{billMeta(bill)}</span>
        </span>
        <span className={cn('amount', paid && 'text-muted')}>{formatBrl(bill.amount.cents)}</span>
      </button>
    </li>
  )
}
