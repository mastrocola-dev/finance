import { Button } from '../components/ui/button.tsx'
import { formatBrl } from '../lib/format.ts'
import { recordProps } from '../lib/record.tsx'
import { cn } from '../lib/utils.ts'
import { type Answer, answersFor, type Decision, peopleOf, proposalMeta } from './model.ts'

export const chip = 'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold'

const labels: Record<Answer, string> = { confirm: 'Confirmar', reject: 'Rejeitar', withdraw: 'Retirar proposta' }

type Props = { decision: Decision; members: string[]; member: string | undefined; busy: boolean; hash: string; onAnswer: (answer: Answer) => void }

export const DecisionCard = ({ decision, members, member, busy, hash, onAnswer }: Props) => {
  const answers = answersFor(decision, member)
  const titleId = `decision-title-${decision.id}`
  return (
    <article aria-labelledby={titleId} {...recordProps(`decision-${decision.id}`, hash)} className={cn('flex flex-col gap-3 rounded-hero border bg-surface p-4 md:p-5', 'aria-[current=true]:border-accent aria-[current=true]:bg-accent-soft')}>
      <div className="flex flex-wrap gap-1.5">
        <span className={cn(chip, 'bg-pending-soft text-pending')}>Proposta</span>
        {decision.origin === 'claude' && <span className={cn(chip, 'bg-claude-soft text-claude')}>via Claude</span>}
      </div>
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="m-0 text-base font-semibold">
          {decision.title}
        </h2>
        {decision.amount && <span className="amount text-[15px]">{formatBrl(decision.amount.cents)}</span>}
        {decision.description && <p className="m-0 mt-1 text-meta leading-[1.45] text-muted">{decision.description}</p>}
      </div>
      <ul aria-label="Confirmações" className="m-0 flex list-none flex-col gap-1.5 rounded-field bg-sunken px-3 py-2.5">
        {peopleOf(decision, members).map((person) => (
          <li key={person.name} className="flex items-center gap-2.5 text-meta">
            <span aria-hidden="true" className={cn('flex size-6 items-center justify-center rounded-full text-[11px] font-bold', person.confirmed ? 'bg-ok text-surface' : 'border text-muted')}>
              {person.name.charAt(0)}
            </span>
            <span>{person.name}</span>
            <span className={cn('ml-auto', person.confirmed ? 'text-ok' : 'text-muted')}>{person.confirmed ? 'Confirmou' : 'Aguardando'}</span>
          </li>
        ))}
      </ul>
      {answers.length > 0 ? (
        <div className="flex gap-2">
          {answers.map((answer) => (
            <Button key={answer} variant={answer === 'confirm' ? 'primary' : 'outline'} disabled={busy} className={cn('flex-1', answer !== 'confirm' && 'font-normal')} aria-describedby={titleId} onClick={() => onAnswer(answer)}>
              {labels[answer]}
            </Button>
          ))}
        </div>
      ) : (
        !member && <p className="m-0 text-meta text-muted">Escolha quem você é para responder.</p>
      )}
      <span className="text-xs text-muted">{proposalMeta(decision)}</span>
    </article>
  )
}
