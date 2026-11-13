import { useState } from 'react'
import type { Notice } from '../components/toast.tsx'
import { CandidateForm, useNames } from '../imports/candidate-form.tsx'
import { type Errors, serverErrors } from '../imports/edit-model.ts'
import { ApiFailure } from '../query/client.ts'
import { registerFailure, type SetupKind, setupLabels } from './model.ts'
import { useRegister } from './queries.ts'

export const NewRecord = ({ kind, notify, onDone }: { kind: SetupKind; notify: (notice: Notice) => void; onDone: () => void }) => {
  const [round, setRound] = useState(0)
  const [errors, setErrors] = useState<Errors>({})
  const register = useRegister()
  const names = useNames([])
  const save = (payload: Record<string, unknown>) =>
    register.mutate(
      { kind, payload },
      {
        onSuccess: (created) => {
          setErrors({})
          setRound((value) => value + 1)
          notify({ message: `Cadastrado: ${created.name}` })
        },
        onError: (error) => setErrors(error instanceof ApiFailure && error.message.startsWith('invalid ') ? serverErrors(kind, error.message) : { form: registerFailure(error) }),
      },
    )
  return <CandidateForm key={round} candidate={{ id: `new-${kind}`, kind, payload: {} }} title={setupLabels[kind].one} label={`Cadastrar ${setupLabels[kind].one.toLowerCase()}`} saveLabel="Cadastrar" names={names} busy={register.isPending} serverErrors={errors} onSave={save} onCancel={onDone} />
}
