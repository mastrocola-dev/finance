import type { Notice } from '../components/toast.tsx'
import { Button } from '../components/ui/button.tsx'
import { closeFailure, describeRecord, groupRecords, type SetupRecord, setupLabels } from './model.ts'
import { useCloseRecord } from './queries.ts'

export const RecordList = ({ records, notify }: { records: SetupRecord[]; notify: (notice: Notice) => void }) => {
  const close = useCloseRecord()
  const drop = (record: SetupRecord) => {
    if (!window.confirm(`Encerrar ${record.name}? Some das listas e da previsão, mas o histórico fica.`)) return
    close.mutate({ kind: record.kind, id: record.id }, { onSuccess: () => notify({ message: `Encerrado: ${record.name}` }), onError: (error) => notify({ tone: 'error', message: closeFailure(error, record.name) }) })
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {groupRecords(records).map(({ kind, records: group }) => (
        <section key={kind} aria-labelledby={`setup-${kind}`} className="flex min-w-0 flex-col rounded-card border bg-surface">
          <h2 id={`setup-${kind}`} className="m-0 flex items-baseline gap-2 border-b px-4 py-3 text-body font-semibold md:px-6">
            {setupLabels[kind].many}
            <span className="text-meta font-normal text-muted">{group.length}</span>
          </h2>
          {group.length === 0 ? (
            <p className="m-0 px-4 py-4 text-meta text-muted md:px-6">Nada cadastrado.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {group.map((record) => (
                <li key={record.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 md:px-6">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{record.name}</span>
                    <span className="truncate text-xs text-muted">{describeRecord(record)}</span>
                  </div>
                  <Button variant="ghost" disabled={close.isPending} aria-label={`Encerrar ${record.name}`} onClick={() => drop(record)}>
                    Encerrar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
