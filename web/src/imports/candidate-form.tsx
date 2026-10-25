import { type FormEvent, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { useAccounts, useCategories } from '../entries/queries.ts'
import { cn } from '../lib/utils.ts'
import { useMembers } from '../query/shell.ts'
import { useSavings } from '../worth/queries.ts'
import { type Errors, type Field, fieldsOf, type Names, toPayload, toValues, type Values } from './edit-model.ts'
import type { Candidate } from './review-model.ts'

const input = 'min-h-11 w-full rounded-control border bg-bg px-3 text-body text-text focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent-soft aria-invalid:border-late md:min-h-10'

const stagedNames = (candidates: Candidate[], kind: string, key: string) => candidates.filter((item) => item.kind === kind && item.status !== 'rejected' && typeof item.payload[key] === 'string').map((item) => String(item.payload[key]))

export const useNames = (candidates: Candidate[]): Record<Names, string[]> => {
  const members = useMembers().data ?? []
  const accounts = useAccounts().data ?? []
  const categories = useCategories().data ?? []
  const reserves = useSavings().data?.reserves ?? []
  const unique = (names: string[]) => [...new Set(names)]
  return {
    members: ['Conjunto', ...members.map((item) => item.name)],
    accounts: unique([...accounts.map((item) => item.nickname), ...stagedNames(candidates, 'account', 'nickname')]),
    categories: unique([...categories.map((item) => item.name), ...stagedNames(candidates, 'category', 'name')]),
    reserves: unique([...reserves.map((item) => item.name), ...stagedNames(candidates, 'reserve', 'name')]),
  }
}

type FieldProps = { id: string; field: Field; value: string; error?: string; onChange: (value: string) => void }

const Control = ({ id, field, value, error, onChange }: FieldProps) => {
  const described = { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined }
  if (field.type === 'flag') return <input id={id} type="checkbox" className="size-4 accent-accent" checked={value === 'true'} onChange={(event) => onChange(String(event.target.checked))} {...described} />
  if (field.options)
    return (
      <select id={id} className={input} value={value} onChange={(event) => onChange(event.target.value)} {...described}>
        {Object.entries(field.options).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    )
  const kind = field.type === 'date' ? { type: 'date' } : ['money', 'balance', 'percent'].includes(field.type) ? { inputMode: 'decimal' as const } : ['day', 'count', 'paid', 'lastFour'].includes(field.type) ? { inputMode: 'numeric' as const } : {}
  return <input id={id} className={cn(input, ['money', 'balance'].includes(field.type) && 'amount')} autoComplete="off" list={field.names ? `${id}-names` : undefined} value={value} onChange={(event) => onChange(event.target.value)} {...kind} {...described} />
}

type Props = { candidate: Candidate; title: string; names: Record<Names, string[]>; busy: boolean; serverErrors?: Errors; onSave: (payload: Record<string, unknown>) => void; onCancel: () => void }

export const CandidateForm = ({ candidate, title, names, busy, serverErrors = {}, onSave, onCancel }: Props) => {
  const [values, setValues] = useState<Values>(() => toValues(candidate))
  const [errors, setErrors] = useState<Errors>({})
  const shown = { ...serverErrors, ...errors }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = toPayload(candidate.kind, values)
    setErrors(result.errors ?? {})
    if (result.payload) onSave(result.payload)
  }
  const prefix = `edit-${candidate.id}`
  return (
    <form aria-label={`Editar ${title}`} noValidate onSubmit={submit} className="flex flex-col gap-3 rounded-control bg-sunken p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fieldsOf[candidate.kind].map((field) => {
          const id = `${prefix}-${field.key}`
          const error = shown[field.key]
          const control = <Control id={id} field={field} value={values[field.key] ?? ''} error={error} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />
          return (
            <div key={field.key} className="flex min-w-0 flex-col gap-1.5">
              {field.type === 'flag' ? (
                <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-text md:min-h-10">
                  {control}
                  {field.label}
                </label>
              ) : (
                <>
                  <label htmlFor={id} className="text-xs text-muted">
                    {field.label}
                    {field.optional ? ' (opcional)' : ''}
                  </label>
                  {control}
                </>
              )}
              {field.names && (
                <datalist id={`${id}-names`}>
                  {names[field.names].map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              )}
              {error && (
                <span id={`${id}-error`} className="text-xs text-late">
                  {error}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {shown.form && (
        <p role="alert" className="m-0 text-meta text-late">
          {shown.form}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Salvar
        </Button>
      </div>
    </form>
  )
}
