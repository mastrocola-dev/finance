import { useMutationState } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../components/empty-state.tsx'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { type Notice, Toast } from '../components/toast.tsx'
import { Button } from '../components/ui/button.tsx'
import { chip } from '../decisions/decision-card.tsx'
import { RecordScroll, useRecordHash } from '../lib/record.tsx'
import { cn } from '../lib/utils.ts'
import { ApiFailure } from '../query/client.ts'
import { useLedger, useNames } from './candidate-form.tsx'
import { CandidateRow, type EditForm } from './candidate-row.tsx'
import { CommitCard, CommittedCard } from './commit-card.tsx'
import { type Names, serverErrors } from './edit-model.ts'
import { type Batch, canRetry, closeFailure, formatStamp, phaseLabels, phaseOf, phaseTones, plural, progressText, retryFailure, retryText, unavailableText } from './model.ts'
import { useClose, useRetry, useRuntime } from './queries.ts'
import { QuestionCard } from './question-card.tsx'
import { acceptable, type Candidate, checkText, commitFailure, commitPlan, type Decision, type Group, groupCandidates, type Question, reviewCounts, reviewFailure, titleOf } from './review-model.ts'
import { useAnswer, useBatch, useCandidates, useCommit, useDecide, useEdit, useQuestions } from './review-queries.ts'
import { UnavailableNotice } from './unavailable-notice.tsx'

const card = 'flex min-w-0 flex-col gap-2 rounded-card border bg-surface px-4 py-3 md:px-6 md:py-4'

const Rows = () => (
  <div className="flex flex-col gap-3">
    {['a', 'b', 'c'].map((key) => (
      <Skeleton key={key} className="h-20" />
    ))}
  </div>
)

const waiting: Partial<Record<ReturnType<typeof phaseOf>, string>> = {
  failed: 'A leitura falhou. Volte ao histórico para descartar e enviar de novo.',
  draft: 'A leitura ainda não terminou a verificação.',
  abandoned: 'Esta importação foi descartada.',
  closed: 'Esta importação foi encerrada.',
}

const BatchHeader = ({ batch }: { batch: Batch }) => {
  const phase = phaseOf(batch)
  useEffect(() => {
    document.title = `Revisar ${batch.fileName} · Caixa`
  }, [batch.fileName])
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="m-0 min-w-0 break-words text-title-mobile font-semibold tracking-[-0.02em] md:text-title">{batch.fileName}</h1>
        <span className={cn(chip, phaseTones[phase])}>{phaseLabels[phase]}</span>
      </div>
      <span className="text-meta text-muted">
        {batch.format.toUpperCase()} · enviado {formatStamp(batch.createdAt)}
        {batch.progress && phase === 'extracting' ? ` · ${progressText(batch.progress)}` : ''}
      </span>
    </header>
  )
}

const Summary = ({ candidates, questions }: { candidates: Candidate[]; questions: Question[] }) => {
  const counts = reviewCounts(candidates)
  const open = questions.filter((question) => question.answer === null).length
  return (
    <p className="m-0 text-meta text-muted">
      {[plural(counts.pending, 'pendente', 'pendentes'), plural(counts.accepted, 'aceito', 'aceitos'), plural(counts.rejected, 'rejeitado', 'rejeitados'), counts.blocked > 0 && plural(counts.blocked, 'com bloqueio', 'com bloqueio'), open > 0 && plural(open, 'pergunta aberta', 'perguntas abertas')]
        .filter(Boolean)
        .join(' · ')}
    </p>
  )
}

type GroupProps = { group: Group; hash: string; names: Record<Names, string[]>; busy: boolean; onDecide: (ids: string[], decision: Decision, label: string) => void; onEdit: (candidate: Candidate, payload: Record<string, unknown>, form: EditForm) => void }

const GroupCard = ({ group, hash, names, busy, onDecide, onEdit }: GroupProps) => {
  const ready = acceptable(group)
  const headingId = `group-${group.key}`
  return (
    <section aria-labelledby={headingId} className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="m-0 text-section font-semibold first-letter:uppercase">
          {group.title}
        </h2>
        <span className="text-xs text-muted">{plural(group.candidates.length, 'item', 'itens')}</span>
        {ready.length > 1 && (
          <Button variant="ghost" className="ml-auto" disabled={busy} onClick={() => onDecide(ready, 'accept', `${ready.length} itens`)}>
            Aceitar {ready.length} prontos
          </Button>
        )}
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {group.candidates.map((candidate) => (
          <CandidateRow key={candidate.id} candidate={candidate} hash={hash} names={names} busy={busy} onDecide={(decision) => onDecide([candidate.id], decision, titleOf(candidate))} onEdit={(payload, form) => onEdit(candidate, payload, form)} />
        ))}
      </ul>
    </section>
  )
}

const decided = (decision: Decision, label: string) => (decision === 'accept' ? `Aceito: ${label}` : `Rejeitado: ${label}`)

