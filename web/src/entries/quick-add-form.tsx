import { zodResolver } from '@hookform/resolvers/zod'
import { CornerDownLeft } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../components/ui/button.tsx'
import { today } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import { useMembers } from '../query/shell.ts'
import { type NewEntry, useAccounts, useCategories } from './queries.ts'
import { type QuickEntry, quickEntry, toNewEntry } from './quick-add.ts'

const field = 'min-h-11 w-full rounded-control border bg-bg px-3 text-body text-text focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent-soft aria-invalid:border-late md:min-h-10'
const errorsId = 'quick-add-errors'

const Field = ({ id, label, grow, children }: { id: string; label: string; grow: string; children: ReactNode }) => (
  <div className={cn('flex min-w-0 flex-col gap-1.5', grow)}>
    <label htmlFor={id} className="text-xs text-muted">
      {label}
    </label>
    {children}
  </div>
)

const submitOnEnter = (event: KeyboardEvent<HTMLFormElement>) => {
  if (event.key !== 'Enter' || !(event.target instanceof HTMLSelectElement)) return
  event.preventDefault()
  event.currentTarget.requestSubmit()
}

type Props = { month: string; member: string | undefined; pending: boolean; onSubmit: (entry: NewEntry, reset: () => void) => void }

export const QuickAddForm = ({ month, member, pending, onSubmit }: Props) => {
  const categories = useCategories().data ?? []
  const accounts = useAccounts().data ?? []
  const members = useMembers().data ?? []
  const { register, handleSubmit, watch, setValue, resetField, setFocus, formState } = useForm<QuickEntry>({
    resolver: zodResolver(quickEntry),
    defaultValues: { direction: 'expense', description: '', amount: '', category: '', account: '', member: member ?? 'joint' },
  })
  const direction = watch('direction')
  const errors = Object.values(formState.errors).map((error) => error?.message)
  const invalid = (name: keyof QuickEntry) => ({ 'aria-invalid': formState.errors[name] ? true : undefined, 'aria-describedby': formState.errors[name] ? errorsId : undefined })
  const submit = handleSubmit((values) =>
    onSubmit(toNewEntry(values, month, today()), () => {
      resetField('description')
      resetField('amount')
      setFocus('description')
    }),
  )
  return (
    <form aria-label="Lançamento rápido" noValidate onSubmit={submit} onKeyDown={submitOnEnter} className="flex flex-col gap-2 rounded-card border bg-surface p-4">
      <div className="flex flex-wrap items-end gap-2 lg:flex-nowrap">
        <Field id="quick-direction" label="Tipo" grow="flex-[0_1_140px]">
          <select className={field} id="quick-direction" {...register('direction', { onChange: () => setValue('category', '') })}>
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
        </Field>
        <Field id="quick-description" label="Descrição" grow="flex-[2_1_220px]">
          <input className={field} autoComplete="off" id="quick-description" {...register('description')} {...invalid('description')} />
        </Field>
        <Field id="quick-amount" label="Valor" grow="flex-[1_1_140px]">
          <input className={cn(field, 'amount')} inputMode="decimal" autoComplete="off" placeholder="R$ 0,00" id="quick-amount" {...register('amount')} {...invalid('amount')} />
        </Field>
        <Field id="quick-category" label="Categoria" grow="flex-[1_1_150px]">
          <select className={field} id="quick-category" {...register('category')} {...invalid('category')}>
            <option value="">Escolher</option>
            {categories
              .filter((category) => category.direction === direction)
              .map(({ id, name }) => (
                <option key={id} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </Field>
        <Field id="quick-account" label="Conta" grow="flex-[1_1_170px]">
          <select className={field} id="quick-account" {...register('account')}>
            <option value="">Sem conta</option>
            {accounts.map(({ id, nickname, lastFour }) => (
              <option key={id} value={nickname}>
                {`${nickname} •• ${lastFour}`}
              </option>
            ))}
          </select>
        </Field>
        <Field id="quick-member" label="Quem" grow="flex-[1_1_140px]">
          <select className={field} id="quick-member" {...register('member')}>
            <option value="joint">Conjunto</option>
            {members.map(({ id, name }) => (
              <option key={id} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={pending} className="flex-[1_0_auto] md:flex-none">
          Lançar
          <CornerDownLeft size={14} aria-hidden="true" className="opacity-75" />
        </Button>
      </div>
      {errors.length > 0 && (
        <p id={errorsId} role="alert" className="m-0 text-meta text-late">
          {errors.join(' ')}
        </p>
      )}
    </form>
  )
}
