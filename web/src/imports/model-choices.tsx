import { ChevronRight } from 'lucide-react'
import { plural } from './model.ts'
import { QuestionCard } from './question-card.tsx'
import type { Question } from './review-model.ts'

type Props = { questions: Question[]; titles: Map<string, string>; busy: boolean; onAnswer: (question: Question, answer: string) => void }

export const ModelChoices = ({ questions, titles, busy, onAnswer }: Props) => {
  if (questions.length === 0) return null
  return (
    <section aria-labelledby="choices-title" className="flex min-w-0 flex-col rounded-card border bg-surface px-4 py-3 md:px-6 md:py-4">
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 md:min-h-0 [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted group-open:rotate-90" />
          <h2 id="choices-title" className="m-0 text-section font-semibold">
            Escolhas do Claude
          </h2>
          <span className="text-xs text-muted">{plural(questions.length, 'pergunta', 'perguntas')}</span>
        </summary>
        <div className="mt-3 flex flex-col gap-2.5">
          <p className="m-0 text-meta text-muted">Sem resposta, o modelo escolhe a primeira opção ao importar. Responda para mudar a escolha.</p>
          <ul aria-label="Escolhas do Claude" className="m-0 flex list-none flex-col gap-2.5 p-0">
            {questions.map((question) => (
              <QuestionCard key={question.id} question={question} choice={question.options[0]} about={question.candidateId ? titles.get(question.candidateId) : undefined} busy={busy} onAnswer={(text) => onAnswer(question, text)} />
            ))}
          </ul>
        </div>
      </details>
    </section>
  )
}
