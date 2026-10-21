import { expect, test } from 'vitest'
import { type Debt, debtView, formatSignedBrl, type Goal, goalView, monthlyInstallments, monthsUntil, perMonth, type Reserve, reserveView, ticksOf } from './model.ts'

const money = (cents: number) => ({ cents: String(cents), brl: '' })

const debt = (overrides: Partial<Debt> = {}): Debt => ({
  id: '1',
  creditor: 'Financeira Exemplo',
  description: 'Financiamento do carro',
  member: null,
  account: 'Conjunta',
  principal: money(4800000),
  balance: money(3120000),
  monthlyRatePercent: '1.2900',
  installment: money(130000),
  installmentsTotal: 48,
  installmentsPaid: 24,
  installmentsRemaining: 24,
  startsOn: '2024-11-01',
  nextDueOn: '2026-11-12',
  ...overrides,
})

const goal = (overrides: Partial<Goal> = {}): Goal => ({ id: '1', name: 'Viagem', reserve: null, target: money(1200000), saved: money(450000), missing: money(750000), progressPercent: '37.5', dueOn: '2027-07-01', ...overrides })

const reserve = (overrides: Partial<Reserve> = {}): Reserve => ({ id: '1', name: 'Emergência', account: 'Poupança', balance: money(1800000), target: money(3000000), missing: money(1200000), progressPercent: '60.0', ...overrides })

test('marks paid installments, the next one and the open rest', () => {
  expect(ticksOf(4, 1).map((tick) => tick.state)).toEqual(['paid', 'next', 'open', 'open'])
  expect(ticksOf(2, 2)).toEqual([
    { number: 1, state: 'paid' },
    { number: 2, state: 'paid' },
  ])
})

test('describes a debt with progress, next due date, installment and rate', () => {
  const view = debtView(debt())
  expect(view).toMatchObject({ name: 'Financiamento do carro', balance: 'R$ 31.200,00', columns: 48, label: '24 de 48 parcelas pagas', progress: '24 de 48 pagas · próxima 12/11', meta: 'R$ 1.300,00 · 1,29% a.m. · Financeira Exemplo' })
  expect(view.ticks.filter((tick) => tick.state === 'paid')).toHaveLength(24)
})

test('describes a debt without installment plan', () => {
  const view = debtView(debt({ installmentsTotal: null, installmentsRemaining: null, installment: null, monthlyRatePercent: null, nextDueOn: null, installmentsPaid: 0 }))
  expect(view).toMatchObject({ ticks: [], progress: '0 pagas', meta: 'Financeira Exemplo' })
})

test('sums installments of debts still running', () => {
  expect(monthlyInstallments([debt(), debt({ installment: money(112000) }), debt({ installmentsRemaining: 0 })])).toBe(242000n)
})

test('signs net worth with a minus sign apart from the currency', () => {
  expect(formatSignedBrl(-1430000n)).toBe('− R$ 14.300,00')
  expect(formatSignedBrl(5n)).toBe('R$ 0,05')
})

test('spreads what is missing over the months left, rounding up', () => {
  expect(monthsUntil('2027-07-01', '2026-10-21')).toBe(9)
  expect(perMonth(750000n, 9)).toBe(83334n)
  expect(goalView(goal(), '2026-10-21')).toMatchObject({ percent: 37, tone: 'accent', value: 'R$ 4.500,00 de R$ 12.000,00', meta: 'prazo jul/2027 · faltam R$ 833,34/mês' })
})

test('shows the whole amount missing once the goal is due', () => {
  expect(goalView(goal({ reserve: 'Emergência' }), '2027-08-02').meta).toBe('em Emergência · prazo jul/2027 · faltam R$ 7.500,00')
  expect(goalView(goal({ missing: money(0), progressPercent: '100.0' }), '2026-10-21')).toMatchObject({ percent: 100, meta: 'prazo jul/2027 · meta atingida' })
})

test('describes reserves with or without target', () => {
  expect(reserveView(reserve())).toMatchObject({ percent: 60, tone: 'ok', value: 'R$ 18.000,00 de R$ 30.000,00', meta: 'Poupança · faltam R$ 12.000,00' })
  expect(reserveView(reserve({ target: null, missing: null, progressPercent: null, account: null }))).toMatchObject({ percent: 0, value: 'R$ 18.000,00', meta: 'sem meta' })
})
