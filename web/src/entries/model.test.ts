import { expect, test } from 'vitest'
import type { Entry } from '../overview/model.ts'
import { categoriesOf, filterEntries, installmentOf, isFiltered, matches, noFilters, openLabel, signedAmount, stateLabel, totalsOf } from './model.ts'

const entry = (id: string, description: string, overrides: Partial<Entry> = {}): Entry => ({
  id,
  competence: '2026-10-01',
  dueOn: '2026-10-10',
  description,
  direction: 'expense',
  amount: { cents: '8490', brl: 'R$ 84,90' },
  category: 'Saúde',
  account: 'Nubank',
  member: null,
  status: 'planned',
  state: 'pending',
  paidOn: null,
  installmentNumber: null,
  installmentsTotal: null,
  origin: 'manual',
  ...overrides,
})

const pharmacy = entry('1', 'Farmácia', { state: 'paid', status: 'paid', paidOn: '2026-10-10' })
const salary = entry('2', 'Salário', { direction: 'income', category: 'Salário', member: 'Marcio', dueOn: '2026-10-05', amount: { cents: '1240000', brl: 'R$ 12.400,00' }, state: 'paid', origin: 'forecast' })
const car = entry('3', 'Financiamento do carro', { category: 'Dívidas', dueOn: '2026-10-28', amount: { cents: '150000', brl: 'R$ 1.500,00' }, installmentNumber: 18, installmentsTotal: 48 })
const health = entry('4', 'Plano de saúde', { dueOn: '2026-10-15', state: 'late', amount: { cents: '75000', brl: 'R$ 750,00' } })
const all = [pharmacy, salary, car, health]

test('searches description, category and member without accents or case', () => {
  expect(matches(pharmacy, 'farmacia')).toBe(true)
  expect(matches(health, 'SAUDE')).toBe(true)
  expect(matches(salary, 'marcio')).toBe(true)
  expect(matches(pharmacy, 'conjunto')).toBe(true)
  expect(matches(salary, 'conjunto')).toBe(false)
  expect(matches(car, '  ')).toBe(true)
})

test('searches amounts typed with or without separators', () => {
  expect(matches(pharmacy, '84,90')).toBe(true)
  expect(matches(salary, 'R$ 12.400')).toBe(true)
  expect(matches(car, '84,90')).toBe(false)
})

test('filters by direction, category and open state, newest due date first', () => {
  expect(filterEntries(all, noFilters).map(({ id }) => id)).toEqual(['3', '4', '1', '2'])
  expect(filterEntries(all, { ...noFilters, direction: 'income' }).map(({ id }) => id)).toEqual(['2'])
  expect(filterEntries(all, { ...noFilters, category: 'Saúde', open: true }).map(({ id }) => id)).toEqual(['4'])
  expect(isFiltered(noFilters)).toBe(false)
  expect(isFiltered({ ...noFilters, text: 'x' })).toBe(true)
})

test('sums income and expenses in cents and lists categories once', () => {
  expect(totalsOf(all)).toEqual({ income: 1240000n, expense: 233490n })
  expect(categoriesOf(all)).toEqual(['Dívidas', 'Salário', 'Saúde'])
})

test('labels state, installments and signed amounts in Portuguese', () => {
  expect([pharmacy, salary, car, health].map(stateLabel)).toEqual(['Paga', 'Recebida', 'Pendente', 'Atrasada'])
  expect([salary, { ...salary, state: 'pending' as const }, { ...salary, state: 'late' as const }].map(stateLabel)).toEqual(['Recebida', 'A receber', 'Recebimento atrasado'])
  expect([openLabel(), openLabel('expense'), openLabel('income')]).toEqual(['Pendentes e atrasadas', 'Pendentes e atrasadas', 'A receber e atrasadas'])
  expect(installmentOf(car)).toBe('18/48')
  expect(installmentOf({ ...car, installmentsTotal: null })).toBe('parcela 18')
  expect(installmentOf(pharmacy)).toBeUndefined()
  expect([signedAmount(salary), signedAmount(pharmacy)]).toEqual(['+ R$ 12.400,00', '− R$ 84,90'])
})
