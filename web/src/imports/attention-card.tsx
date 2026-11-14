import { cn } from '../lib/utils.ts'
import { card } from './group-card.tsx'
import type { Batch } from './model.ts'
import { QuestionCard } from './question-card.tsx'
import { checkText, type Question } from './review-model.ts'

type Props = { checks: Batch['checks']; questions: Question[]; titles: Map<string, string>; busy: boolean; onAnswer: (question: Question, answer: string) => void }

export const AttentionCard = ({ checks, questions, titles, busy, onAnswer }: Props) => {
  if (questions.length === 0 && checks.length === 0) return null
  return (
    <section aria-labelledby="attention-title" className={cn(card, 'border-accent/40')}>
      <h2 id="attention-title" className="m-0 text-section font-semibold">
        Precisa de vocês
      </h2>
      {checks.length > 0 && (
        <ul aria-label="Alertas do arquivo" className="m-0 flex list-none flex-col gap-1 p-0">
          {checks.map((check) => (
            <li key={`${check.code}-${check.detail ?? ''}`} className="text-meta text-late">
              {checkText(check)}
            </li>
          ))}
        </ul>
      )}
      {questions.some((question) => question.options.length > 0) && <p className="m-0 text-meta text-muted">Sem resposta, o modelo escolhe a primeira opção ao importar, mas ela não resolve o item.</p>}
      {questions.length > 0 && (
        <ul aria-label="Perguntas" className="m-0 flex list-none flex-col gap-2.5 p-0">
          {questions.map((question) => (
            <QuestionCard key={question.id} question={question} about={question.candidateId ? titles.get(question.candidateId) : undefined} busy={busy} onAnswer={(text) => onAnswer(question, text)} />
          ))}
        </ul>
      )}
    </section>
  )
}
