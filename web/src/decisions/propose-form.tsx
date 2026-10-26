import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../components/ui/button.tsx'
import { cn } from '../lib/utils.ts'
import { type Proposal, proposal, toNewDecision } from './model.ts'
import type { NewDecision } from './queries.ts'

const field = 'min-h-11 w-full rounded-control border bg-bg px-3 text-body text-text focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent-soft aria-invalid:border-late md:min-h-10'
const errorsId = 'propose-errors'

const Field = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <label htmlFor={id} className="text-xs text-muted">
      {label}
    </label>
    {children}
  </div>
)

type Props = { member: string | undefined; pending: boolean; onSubmit: (decision: NewDecision, reset: () => void) => void }

export const ProposeForm = ({ member, pending, onSubmit }: Props) => {
  const { register, handleSubmit, reset, formState } = useForm<Proposal>({ resolver: zodResolver(proposal), defaultValues: { title: '', amount: '', description: '' } })
  const errors = Object.values(formState.errors).map((error) => error?.message)
  const invalid = (name: keyof Proposal) => ({ 'aria-invalid': formState.errors[name] ? true : undefined, 'aria-describedby': formState.errors[name] ? errorsId : undefined })
  return (
    <form aria-labelledby="propose-title" noValidate onSubmit={handleSubmit((values) => onSubmit(toNewDecision(values), () => reset()))} className="flex flex-col gap-3 rounded-card border bg-surface p-4 md:p-5">
      <h2 id="propose-title" className="m-0 text-section font-semibold">
        Propor decisão
      </h2>
      <Field id="propose-title-input" label="O que decidir">
        <input className={field} autoComplete="off" id="propose-title-input" {...register('title')} {...invalid('title')} />
      </Field>
      <Field id="propose-amount" label="Valor (opcional)">
        <input className={cn(field, 'amount')} inputMode="decimal" autoComplete="off" placeholder="R$ 0,00" id="propose-amount" {...register('amount')} {...invalid('amount')} />
      </Field>
      <Field id="propose-description" label="Detalhes (opcional)">
        <textarea className={cn(field, 'min-h-20 py-2')} rows={3} id="propose-description" {...register('description')} />
      </Field>
      {errors.length > 0 && (
        <p id={errorsId} role="alert" className="m-0 text-meta text-late">
          {errors.join(' ')}
        </p>
      )}
      <Button type="submit" disabled={pending || !member}>
        Propor
      </Button>
      {!member && <p className="m-0 text-meta text-muted">Escolha quem você é para propor.</p>}
    </form>
  )
}
