import { useState } from 'react'
import type { Notice } from '../components/toast.tsx'
import { CandidateForm, useNames } from '../imports/candidate-form.tsx'
import { type Errors, serverErrors } from '../imports/edit-model.ts'
import { currentMonth } from '../lib/format.ts'
import { ApiFailure } from '../query/client.ts'
import { CategoryHelp } from './category-help.tsx'
import { registerFailure, type SetupKind, setupLabels } from './model.ts'
import { useRegister } from './queries.ts'

const extraOf: Partial<Record<SetupKind, () => Record<string, unknown>>> = {
  variable_expense: () => ({ startsOn: currentMonth() }),
  card_installment: () => ({ billMonth: currentMonth() }),
}

type Props = { kind: SetupKind; preset?: Record<string, unknown>; notify: (notice: Notice) => void; onDone: () => void }

export const NewRecord = ({ kind, preset = {}, notify, onDone }: Props) => {
  const [round, setRound] = useState(0)
  const [errors, setErrors] = useState<Errors>({})
  const register = useRegister()
  const names = useNames([])
  const planned = kind === 'variable_expense'
  const extra = extraOf[kind]
  const save = (payload: Record<string, unknown>) =>
    register.mutate(
      { kind, payload: extra ? { ...payload, ...extra() } : payload },
      {
        onSuccess: (created) => {
          setErrors({})
          setRound((value) => value + 1)
          notify({ message: `Cadastrado: ${created.name}` })
        },
        onError: (error) => setErrors(error instanceof ApiFailure && error.message.startsWith('invalid ') ? serverErrors(kind, error.message) : { form: registerFailure(error) }),
      },
    )
  const direction = kind === 'income' ? 'income' : kind === 'recurring_expense' || kind === 'card_installment' || planned ? 'expense' : undefined
  const aside = direction && ((key: string, value: string, change: (value: string) => void) => key === 'category' && <CategoryHelp name={value} direction={direction} notify={notify} onCreated={change} />)
  return (
    <CandidateForm
      key={round}
      candidate={{ id: `new-${kind}`, kind, payload: { ...(planned ? { member: 'joint' } : {}), ...preset } }}
      title={setupLabels[kind].one}
      label={`Cadastrar ${setupLabels[kind].one.toLowerCase()}`}
      saveLabel="Cadastrar"
      names={names}
      busy={register.isPending}
      serverErrors={errors}
      aside={aside || undefined}
      onSave={save}
      onCancel={onDone}
    />
  )
}
