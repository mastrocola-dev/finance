import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../components/ui/button.tsx'
import { cn } from '../lib/utils.ts'
import { goalForm, type NewGoal, toNewGoal, type GoalForm as Values } from './goal.ts'

const field = 'min-h-11 w-full rounded-control border bg-bg px-3 text-body text-text focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent-soft aria-invalid:border-late md:min-h-10'
const errorsId = 'goal-errors'

const Field = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <label htmlFor={id} className="text-xs text-muted">
      {label}
    </label>
    {children}
  </div>
)

type Props = { thisMonth: string; reserves: string[]; member: string | undefined; pending: boolean; failure: string | undefined; onSubmit: (goal: NewGoal) => void; onCancel: () => void }

export const GoalForm = ({ thisMonth, reserves, member, pending, failure, onSubmit, onCancel }: Props) => {
  const { register, handleSubmit, setFocus, formState } = useForm<Values>({ resolver: zodResolver(goalForm(thisMonth)), defaultValues: { name: '', target: '', due: '', reserve: '' } })
  const errors = [...Object.values(formState.errors).map((error) => error?.message), failure].filter(Boolean)
  const invalid = (name: keyof Values) => ({ 'aria-invalid': formState.errors[name] ? true : undefined, 'aria-describedby': formState.errors[name] ? errorsId : undefined })
  useEffect(() => setFocus('name'), [setFocus])
  return (
    <form aria-labelledby="goal-title" noValidate onSubmit={handleSubmit((values) => onSubmit(toNewGoal(values)))} onKeyDown={(event) => event.key === 'Escape' && onCancel()} className="flex flex-col gap-3 rounded-card border bg-surface p-4 md:p-5">
      <h3 id="goal-title" className="m-0 text-section font-semibold">
        Nova meta
      </h3>
      <Field id="goal-name" label="Nome">
        <input className={field} autoComplete="off" placeholder="Viagem de férias" id="goal-name" {...register('name')} {...invalid('name')} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="goal-target" label="Alvo">
          <input className={cn(field, 'amount')} inputMode="decimal" autoComplete="off" placeholder="R$ 0,00" id="goal-target" {...register('target')} {...invalid('target')} />
        </Field>
        <Field id="goal-due" label="Prazo (mês)">
          <input className={field} type="month" min={thisMonth} id="goal-due" {...register('due')} {...invalid('due')} />
        </Field>
      </div>
      <Field id="goal-reserve" label="Reserva (opcional)">
        <select className={field} id="goal-reserve" {...register('reserve')}>
          <option value="">Nenhuma</option>
          {reserves.map((reserve) => (
            <option key={reserve} value={reserve}>
              {reserve}
            </option>
          ))}
        </select>
      </Field>
      {errors.length > 0 && (
        <p id={errorsId} role="alert" className="m-0 text-meta text-late">
          {errors.join(' ')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !member} className="flex-1">
          Criar meta
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      {!member && <p className="m-0 text-meta text-muted">Escolha quem você é para criar uma meta.</p>}
    </form>
  )
}
