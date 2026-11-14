import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Notice } from '../components/toast.tsx'
import { Button } from '../components/ui/button.tsx'
import { CandidateForm, useNames } from '../imports/candidate-form.tsx'
import { type Errors, serverErrors } from '../imports/edit-model.ts'
import { ApiFailure } from '../query/client.ts'
import { changesOf, editFields, editPayload } from './edit-model.ts'
import { type ApiRecord, closeFailure, describeRecord, groupRecords, registerFailure, type SetupKind, type SetupRecord, setupLabels } from './model.ts'
import { NewRecord } from './new-record.tsx'
import { useCloseRecord, useEditRecord } from './queries.ts'
import { StarterCategories } from './starter-categories.tsx'

type Notify = (notice: Notice) => void

const EditRecord = ({ record, onDone, notify }: { record: SetupRecord; onDone: () => void; notify: Notify }) => {
  const edit = useEditRecord()
  const names = useNames([])
  const [errors, setErrors] = useState<Errors>({})
  const fields = editFields[record.kind]
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

export const RecordList = ({ records, notify }: { records: ApiRecord[]; notify: Notify }) => {
  const close = useCloseRecord()
  const [editing, setEditing] = useState<string>()
  const [adding, setAdding] = useState<SetupKind>()
  const keyOf = (record: SetupRecord) => `${record.kind}:${record.id}`
  const drop = (record: SetupRecord) => {
    if (!window.confirm(`Encerrar ${record.name}? Some das listas e da previsão, mas o histórico fica.`)) return
    close.mutate({ kind: record.kind, id: record.id }, { onSuccess: () => notify({ message: `Encerrado: ${record.name}` }), onError: (error) => notify({ tone: 'error', message: closeFailure(error, record.name) }) })
  }
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {groupRecords(records).map(({ kind, records: group }) => (
        <section key={kind} aria-labelledby={`setup-${kind}`} className="flex min-w-0 flex-col rounded-card border bg-surface">
          <div className="flex items-center gap-2 border-b py-2 pr-2 pl-4 md:pl-6">
            <h2 id={`setup-${kind}`} className="m-0 flex flex-1 items-baseline gap-2 text-body font-semibold">
              {setupLabels[kind].many}
              <span className="text-meta font-normal text-muted">{group.length}</span>
            </h2>
            <Button variant="ghost" aria-label={`Novo cadastro em ${setupLabels[kind].many}`} aria-expanded={adding === kind} onClick={() => setAdding((current) => (current === kind ? undefined : kind))}>
              <Plus aria-hidden className="size-4" />
              Novo
            </Button>
          </div>
          {adding === kind && (
            <div className="border-b px-4 py-3 md:px-6">
              <NewRecord kind={kind} notify={notify} onDone={() => setAdding(undefined)} />
            </div>
          )}
          {group.length === 0 && kind === 'category' ? (
            <StarterCategories notify={notify} />
          ) : group.length === 0 ? (
            <p className="m-0 px-4 py-4 text-meta text-muted md:px-6">Nada cadastrado.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {group.map((record) => (
                <li key={record.id} className="flex flex-col gap-2 border-b px-4 py-2.5 last:border-b-0 md:px-6">
                  <div className="flex items-center gap-1">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{record.name}</span>
                      <span className="truncate text-xs text-muted">{describeRecord(record)}</span>
                    </div>
                    <Button variant="ghost" aria-label={`Editar ${record.name}`} aria-expanded={editing === keyOf(record)} onClick={() => setEditing((current) => (current === keyOf(record) ? undefined : keyOf(record)))}>
                      Editar
                    </Button>
                    <Button variant="ghost" disabled={close.isPending} aria-label={`Encerrar ${record.name}`} onClick={() => drop(record)}>
                      Encerrar
                    </Button>
                  </div>
                  {editing === keyOf(record) && <EditRecord record={record} notify={notify} onDone={() => setEditing(undefined)} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
