import { expect, test } from 'vitest'
import { categories, change, type Entry, flow, flowSummary, overview, percentOf } from './model.ts'

const entry = (id: string, direction: Entry['direction'], category: string, cents: number, state: Entry['state'], dueOn = '2026-10-10'): Entry => ({
  id,
  competence: '2026-10-01',
  dueOn,
  description: `${category} ${id}`,
  direction,
  amount: { cents: String(cents), brl: '' },
  category,
  account: null,
  member: null,
  status: state === 'paid' ? 'paid' : 'planned',
  state,
  paidOn: state === 'paid' ? dueOn : null,
  installmentNumber: null,
  installmentsTotal: null,
  origin: 'manual',
})

const month = [
  entry('1', 'income', 'Salário', 1_000_000, 'paid'),
  entry('2', 'income', 'Salário', 500_000, 'pending'),
  entry('3', 'expense', 'Moradia', 300_000, 'paid'),
  entry('4', 'expense', 'Saúde', 75_000, 'late', '2026-10-15'),
  entry('5', 'expense', 'Alimentação', 120_000, 'pending', '2026-10-25'),
  entry('6', 'expense', 'Alimentação', 30_000, 'pending', '2026-10-05'),
]

test('overview totals the month and lists open bills late first, then by due date', () => {
  const data = overview(month)
  expect(data.balance).toBe(975_000n)
  expect(data.income).toEqual({ total: 1_500_000n, received: 1_000_000n, count: 2, receivedCount: 1 })
  expect(data.expenses).toEqual({ total: 525_000n, paid: 300_000n, pending: 150_000n, late: 75_000n, count: 4, paidCount: 1 })
  expect(data.open).toBe(225_000n)
  expect(data.due.map(({ id }) => id)).toEqual(['4', '6', '5'])
})

test('categories sum expenses, compare with the previous month and scale to the largest', () => {
  const previous = [entry('7', 'expense', 'Moradia', 300_000, 'paid'), entry('8', 'expense', 'Alimentação', 100_000, 'paid')]
  expect(categories(month, previous)).toEqual([
    { name: 'Moradia', cents: 300_000n, previous: 300_000n, share: 100 },
    { name: 'Alimentação', cents: 150_000n, previous: 100_000n, share: 50 },
    { name: 'Saúde', cents: 75_000n, previous: 0n, share: 25 },
  ])
})

test('change is undefined without a previous amount and percentOf guards a zero whole', () => {
  expect(change(150n, 100n)).toBe(50)
  expect(change(94n, 100n)).toBe(-6)
  expect(change(10n, 0n)).toBeUndefined()
  expect(percentOf(1n, 3n)).toBe(33.3)
  expect(percentOf(5n, 0n)).toBe(0)
})

test('flow totals income, expenses and net per month and summarizes the ranges', () => {
  const months = flow([
    { month: '2026-09', entries: [entry('1', 'income', 'Salário', 2_140_000, 'paid'), entry('2', 'expense', 'Moradia', 1_740_000, 'paid')] },
    { month: '2026-10', entries: [entry('3', 'income', 'Salário', 2_220_000, 'paid'), entry('4', 'expense', 'Moradia', 1_490_000, 'pending'), entry('5', 'expense', 'Saúde', 80_000, 'late')] },
    { month: '2026-11', entries: [] },
  ])
  expect(months).toEqual([
    { month: '2026-09', income: 2_140_000n, expenses: 1_740_000n, net: 400_000n },
    { month: '2026-10', income: 2_220_000n, expenses: 1_570_000n, net: 650_000n },
    { month: '2026-11', income: 0n, expenses: 0n, net: 0n },
  ])
  expect(flowSummary(months.slice(0, 2))).toBe('Receitas entre R$ 21,4 mil e R$ 22,2 mil; despesas entre R$ 15,7 mil e R$ 17,4 mil')
})
