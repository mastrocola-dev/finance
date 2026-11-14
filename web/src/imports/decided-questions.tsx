import { ChevronRight } from 'lucide-react'
import { chip } from '../decisions/decision-card.tsx'
import { cn } from '../lib/utils.ts'
import { plural } from './model.ts'
import type { Question } from './review-model.ts'

type Props = { questions: Question[]; titles?: Map<string, string>; className?: string }

export const DecidedQuestions = ({ questions, titles, className }: Props) => {
  const decided = questions.filter((question) => question.decidedByModel)
  if (decided.length === 0) return null
  return (
    <section aria-labelledby="decided-title" className={cn('flex min-w-0 flex-col rounded-card border bg-surface px-4 py-3 md:px-6 md:py-4', className)}>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 md:min-h-0 [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted group-open:rotate-90" />
          <h2 id="decided-title" className="m-0 text-section font-semibold">
            Decididas pelo modelo
          </h2>
          <span className="text-xs text-muted">{plural(decided.length, 'pergunta', 'perguntas')}</span>
        </summary>
        <ul aria-label="Perguntas decididas pelo modelo" className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
          {decided.map((question) => {
            const about = [question.candidateId && titles?.get(question.candidateId), question.source && `Origem ${question.source}`].filter(Boolean).join(' · ')
            return (
              <li key={question.id} className="flex flex-col gap-1 rounded-field border p-3.5">
                <span className="font-medium">{question.question}</span>
                <span className="flex flex-wrap items-center gap-2 text-meta">
                  <span>Resposta: {question.answer}</span>
                  <span className={cn(chip, 'bg-claude-soft text-claude')}>decidido pelo modelo</span>
                </span>
                {about && <span className="text-xs text-muted">{about}</span>}
              </li>
            )
          })}
        </ul>
      </details>
    </section>
  )
}
