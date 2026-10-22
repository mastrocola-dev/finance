import { useMutationState } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { EmptyState } from '../components/empty-state.tsx'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { type Notice, Toast } from '../components/toast.tsx'
import { useIdentity } from '../identity/identity-provider.tsx'
import { RecordScroll, useRecordHash } from '../lib/record.tsx'
import { ApiFailure } from '../query/client.ts'
import { useMembers, useProposedDecisions } from '../query/shell.ts'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { DecisionCard } from './decision-card.tsx'
import { DecisionHistory } from './decision-history.tsx'
import type { Answer } from './model.ts'
import { ProposeForm } from './propose-form.tsx'
import { type Reply, useDecisionHistory, usePropose, useReply } from './queries.ts'

const done: Record<Answer, string> = { confirm: 'Confirmação registrada', reject: 'Decisão rejeitada', withdraw: 'Proposta retirada' }

const verbs: Record<Answer, string> = { confirm: 'confirmar', reject: 'rejeitar', withdraw: 'retirar' }

const failure = (error: Error, action: string) => (error instanceof ApiFailure && error.status === 401 ? 'Escolha quem você é para responder.' : error instanceof ApiFailure && error.status === 422 ? `Não foi possível ${action}: a decisão mudou. A lista foi atualizada.` : `Não foi possível ${action}. Tente de novo.`)

const CardsSkeleton = () => (
  <div className="flex flex-col gap-4">
    {['a', 'b'].map((key) => (
      <Skeleton key={key} className="h-72 rounded-hero" />
    ))}
  </div>
)

const RowsSkeleton = () => (
  <div className="flex flex-col gap-2">
    {['a', 'b', 'c'].map((key) => (
      <Skeleton key={key} className="h-10" />
    ))}
  </div>
)

export const DecisionsPage = () => {
  const { member } = useIdentity()
  const members = (useMembers().data ?? []).map(({ name }) => name)
  const hash = useRecordHash()
  const pending = useProposedDecisions()
  const history = useDecisionHistory()
  const [notice, setNotice] = useState<Notice>()
  const close = useCallback(() => setNotice(undefined), [])
  const reply = useReply()
  const propose = usePropose()
  const busy = useMutationState({ filters: { mutationKey: ['decision-reply'], status: 'pending' }, select: (mutation) => (mutation.state.variables as Reply).decision.id })

  const answer = (input: Reply) =>
    reply.mutate(input, {
      onSuccess: (decision) => setNotice({ message: decision.status === 'confirmed' ? `${decision.title} confirmada pelos dois` : `${done[input.answer]}: ${decision.title}` }),
      onError: (error) => setNotice({ tone: 'error', message: failure(error, verbs[input.answer]) }),
    })

  return (
    <>
      <div className="flex flex-col gap-1">
        <PageHeader screen={screenOf('/decisoes')} />
        <span className="text-meta text-muted">Valem só quando os dois confirmam</span>
      </div>
      <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <section aria-label="Pendentes" className="flex min-w-0 flex-col gap-4">
          <QueryView query={pending} skeleton={<CardsSkeleton />} isEmpty={(data) => data.length === 0} empty={<EmptyState title="Nenhuma decisão pendente">Propostas de vocês dois, ou feitas pelo Claude, aparecem aqui até que ambos confirmem.</EmptyState>}>
            {(data) => (
              <>
                {data.map((decision) => (
                  <DecisionCard key={decision.id} decision={decision} members={members} member={member} busy={busy.includes(decision.id)} hash={hash} onAnswer={(choice) => answer({ decision, answer: choice })} />
                ))}
                <RecordScroll />
              </>
            )}
          </QueryView>
        </section>
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="history-title" className="flex flex-col gap-2 lg:order-last">
            <h2 id="history-title" className="m-0 text-meta font-semibold tracking-[0.06em] text-muted uppercase">
              Histórico
            </h2>
            <QueryView query={history} skeleton={<RowsSkeleton />} isEmpty={(data) => data.length === 0} empty={<p className="m-0 text-meta text-muted">Nenhuma decisão encerrada ainda.</p>}>
              {(data) => (
                <>
                  <DecisionHistory decisions={data} hash={hash} />
                  <RecordScroll />
                </>
              )}
            </QueryView>
          </section>
          <ProposeForm
            member={member}
            pending={propose.isPending}
            onSubmit={(decision, reset) =>
              propose.mutate(decision, {
                onSuccess: (created) => {
                  reset()
                  setNotice({ message: `Proposta registrada: ${created.title}` })
                },
                onError: (error) => setNotice({ tone: 'error', message: failure(error, 'propor') }),
              })
            }
          />
        </div>
      </div>
      <Toast notice={notice} onClose={close} />
    </>
  )
}
