import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, buttonVariants } from '../components/ui/button.tsx'
import { cn } from '../lib/utils.ts'
import { type Batch, plural } from './model.ts'
import { blockingTexts, type CommitPlan, titleOf, unstagedText } from './review-model.ts'

const card = 'flex min-w-0 flex-col gap-2.5 rounded-card border bg-surface px-4 py-3 md:px-6 md:py-4'

const outcome = (plan: CommitPlan, open: number) =>
  [
    plan.ready.length === 0 ? 'Nenhum item aceito para gravar.' : `${plural(plan.ready.length, 'item aceito vai', 'itens aceitos vão')} para o livro.`,
    plan.left > 0 && `${plural(plan.left, 'item pendente ou rejeitado fica', 'itens pendentes ou rejeitados ficam')} de fora.`,
    open > 0 && `${plural(open, 'pergunta segue aberta', 'perguntas seguem abertas')}.`,
  ]
    .filter(Boolean)
    .join(' ')

type Confirm = { label: string; confirm: string; disabled: boolean; onConfirm: () => void }

const Confirmed = ({ label, confirm, disabled, onConfirm }: Confirm) => {
  const [confirming, setConfirming] = useState(false)
  if (!confirming)
    return (
      <Button variant="primary" disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </Button>
    )
  return (
    <span className="flex flex-wrap gap-2">
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Cancelar
      </Button>
      <Button
        variant="primary"
        disabled={disabled}
        onClick={() => {
          setConfirming(false)
          onConfirm()
        }}
      >
        {confirm}
      </Button>
    </span>
  )
}

export const CommitCard = ({ plan, open, busy, onCommit }: { plan: CommitPlan; open: number; busy: boolean; onCommit: () => void }) => (
  <section aria-labelledby="commit-title" className={cn(card, (plan.blocked.length > 0 || plan.unstaged.length > 0) && 'border-late/40')}>
    <h2 id="commit-title" className="m-0 text-section font-semibold">
      Gravar no livro
    </h2>
    <p className="m-0 text-meta">{outcome(plan, open)}</p>
    {plan.blocked.length > 0 && (
      <>
        <p className="m-0 text-meta text-late">{plan.blocked.length === 1 ? 'Um item aceito tem bloqueio. Edite, responda ou rejeite antes de gravar:' : `${plan.blocked.length} itens aceitos têm bloqueio. Edite, responda ou rejeite antes de gravar:`}</p>
        <ul aria-label="Bloqueios" className="m-0 flex list-none flex-col gap-1 p-0">
          {plan.blocked.map((candidate) => (
            <li key={candidate.id} className="text-meta">
              <span className="font-medium">{titleOf(candidate)}</span>
              <span className="text-late"> · {blockingTexts(candidate).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </>
    )}
    {plan.unstaged.length > 0 && (
      <>
        <p className="m-0 text-meta text-late">
          {plan.unstaged.length === 1 ? 'Um item aceito usa um nome que só existe num item não aceito. Aceite esse item ou edite o que usa o nome:' : `${plan.unstaged.length} itens aceitos usam nomes que só existem em itens não aceitos. Aceite esses itens ou edite os que usam os nomes:`}
        </p>
        <ul aria-label="Nomes não aceitos" className="m-0 flex list-none flex-col gap-1 p-0">
          {plan.unstaged.map(({ candidate, references }) => (
            <li key={candidate.id} className="text-meta">
              <span className="font-medium">{titleOf(candidate)}</span>
              <span className="text-late"> · {references.map(unstagedText).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </>
    )}
    <div className="flex flex-wrap items-center gap-2">
      <Confirmed label={plan.ready.length > 0 ? `Gravar ${plural(plan.ready.length, 'item', 'itens')}` : 'Gravar'} confirm="Confirmar gravação" disabled={busy || plan.ready.length === 0 || plan.blocked.length > 0 || plan.unstaged.length > 0} onConfirm={onCommit} />
    </div>
  </section>
)

export const CommittedCard = ({ batch, busy, onClose }: { batch: Batch; busy: boolean; onClose: () => void }) => (
  <section aria-labelledby="committed-title" className={cn(card, 'max-w-4xl border-ok/40')}>
    <h2 id="committed-title" className="m-0 text-section font-semibold">
      Gravada no livro
    </h2>
    <p className="m-0 text-meta">{plural(batch.committed, 'item gravado', 'itens gravados')}. Eles já aparecem nas telas do livro e na Atividade. Encerre a importação quando terminar de conferir.</p>
    <div className="flex flex-wrap items-center gap-2">
      <Link to="/lancamentos" className={buttonVariants({ variant: 'outline' })}>
        Ver lançamentos
      </Link>
      <Link to="/atividade" className={buttonVariants({ variant: 'ghost' })}>
        Ver atividade
      </Link>
      <Confirmed label="Encerrar" confirm="Confirmar encerramento" disabled={busy} onConfirm={onClose} />
    </div>
  </section>
)