const Review = ({ batch, notify, onCommit }: { batch: Batch; notify: (notice: Notice) => void; onCommit: () => void }) => {
  const candidates = useCandidates(batch.id, true)
  const questions = useQuestions(batch.id, true)
  const answer = useAnswer(batch.id)
  const decide = useDecide(batch.id)
  const edit = useEdit(batch.id)
  const names = useNames(candidates.data ?? [])
  const ledger = useLedger()
  const hash = useRecordHash()
  const busy = useMutationState({ filters: { mutationKey: ['import-review', batch.id], status: 'pending' } }).length > 0
  const onError = (error: Error) => notify({ tone: 'error', message: reviewFailure(error) })
  const onEdit = (candidate: Candidate, payload: Record<string, unknown>, form: EditForm) =>
    edit.mutate(
      { candidate: candidate.id, payload },
      {
        onSuccess: () => {
          form.close()
          notify({ message: `Editado: ${titleOf({ ...candidate, payload })}` })
        },
        onError: (error) => (error instanceof ApiFailure && /^invalid \w+ payload/.test(error.message) ? form.refuse(serverErrors(candidate.kind, error.message)) : onError(error)),
      },
    )

  return (
    <QueryView query={candidates} skeleton={<Rows />}>
      {(items) => (
        <QueryView query={questions} skeleton={<Rows />}>
          {(asked) => {
            const open = asked.filter((question) => question.answer === null)
            const titles = new Map(items.map((item) => [item.id, titleOf(item)]))
            return (
              <div className="flex w-full max-w-4xl flex-col gap-5">
                <Summary candidates={items} questions={asked} />
                {(open.length > 0 || batch.checks.length > 0) && (
                  <section aria-labelledby="attention-title" className={cn(card, 'border-accent/40')}>
                    <h2 id="attention-title" className="m-0 text-section font-semibold">
                      Precisa de vocês
                    </h2>
                    {batch.checks.length > 0 && (
                      <ul aria-label="Alertas do arquivo" className="m-0 flex list-none flex-col gap-1 p-0">
                        {batch.checks.map((check) => (
                          <li key={`${check.code}-${check.detail ?? ''}`} className="text-meta text-late">
                            {checkText(check)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {open.length > 0 && (
                      <ul aria-label="Perguntas" className="m-0 flex list-none flex-col gap-2.5 p-0">
                        {open.map((question) => (
                          <QuestionCard key={question.id} question={question} about={question.candidateId ? titles.get(question.candidateId) : undefined} busy={busy} onAnswer={(text) => answer.mutate({ question, answer: text }, { onSuccess: () => notify({ message: `Resposta registrada: ${text}` }), onError })} />
                        ))}
                      </ul>
                    )}
                  </section>
                )}
                {items.length === 0 ? (
                  <EmptyState title="Nenhum item lido">O Claude não encontrou lançamentos neste arquivo. Volte ao histórico para descartar a importação.</EmptyState>
                ) : (
                  <>
                    {groupCandidates(items).map((group) => (
                      <GroupCard key={group.key} group={group} hash={hash} names={names} busy={busy} onEdit={onEdit} onDecide={(ids, decision, label) => decide.mutate({ ids, decision }, { onSuccess: () => notify({ message: decided(decision, label) }), onError })} />
                    ))}
                    <CommitCard plan={commitPlan(items, ledger)} open={open.length} busy={busy} hash={hash} onCommit={onCommit} />
                    <RecordScroll />
                  </>
                )}
              </div>
            )
          }}
        </QueryView>
      )}
    </QueryView>
  )
}

const retryUnavailableId = 'retry-unavailable'

const RetryCard = ({ batch, busy, unavailable, onRetry }: { batch: Batch; busy: boolean; unavailable: string | undefined; onRetry: () => void }) => (
  <section aria-label="Ler de novo" className={cn(card, 'max-w-4xl flex-row flex-wrap items-center gap-3')}>
    <span className="min-w-0 flex-1 text-meta">{retryText(batch)}</span>
    <Button variant="outline" disabled={busy || Boolean(unavailable)} aria-describedby={unavailable ? retryUnavailableId : undefined} onClick={onRetry}>
      Ler de novo
    </Button>
    {unavailable && <UnavailableNotice id={retryUnavailableId} text={unavailable} />}
  </section>
)

export const ReviewPage = () => {
  const { id } = useParams({ from: '/importar/$id' })
  const batch = useBatch(id)
  const retry = useRetry()
  const runtime = useRuntime()
  const commit = useCommit(id)
  const close = useClose()
  const [notice, setNotice] = useState<Notice>()
  const dismiss = useCallback(() => setNotice(undefined), [])
  return (
    <>
      <Link to="/importar" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-meta text-accent md:min-h-0">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Importar
      </Link>
      <QueryView query={batch} skeleton={<Skeleton className="h-16 max-w-xl" />}>
        {(data) => {
          const phase = phaseOf(data)
          return (
            <>
              <BatchHeader batch={data} />
              {canRetry(data) && (
                <RetryCard batch={data} busy={retry.isPending} unavailable={unavailableText(runtime.data)} onRetry={() => retry.mutate(data, { onSuccess: () => setNotice({ message: `Lendo de novo: ${data.fileName}` }), onError: (error) => setNotice({ tone: 'error', message: retryFailure(error) }) })} />
              )}
              {phase === 'verified' && <Review batch={data} notify={setNotice} onCommit={() => commit.mutate(undefined, { onSuccess: (done) => setNotice({ message: `Gravado no livro: ${plural(done.committed, 'item', 'itens')}` }), onError: (error) => setNotice({ tone: 'error', message: commitFailure(error) }) })} />}
              {phase === 'committed' && <CommittedCard batch={data} busy={close.isPending} onClose={() => close.mutate(data, { onSuccess: () => setNotice({ message: `Importação encerrada: ${data.fileName}` }), onError: (error) => setNotice({ tone: 'error', message: closeFailure(error) }) })} />}
              {phase !== 'verified' && phase !== 'committed' && <EmptyState title={phase === 'extracting' ? 'O Claude está lendo o arquivo' : 'Nada para revisar'}>{phase === 'extracting' ? 'A revisão abre aqui assim que a leitura terminar.' : waiting[phase]}</EmptyState>}
            </>
          )
        }}
      </QueryView>
      <Toast notice={notice} onClose={dismiss} />
    </>
  )
}
