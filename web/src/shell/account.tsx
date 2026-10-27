import { LogOut } from 'lucide-react'
import { Button } from '../components/ui/button.tsx'
import { useIdentity } from '../identity/identity-provider.tsx'
import { IdentityPicker } from './identity-picker.tsx'

export const Account = ({ compact = false }: { compact?: boolean }) => {
  const { member, signOut } = useIdentity()
  if (!signOut) return <IdentityPicker compact={compact} />
  if (compact)
    return (
      <Button variant="ghost" size="icon" aria-label="Sair" onClick={signOut}>
        <LogOut aria-hidden="true" className="size-5" />
      </Button>
    )

  return (
    <div className="flex w-full min-w-0 items-center gap-2.5">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-meta font-semibold">
        {member?.charAt(0) ?? '?'}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] text-muted">Você é</span>
        <span className="truncate font-medium">{member ?? '…'}</span>
      </div>
      <Button variant="ghost" size="icon" className="ml-auto" aria-label="Sair" onClick={signOut}>
        <LogOut aria-hidden="true" className="size-5" />
      </Button>
    </div>
  )
}
