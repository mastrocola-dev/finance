import { expect, test } from 'vitest'
import type { Entry } from '../overview/model.ts'
import { billMeta, billsOf, progressOf, stableOrder, withPayment } from './model.ts'

const bill = (id: string, description: string, state: Entry['state'], dueOn: string, cents: number, extra: Partial<Entry> = {}): Entry => ({
  id,
  competence: '2026-10-01',
  dueOn,
  description,
  direction: 'expense',
  amount: { cents: String(cents), brl: '' },
  category: 'Moradia',
  account: null,
  member: null,
  status: state === 'paid' ? 'paid' : 'planned',
  state,
  paidOn: state === 'paid' ? dueOn : null,
  installmentNumber: null,
  ...extra,
})

const rent = bill('1', 'Aluguel', 'paid', '2026-10-05', 380000)
const health = bill('2', 'Plano de saúde', 'late', '2026-10-15', 75000)
const card = bill('3', 'Fatura', 'pending', '2026-10-25', 241850, { member: 'Marcio', account: 'Marcio card' })
const school = bill('4', 'Escola', 'pending', '2026-10-20', 165000, { installmentNumber: 7 })
const salary = bill('5', 'Salário', 'pending', '2026-10-05', 900000, { direction: 'income' })

test('lists expenses late first, then open by due date, then paid', () => {
  expect(billsOf([rent, card, salary, school, health]).map(({ id }) => id)).toEqual(['2', '4', '3', '1'])
})

test('counts paid bills and sums what is still open', () => {
  expect(progressOf([rent, health, card])).toEqual({ paidCount: 1, count: 3, open: 316850n, percent: 33 })
  expect(progressOf([])).toEqual({ paidCount: 0, count: 0, open: 0n, percent: 0 })
})

test('describes when, who, account and installment', () => {
  expect(billMeta(rent)).toBe('pago 05/10 · Conjunto')
  expect(billMeta(health)).toBe('Atrasada · venceu 15/10 · Conjunto')
  expect(billMeta(card)).toBe('vence 25/10 · Marcio · Marcio card')
  expect(billMeta(school)).toBe('vence 20/10 · Conjunto · parcela 7')
})

test('applies a payment mark and its undo with the derived state', () => {
  expect(withPayment(health, true, '2026-10-21')).toMatchObject({ status: 'paid', state: 'paid', paidOn: '2026-10-21' })
  expect(withPayment(rent, false, '2026-10-21')).toMatchObject({ status: 'planned', state: 'late', paidOn: null })
  expect(withPayment(card, false, '2026-10-21')).toMatchObject({ status: 'planned', state: 'pending', paidOn: null })
})

test('keeps the order while the same bills come back', () => {
  const first = stableOrder([], [health, rent])
  expect(first).toEqual(['2', '1'])
  expect(stableOrder(first, [rent, health])).toBe(first)
  expect(stableOrder(first, [rent, health, card])).toEqual(['1', '2', '3'])
})
