import { formatBrl, formatMonth } from '../lib/format.ts'
import type { Batch } from './model.ts'
import { blocked, type Candidate, type CommitPlan, pendingChoice, type Question } from './review-model.ts'

const directions: Record<string, string> = { income: 'receita', expense: 'despesa' }

const failures: [RegExp, string][] = [
  [/^token cap$/, 'O limite de uso desta importação acabou antes de juntar as categorias novas. Elas ficaram como o Claude leu.'],
  [/^invalid output/, 'O Claude respondeu fora do formato ao juntar as categorias novas. Elas ficaram como foram lidas.'],
]

export const consolidationFailure = (failure: string | null) => (failure === null ? undefined : (failures.find(([pattern]) => pattern.test(failure))?.[1] ?? 'Não foi possível juntar as categorias novas. Elas ficaram como foram lidas.'))

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

export const uncheckedText = (total: Record<string, unknown>) => {
  const category = text(total.category) ?? 'categoria'
  const month = text(total.month)
  const amount = typeof total.amountCents === 'number' ? ` (${formatBrl(String(total.amountCents))})` : ''
  return `Subtotal de ${category}${month ? ` em ${formatMonth(month)}` : ''}${amount} ficou sem conferência`
}

export const newCategories = (candidates: Candidate[]) =>
  candidates
    .filter((candidate) => candidate.kind === 'category' && candidate.status !== 'rejected' && text(candidate.payload.name))
    .map((candidate) => ({ id: candidate.id, name: String(candidate.payload.name).trim(), direction: directions[String(candidate.payload.kind)] ?? 'despesa' }))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))

export const blockingQuestions = (questions: Question[], candidates: Candidate[]) => {
  const stuck = new Set(candidates.filter(blocked).map((candidate) => candidate.id))
  return questions.filter((question) => question.answer === null && (!pendingChoice(question) || (question.candidateId !== null && stuck.has(question.candidateId))))
}

export const reviewSummary = (batch: Batch, candidates: Candidate[], questions: Question[], plan: CommitPlan) => ({
  ready: plan.ready.length,
  byModel: plan.ready.filter((candidate) => candidate.acceptedByModel).length,
  waiting: candidates.filter((candidate) => candidate.status === 'pending').length,
  categories: newCategories(candidates),
  merges: batch.consolidation.merges,
  unchecked: batch.consolidation.unchecked.map(uncheckedText),
  failure: consolidationFailure(batch.consolidation.failure),
  blocking: blockingQuestions(questions, candidates).length,
  blocked: candidates.filter(blocked).length,
})

export type ReviewSummary = ReturnType<typeof reviewSummary>
