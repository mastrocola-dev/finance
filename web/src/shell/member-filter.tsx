import { useNavigate } from '@tanstack/react-router'
import type { AppSearch } from '../lib/search.ts'
import { cn } from '../lib/utils.ts'
import { useMembers, useSelectedMember } from '../query/shell.ts'

const option = 'flex min-h-11 flex-1 items-center justify-center rounded-[7px] px-3.5 text-muted md:min-h-[34px] md:flex-none'

export const MemberFilter = () => {
  const navigate = useNavigate()
  const { data: members = [] } = useMembers()
  const selected = useSelectedMember()
  const options = [{ label: 'Casa', value: undefined }, ...members.map(({ name }) => ({ label: name, value: name }))]

  return (
    <fieldset className="m-0 flex w-full min-w-0 rounded-field border bg-sunken p-[3px] md:w-auto">
      <legend className="sr-only">Ver por membro</legend>
      {options.map(({ label, value }) => (
        <button key={label} type="button" aria-pressed={selected === value} onClick={() => navigate({ to: '.', search: (previous: AppSearch) => ({ ...previous, member: value }) })} className={cn(option, selected === value && 'bg-surface font-medium text-text')}>
          {label}
        </button>
      ))}
    </fieldset>
  )
}
