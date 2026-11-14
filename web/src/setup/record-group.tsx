import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Notice } from '../components/toast.tsx'
import { Button } from '../components/ui/button.tsx'
import { EditRecord } from './edit-record.tsx'
import { closeFailure, describeRecord, type SetupKind, type SetupRecord } from './model.ts'
import { NewRecord } from './new-record.tsx'
import { useCloseRecord } from './queries.ts'

export type Open = { adding?: string; editing?: string; add: (id: string) => void; edit: (key: string) => void }

type Props = { open: Open; id: string; title: string; kind: SetupKind; records: SetupRecord[]; notify: (notice: Notice) => void; intro?: ReactNode; preset?: Record<string, unknown>; empty?: ReactNode }

export const RecordGroup = ({ open, id, title, kind, records, notify, intro, preset, empty }: Props) => {
  const close = useCloseRecord()
  const adding = open.adding === id
  const keyOf = (record: SetupRecord) => `${record.kind}:${record.id}`
  const drop = (record: SetupRecord) => {
    if (!window.confirm(`Encerrar ${record.name}? Some das listas e da previsão, mas o histórico fica.`)) return
    close.mutate({ kind: record.kind, id: record.id }, { onSuccess: () => notify({ message: `Encerrado: ${record.name}` }), onError: (error) => notify({ tone: 'error', message: closeFailure(error, record.name) }) })
  }
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col rounded-card border bg-surface">
      <div className="flex items-center gap-2 border-b py-2 pr-2 pl-4 md:pl-6">
        <h2 id={id} className="m-0 flex flex-1 items-baseline gap-2 text-body font-semibold">
          {title}
          <span className="text-meta font-normal text-muted">{records.length}</span>
        </h2>
        <Button variant="ghost" aria-label={`Novo cadastro em ${title}`} aria-expanded={adding} onClick={() => open.add(id)}>
          <Plus aria-hidden className="size-4" />
          Novo
        </Button>
      </div>
      {intro && <div className="border-b px-4 py-2.5 text-meta text-muted md:px-6">{intro}</div>}
      {adding && (
        <div className="border-b px-4 py-3 md:px-6">
          <NewRecord kind={kind} preset={preset} notify={notify} onDone={() => open.add(id)} />
        </div>
      )}
      {records.length === 0 ? (
        (empty ?? <p className="m-0 px-4 py-4 text-meta text-muted md:px-6">Nada cadastrado.</p>)
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {records.map((record) => (
            <li key={record.id} className="flex flex-col gap-2 border-b px-4 py-2.5 last:border-b-0 md:px-6">
              <div className="flex items-center gap-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{record.name}</span>
                  <span className="truncate text-xs text-muted">{describeRecord(record)}</span>
                </div>
                <Button variant="ghost" aria-label={`Editar ${record.name}`} aria-expanded={open.editing === keyOf(record)} onClick={() => open.edit(keyOf(record))}>
                  Editar
                </Button>
                <Button variant="ghost" disabled={close.isPending} aria-label={`Encerrar ${record.name}`} onClick={() => drop(record)}>
                  Encerrar
                </Button>
              </div>
              {open.editing === keyOf(record) && <EditRecord record={record} notify={notify} onDone={() => open.edit(keyOf(record))} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
