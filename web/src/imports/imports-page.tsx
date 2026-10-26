import { useMutationState } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { EmptyState } from '../components/empty-state.tsx'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { type Notice, Toast } from '../components/toast.tsx'
import { useIdentity } from '../identity/identity-provider.tsx'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { BatchItem } from './batch-item.tsx'
import { type Batch, closeFailure, retryFailure, unavailableText, uploadFailure } from './model.ts'
import { useClose, useImports, useRetry, useRuntime, useUpload } from './queries.ts'
import { UploadForm } from './upload-form.tsx'

const RowsSkeleton = () => (
  <div className="flex flex-col gap-3">
    {['a', 'b', 'c'].map((key) => (
      <Skeleton key={key} className="h-24" />
    ))}
  </div>
)

const closed = (batch: Batch) => (batch.status === 'committed' ? `Importação encerrada: ${batch.fileName}` : `Importação descartada: ${batch.fileName}`)

export const ImportsPage = () => {
  const { member } = useIdentity()
  const imports = useImports()
  const runtime = useRuntime()
  const unavailable = unavailableText(runtime.data)
  const upload = useUpload()
  const close = useClose()
  const retry = useRetry()
  const [notice, setNotice] = useState<Notice>()
  const dismiss = useCallback(() => setNotice(undefined), [])
  const busy = useMutationState({ filters: { predicate: (mutation) => ['import-close', 'import-retry'].includes(String(mutation.options.mutationKey?.[0])), status: 'pending' }, select: (mutation) => (mutation.state.variables as Batch).id })

  return (
    <>
      <div className="flex flex-col gap-1">
        <PageHeader screen={screenOf('/importar')} />
        <span className="text-meta text-muted">O Claude lê o arquivo; vocês revisam antes de qualquer gravação</span>
      </div>
      <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <UploadForm
          member={member}
          pending={upload.isPending}
          unavailable={unavailable}
          onSubmit={(file, reset) =>
            upload.mutate(file, {
              onSuccess: (batch) => {
                reset()
                setNotice({ message: `Arquivo enviado: ${batch.fileName}. O Claude está lendo.` })
              },
              onError: (error) => setNotice({ tone: 'error', message: uploadFailure(error) }),
            })
          }
        />
        <section aria-labelledby="imports-title" className="flex min-w-0 flex-col gap-2 rounded-card border bg-surface px-4 py-3 md:px-6 md:py-4">
          <h2 id="imports-title" className="m-0 text-section font-semibold">
            Histórico
          </h2>
          <QueryView query={imports} skeleton={<RowsSkeleton />} isEmpty={(data) => data.length === 0} empty={<EmptyState title="Nenhuma importação ainda">Envie um arquivo para o Claude propor lançamentos. Cada envio aparece aqui com o custo da leitura.</EmptyState>}>
            {(data) => (
              <ul className="m-0 flex list-none flex-col p-0">
                {data.map((batch) => (
                  <BatchItem
                    key={batch.id}
                    batch={batch}
                    busy={busy.includes(batch.id)}
                    unavailable={Boolean(unavailable)}
                    onRetry={() =>
                      retry.mutate(batch, {
                        onSuccess: () => setNotice({ message: `Lendo de novo: ${batch.fileName}` }),
                        onError: (error) => setNotice({ tone: 'error', message: retryFailure(error) }),
                      })
                    }
                    onClose={() =>
                      close.mutate(batch, {
                        onSuccess: () => setNotice({ message: closed(batch) }),
                        onError: (error) => setNotice({ tone: 'error', message: closeFailure(error) }),
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </QueryView>
        </section>
      </div>
      <Toast notice={notice} onClose={dismiss} />
    </>
  )
}
