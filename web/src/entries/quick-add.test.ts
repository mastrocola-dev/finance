import { expect, test } from 'vitest'
import { dueOnFor, parseBrl, quickEntry, toNewEntry } from './quick-add.ts'

test('parses amounts typed in BRL into cents', () => {
  expect(['R$ 84,90', '84,9', '1.234,56', '1234,56', '84.90', '84', ' 1.000 '].map(parseBrl)).toEqual([8490n, 8490n, 123456n, 123456n, 8490n, 8400n, 100000n])
  expect(['', 'abc', '1,234', '12.3456', '-5', '1.23,4'].map(parseBrl)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
})

test('dates the entry today in the current month, else on the first day', () => {
  expect(dueOnFor('2026-10', '2026-10-21')).toBe('2026-10-21')
  expect(dueOnFor('2026-11', '2026-10-21')).toBe('2026-11-01')
})

test('validates and maps the form to the API body', () => {
  const values = { direction: 'expense' as const, description: ' Farmácia ', amount: 'R$ 84,90', category: 'Health', account: '', member: 'joint' }
  expect(quickEntry.safeParse(values).success).toBe(true)
  expect(toNewEntry(values, '2026-10', '2026-10-21')).toEqual({ month: '2026-10', due_on: '2026-10-21', description: 'Farmácia', direction: 'expense', amount_cents: 8490, category: 'Health', account: undefined, member: 'joint' })
  const issues = quickEntry.safeParse({ ...values, description: ' ', amount: '0,00', category: '' }).error?.issues.map(({ path }) => path[0])
  expect(issues).toEqual(['description', 'amount', 'category'])
})
