import { useState } from 'react'
import { EmptyState } from '../components/empty-state.tsx'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { Button } from '../components/ui/button.tsx'
import { useIdentity } from '../identity/identity-provider.tsx'
import { useMembers } from '../query/shell.ts'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { AuditEvent } from './audit-event.tsx'
import { AuthorFilters } from './author-filters.tsx'
import { type AuditFilter, allFilter, authorFilters, groupByDay } from './model.ts'
import { useAuditCounts, useAuditTimeline } from './queries.ts'

const TimelineSkeleton = () => (
  <div className="flex flex-col gap-3">
    <Skeleton className="h-4 w-40" />
    <Skeleton className="h-96 rounded-card" />
  </div>
)

export const ActivityPage = () => {
  const [filter, setFilter] = useState<AuditFilter>(allFilter)
  const members = (useMembers().data ?? []).map(({ name }) => name)
  const counts = useAuditCounts().data
  const timeline = useAuditTimeline(filter)
  const { member } = useIdentity()

  if (!member)
    return (
      <>
        <PageHeader screen={screenOf('/atividade')} />
        <EmptyState title="Escolha quem você é">O histórico mostra quem mudou o quê na casa. Escolha seu nome em “Você é” para ver a atividade.</EmptyState>
      </>
    )

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <PageHeader screen={screenOf('/atividade')} />
        <p className="m-0 max-w-[640px] text-muted">Toda alteração fica registrada com autor, antes e depois. Nada é apagado: registros corrigidos são encerrados e substituídos.</p>
      </div>
      {counts && <AuthorFilters filters={authorFilters(counts, members)} chosen={filter.key} onChoose={setFilter} />}
      <div className="flex w-full max-w-5xl flex-col gap-5">
        <QueryView
          query={timeline}
          skeleton={<TimelineSkeleton />}
          isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
          empty={<EmptyState title="Nenhuma atividade">{filter.key === 'all' ? 'Lançamentos, pagamentos e decisões aparecem aqui assim que forem registrados.' : `Nada registrado por ${filter.label} ainda.`}</EmptyState>}
        >
          {(data) =>
            groupByDay(data.pages.flatMap((page) => page.items)).map((day) => (
              <section key={day.key} aria-labelledby={`day-${day.key}`} className="flex flex-col gap-3">
                <h2 id={`day-${day.key}`} className="m-0 mt-2 text-meta font-semibold tracking-[0.06em] text-muted uppercase">
                  {day.label}
                </h2>
                <ol className="m-0 list-none rounded-card border bg-surface p-0">
                  {day.items.map((item) => (
                    <AuditEvent key={item.id} item={item} />
                  ))}
                </ol>
              </section>
            ))
          }
        </QueryView>
        {timeline.hasNextPage && (
          <Button variant="outline" className="self-center" disabled={timeline.isFetchingNextPage} onClick={() => timeline.fetchNextPage()}>
            {timeline.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
          </Button>
        )}
      </div>
    </>
  )
}
