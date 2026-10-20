import { useId } from 'react'
import { useIdentity } from '../identity/identity-provider.tsx'
import { cn } from '../lib/utils.ts'
import { useMembers } from '../query/shell.ts'

export const IdentityPicker = ({ compact = false }: { compact?: boolean }) => {
  const id = useId()
  const { member, choose } = useIdentity()
  const { data: members = [] } = useMembers()
  const current = members.find(({ name }) => name === member)

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-meta font-semibold', compact && 'hidden')}>
        {current?.name.charAt(0) ?? '?'}
      </span>
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id} className={cn('text-[12px] text-muted', compact && 'sr-only')}>
          Você é
        </label>
        <select id={id} value={current?.name ?? ''} onChange={(event) => choose(event.target.value || undefined)} className="min-h-11 min-w-0 rounded-control bg-transparent font-medium text-text md:min-h-8">
          <option value="">Escolher membro</option>
          {members.map(({ id: memberId, name }) => (
            <option key={memberId} value={name}>
              {name}
            </option>
          ))}
        </select>
        {current && !compact && <span className="text-[12px] text-muted">Divide {current.sharePercent}% · Casa</span>}
      </div>
    </div>
  )
}
