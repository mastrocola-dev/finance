import { useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import type { Question } from './review-model.ts'

type Props = { question: Question; about?: string; busy: boolean; onAnswer: (answer: string) => void }

export const QuestionCard = ({ question, about, busy, onAnswer }: Props) => {
  const [other, setOther] = useState('')
  const titleId = `question-title-${question.id}`
  return (
    <li aria-labelledby={titleId} className="flex flex-col gap-2.5 rounded-field border bg-surface p-3.5">
      <div className="flex flex-col gap-0.5">
        <span id={titleId} className="font-medium">
          {question.question}
        </span>
        <span className="text-xs text-muted">{[about, question.source && `Origem ${question.source}`].filter(Boolean).join(' · ')}</span>
      </div>
      {question.answer !== null ? (
        <span className="text-meta text-ok">Respondida: {question.answer}</span>
      ) : (
        <>
          {question.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {question.options.map((option) => (
                <Button key={option} variant="outline" disabled={busy} aria-describedby={titleId} onClick={() => onAnswer(option)}>
                  {option}
                </Button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (other.trim()) onAnswer(other.trim())
            }}
          >
            <label htmlFor={`answer-${question.id}`} className="sr-only">
              Outra resposta para {question.question}
            </label>
            <input id={`answer-${question.id}`} value={other} maxLength={200} onChange={(event) => setOther(event.target.value)} placeholder="Outra resposta" className="min-h-11 min-w-0 flex-1 rounded-field border bg-surface px-3 md:min-h-10" />
            <Button type="submit" variant="ghost" disabled={busy || !other.trim()} aria-describedby={titleId}>
              Responder
            </Button>
          </form>
        </>
      )}
    </li>
  )
}
