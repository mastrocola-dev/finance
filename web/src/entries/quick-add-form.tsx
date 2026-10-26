import { zodResolver } from '@hookform/resolvers/zod'
import { CornerDownLeft, X } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../components/ui/button.tsx'
import { today } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import type { Entry } from '../overview/model.ts'
import { useMembers } from '../query/shell.ts'
import { type NewEntry, useAccounts, useCategories } from './queries.ts'
import { dueOnFor, fromEntry, lastDayOf, paidByDefault, type QuickEntry, quickEntry, toNewEntry } from './quick-add.ts'

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

type Editing = { entry: Entry; onCancelEntry: () => void; onClose: () => void }

type Props = { month: string; member: string | undefined; pending: boolean; editing?: Editing; onSubmit: (entry: NewEntry, reset: () => void) => void }

export const QuickAddForm = ({ month, member, pending, editing, onSubmit }: Props) => {
  const categories = useCategories().data ?? []
  const accounts = useAccounts().data ?? []
  const members = useMembers().data ?? []
  const now = today()
  const date = dueOnFor(month, now)
  const { register, handleSubmit, watch, setValue, resetField, setFocus, formState } = useForm<QuickEntry>({
    resolver: zodResolver(quickEntry(month, now)),
    defaultValues: editing ? fromEntry(editing.entry) : { direction: 'expense', description: '', amount: '', category: '', account: '', member: member ?? 'joint', date, paid: paidByDefault(date, now) },
  })
  const direction = watch('direction')
  const errors = Object.values(formState.errors).map((error) => error?.message)
  const invalid = (name: keyof QuickEntry) => ({ 'aria-invalid': formState.errors[name] ? true : undefined, 'aria-describedby': formState.errors[name] ? errorsId : undefined })
  const submit = handleSubmit((values) =>
    onSubmit(toNewEntry(values, month, editing?.entry.paidOn ?? undefined), () => {
      resetField('description')
      resetField('amount')
      setFocus('description')
    }),
  )
  return (
    <form aria-label={editing ? `Corrigir ${editing.entry.description}` : 'Lançamento rápido'} noValidate onSubmit={submit} onKeyDown={submitOnEnter} className={cn('flex flex-col gap-2 rounded-card border bg-surface p-4', editing && 'border-accent')}>
      {editing && (
        <div className="flex items-center gap-2">
          <h2 className="m-0 flex-1 text-body font-semibold">Corrigir lançamento</h2>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar correção" onClick={editing.onClose}>
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field id="quick-direction" label="Tipo" grow="flex-[0_1_140px] min-w-[7.5rem]">
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
        <Field id="quick-member" label="Quem" grow="flex-[1_1_140px] min-w-[7.5rem]">
          <select className={field} id="quick-member" {...register('member')}>
            <option value="joint">Conjunto</option>
            {members.map(({ id, name }) => (
              <option key={id} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="quick-date" label="Data" grow="flex-[0_0_152px]">
          <input className={field} type="date" min={`${month}-01`} max={lastDayOf(month)} id="quick-date" {...register('date', { onChange: (event) => setValue('paid', paidByDefault(event.target.value, now)) })} {...invalid('date')} />
        </Field>
        <label htmlFor="quick-paid" className="flex min-h-11 flex-[0_0_auto] cursor-pointer items-center gap-2 text-body text-text md:min-h-10">
          <input className="size-4 accent-accent" type="checkbox" id="quick-paid" {...register('paid')} {...invalid('paid')} />
          {direction === 'income' ? 'Já recebido' : 'Já pago'}
        </label>
        {editing && (
          <Button type="button" variant="outline" disabled={pending} onClick={editing.onCancelEntry} className="flex-[1_0_auto] text-late md:ml-auto md:flex-none">
            Cancelar lançamento
          </Button>
        )}
        <Button type="submit" disabled={pending} className={cn('flex-[1_0_auto] md:flex-none', !editing && 'md:ml-auto')}>
          {editing ? 'Salvar correção' : 'Lançar'}
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
