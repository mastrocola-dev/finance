import { useState } from 'react'
import type { Notice } from '../components/toast.tsx'
import { CandidateForm, useNames } from '../imports/candidate-form.tsx'
import { type Errors, serverErrors } from '../imports/edit-model.ts'
import { ApiFailure } from '../query/client.ts'
import { changesOf, editPayload, fieldsFor } from './edit-model.ts'
import { registerFailure, type SetupRecord } from './model.ts'
import { useEditRecord } from './queries.ts'

export const EditRecord = ({ record, onDone, notify }: { record: SetupRecord; onDone: () => void; notify: (notice: Notice) => void }) => {
  const edit = useEditRecord()
  const names = useNames([])
  const [errors, setErrors] = useState<Errors>({})
  const fields = fieldsFor(record)
  const save = (payload: Record<string, unknown>) => {
    const changes = changesOf(record, payload)
    if (!Object.keys(changes).length) return onDone()
    edit.mutate(
      { kind: record.kind, id: record.id, changes },
      {
        onSuccess: (edited) => {
          onDone()
          notify({ message: `Alterado: ${edited.name}` })
        },
        onError: (error) => setErrors(error instanceof ApiFailure && error.message.startsWith('invalid ') ? serverErrors(record.kind, error.message, fields) : { form: registerFailure(error) }),
      },
    )
  }
  return <CandidateForm candidate={{ id: `setup-${record.kind}-${record.id}`, kind: record.kind, payload: editPayload(record) }} fields={fields} title={record.name} label={`Editar ${record.name}`} names={names} busy={edit.isPending} serverErrors={errors} onSave={save} onCancel={onDone} />
}
