import { expect, test } from 'vitest'
import { ApiFailure } from '../query/client.ts'
import { acceptable, amountOf, blocked, type Candidate, checkText, commitFailure, commitPlan, detailsOf, groupCandidates, monthOfCandidate, reviewCounts, reviewFailure, titleOf, unstagedText } from './review-model.ts'

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

test('commit plan keeps accepted and edited items, blocked ones apart, and counts the rest', () => {
  const plan = commitPlan([{ ...rent, status: 'accepted' }, { ...pharmacy, status: 'edited' }, salary, { ...pets, status: 'rejected' }, { ...debt, status: 'edited', checks: [{ code: 'low_confidence', detail: '0.5' }] }])
  expect(plan.ready.map((item) => item.id)).toEqual(['1', '5'])
  expect(plan.blocked.map((item) => item.id)).toEqual(['2'])
  expect(plan.left).toBe(2)
})

test('commit plan lists accepted items naming what only an unaccepted item stages', () => {
  const ledger = { accounts: ['Conta conjunta'], categories: [{ name: 'Moradia', direction: 'expense' }], reserves: [] }
  const vet = candidate('6', 'entry', { date: '2026-10-12', description: 'Veterinário', direction: 'expense', amountCents: 20000, category: 'pets ', account: 'Cartão Novo', member: 'joint', paid: true }, { status: 'accepted' })
  const card = candidate('7', 'account', { nickname: 'Cartão Novo', institution: 'Banco Exemplo', kind: 'credit_card', member: 'joint' }, { status: 'rejected' })
  const savings = candidate('8', 'goal', { name: 'Viagem', targetCents: 500000, reserve: 'Férias' }, { status: 'edited' })
  const holidays = candidate('9', 'reserve', { name: 'Férias', balanceCents: 0 }, { status: 'accepted' })
  const incomePets = candidate('10', 'category', { name: 'Pets', kind: 'income' })
  const plan = commitPlan([{ ...rent, status: 'accepted', payload: { ...rent.payload, account: 'Conta conjunta' } }, vet, pets, incomePets, card, savings, holidays], ledger)
  expect(plan.unstaged.map(({ candidate, references }) => [candidate.id, references.map(unstagedText)])).toEqual([['6', ['Conta Cartão Novo está num item rejeitado', 'Categoria pets está num item pendente']]])
  expect(commitPlan([vet, pets, card]).unstaged).toEqual([])
  expect(commitPlan([vet, { ...pets, status: 'accepted' }, { ...card, status: 'edited' }], ledger).unstaged).toEqual([])
  expect(commitPlan([vet, pets, card], { ...ledger, accounts: ['cartão novo'], categories: [{ name: 'Pets', direction: 'expense' }] }).unstaged).toEqual([])
})

test('commit refusals become Portuguese', () => {
  const failure = (status: number, message: string) => commitFailure(new ApiFailure(status, message))
  expect(failure(422, 'candidates 2, 3 have failed checks; edit, answer or reject them first')).toBe('Há itens aceitos com bloqueio. Edite, responda ou rejeite antes de gravar.')
  expect(failure(422, 'import batch 7 has no accepted candidates')).toBe('Aceite ao menos um item antes de gravar.')
  expect(failure(422, 'import batch 7 is not open for review')).toBe('Esta importação não está mais em revisão. A página foi atualizada.')
  expect(failure(422, 'unknown account Conta Aves')).toBe('Conta Aves não existe no livro nem entre os itens aceitos. Aceite o item que cria esse nome ou edite os itens que o usam.')
  expect(failure(422, 'income Aluguel recebido needs a member')).toBe('A receita Aluguel recebido precisa de uma pessoa. Edite o item e escolha quem recebe.')
  expect(failure(401, 'x-member header required')).toBe('Escolha quem você é para gravar.')
  expect(commitFailure(new Error('network'))).toBe('Não foi possível gravar. Tente de novo.')
})
