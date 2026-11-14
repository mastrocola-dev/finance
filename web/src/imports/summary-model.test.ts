import { expect, test } from 'vitest'
import type { Batch } from './model.ts'
import { type Candidate, commitPlan, type Question } from './review-model.ts'
import { blockingQuestions, consolidationFailure, newCategories, reviewSummary, uncheckedText } from './summary-model.ts'

const candidate = (id: string, kind: Candidate['kind'], payload: Record<string, unknown>, changes: Partial<Candidate> = {}): Candidate => ({ id, kind, source: 'A1', chunk: null, confidence: '0.90', status: 'pending', acceptedByModel: false, payload, checks: [], recordId: null, ...changes })

const question = (id: string, candidateId: string | null, options: string[], answer: string | null = null): Question => ({ id, candidateId, question: `Pergunta ${id}?`, options, source: null, chunk: null, answer, decidedByModel: false })

const batch = (consolidation: Batch['consolidation']) => ({ consolidation }) as Batch

test('consolidation failures read in plain Portuguese', () => {
  expect(consolidationFailure(null)).toBeUndefined()
  expect(consolidationFailure('token cap')).toMatch(/^O limite de uso/)
  expect(consolidationFailure('invalid output: categories: Required')).toMatch(/fora do formato/)
  expect(consolidationFailure('service-agent exited with 1')).toBe('Não foi possível juntar as categorias novas. Elas ficaram como foram lidas.')
})

test('an unchecked subtotal names its category, month and amount', () => {
  expect(uncheckedText({ source: 'Out!B9', month: '2026-10-01', direction: 'expense', category: 'Farmácia', amountCents: 8990 })).toBe('Subtotal de Farmácia em outubro de 2026 (R$ 89,90) ficou sem conferência')
  expect(uncheckedText({})).toBe('Subtotal de categoria ficou sem conferência')
})

test('new categories leave rejected ones out and sort by name', () => {
  const found = newCategories([candidate('1', 'category', { name: 'Pets', kind: 'expense' }), candidate('2', 'category', { name: 'Bônus', kind: 'income' }), candidate('3', 'category', { name: 'Lixo', kind: 'expense' }, { status: 'rejected' }), candidate('4', 'entry', { description: 'Ração' })])
  expect(found).toEqual([
    { id: '2', name: 'Bônus', direction: 'receita' },
    { id: '1', name: 'Pets', direction: 'despesa' },
  ])
})

test('only questions without options or about a blocked item still block', () => {
  const items = [candidate('1', 'entry', { description: 'A' }, { checks: [{ code: 'unknown_member', detail: 'XY' }] }), candidate('2', 'entry', { description: 'B' })]
  const asked = [question('a', '1', ['Nova pessoa']), question('b', '2', ['Sim', 'Não']), question('c', null, []), question('d', '1', ['Sim'], 'Sim')]
  expect(blockingQuestions(asked, items).map((item) => item.id)).toEqual(['a', 'c'])
})

test('the summary counts ready items and those the Claude accepted', () => {
  const items = [
    candidate('1', 'entry', { description: 'A' }, { status: 'accepted', acceptedByModel: true }),
    candidate('2', 'entry', { description: 'B' }, { status: 'accepted' }),
    candidate('3', 'entry', { description: 'C' }),
    candidate('4', 'category', { name: 'Saúde', kind: 'expense' }, { status: 'accepted', acceptedByModel: true }),
  ]
  const merges = [{ name: 'Farmácia', kind: 'expense' as const, to: 'Saúde', candidates: 2 }]
  const summary = reviewSummary(batch({ merges, unchecked: [{ category: 'Farmácia' }], failure: null }), items, [], commitPlan(items))
  expect(summary).toEqual({ ready: 3, byModel: 2, waiting: 1, categories: [{ id: '4', name: 'Saúde', direction: 'despesa' }], merges, unchecked: ['Subtotal de Farmácia ficou sem conferência'], failure: undefined, blocking: 0, blocked: 0 })
})
