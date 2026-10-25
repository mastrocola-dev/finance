import { expect, test } from 'vitest'
import { ApiFailure } from '../query/client.ts'
import { acceptable, amountOf, blocked, type Candidate, checkText, detailsOf, groupCandidates, monthOfCandidate, reviewCounts, reviewFailure, titleOf } from './review-model.ts'

const candidate = (id: string, kind: Candidate['kind'], payload: Record<string, unknown>, changes: Partial<Candidate> = {}): Candidate => ({ id, kind, source: 'A1', chunk: null, confidence: '0.90', status: 'pending', payload, checks: [], recordId: null, ...changes })

const rent = candidate('1', 'entry', { date: '2026-10-10', description: 'Aluguel', direction: 'expense', amountCents: 150000, category: 'Moradia', member: 'joint', paid: true })
const pharmacy = candidate('2', 'entry', { date: '2026-10-15', description: 'Farmácia', direction: 'expense', amountCents: 8990, category: 'Saúde', member: 'GMA', paid: false, installment: { number: 2, total: 3 } }, { checks: [{ code: 'unknown_member', detail: 'GMA' }] })
const salary = candidate('3', 'entry', { date: '2026-09-05', description: 'Salário', direction: 'income', amountCents: 900000, category: 'Salário', paid: true })
const pets = candidate('4', 'category', { name: 'Pets', kind: 'expense' })
const debt = candidate('5', 'debt', { creditor: 'Financeira Exemplo', description: 'Carro', principalCents: 3000000, balanceCents: 1800000, installmentsTotal: 24, installmentsPaid: 10, startsOn: '2025-12-01' })

test('groups by kind and month, blocked groups and items first', () => {
  const groups = groupCandidates([rent, salary, pets, debt, pharmacy])
  expect(groups.map((group) => group.title)).toEqual(['Lançamentos · outubro de 2026', 'Lançamentos · setembro de 2026', 'Dívidas · dezembro de 2025', 'Categorias'])
  expect(groups[0]?.candidates.map((item) => item.id)).toEqual(['2', '1'])
})

test('only pending items without blocking checks are acceptable in bulk', () => {
  const [october] = groupCandidates([rent, pharmacy, candidate('6', 'entry', { date: '2026-10-01', description: 'Luz', direction: 'expense', amountCents: 100, category: 'Casa', paid: false }, { status: 'accepted' })])
  expect(october && acceptable(october)).toEqual(['1'])
  expect(blocked(pharmacy)).toBe(true)
  expect(blocked({ ...pharmacy, status: 'rejected' })).toBe(false)
  expect(blocked(candidate('7', 'account', {}, { checks: [{ code: 'duplicate_in_ledger', detail: 'account 3' }] }))).toBe(true)
  expect(blocked({ ...rent, checks: [{ code: 'duplicate_in_ledger', detail: 'entry 3' }] })).toBe(false)
})

test('describes candidates of every shape, including invalid payloads', () => {
  expect(titleOf(debt)).toBe('Financeira Exemplo · Carro')
  expect(titleOf(pets)).toBe('Pets')
  expect(titleOf(candidate('8', 'entry', {}))).toBe('Sem descrição')
  expect(amountOf(salary)).toEqual({ text: 'R$ 9.000,00', income: true })
  expect(amountOf(debt)?.text).toBe('R$ 18.000,00')
  expect(amountOf(pets)).toBeUndefined()
  expect(detailsOf(pharmacy)).toEqual(['15/10', 'Despesa', 'Saúde', 'GMA', '2/3'])
  expect(detailsOf(rent)).toEqual(['10/10', 'Despesa', 'Moradia', 'Conjunto', 'Pago'])
  expect(detailsOf(debt)).toEqual(['10/24 parcelas'])
  expect(monthOfCandidate(candidate('9', 'entry', { date: 'ontem' }))).toBeUndefined()
})

test('explains checks in Portuguese', () => {
  expect(checkText({ code: 'unknown_member', detail: 'GMA' })).toBe('Pessoa desconhecida: GMA')
  expect(checkText({ code: 'low_confidence', detail: '0.60' })).toBe('Leitura incerta (60%)')
  expect(checkText({ code: 'duplicate_in_ledger', detail: 'entry 4' })).toBe('Já existe no livro')
  expect(checkText({ code: 'total_mismatch', detail: 'Outubro!G40: expense 2026-10 expected 158990, found 150000' })).toBe('Total de Outubro!G40 não confere: impresso R$ 1.589,90, lido R$ 1.500,00')
  expect(checkText({ code: 'total_mismatch', detail: 'Outubro!A40:G40: net 2026-10 expected -100, found 0' })).toBe('Total de Outubro!A40:G40 não confere: impresso -R$ 1,00, lido R$ 0,00')
})

test('counts review state and maps failures', () => {
  expect(reviewCounts([rent, pharmacy, { ...salary, status: 'edited' }, { ...pets, status: 'rejected' }])).toEqual({ pending: 2, accepted: 1, rejected: 1, blocked: 1 })
  expect(reviewFailure(new ApiFailure(422, 'candidate 2 has an invalid payload; edit it first'))).toBe('Este item tem dados incompletos. Corrija antes de aceitar.')
  expect(reviewFailure(new ApiFailure(409, 'import batch 1 is still extracting'))).toBe('A importação ainda está sendo lida. Espere terminar.')
  expect(reviewFailure(new Error('offline'))).toBe('Não foi possível salvar. Tente de novo.')
})
