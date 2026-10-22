import { expect, test } from 'vitest'
import { dueOnFor, lastDayOf, paidByDefault, parseBrl, quickEntry, toNewEntry } from './quick-add.ts'

test('parses amounts typed in BRL into cents', () => {
  expect(['R$ 84,90', '84,9', '1.234,56', '1234,56', '84.90', '84', ' 1.000 '].map(parseBrl)).toEqual([8490n, 8490n, 123456n, 123456n, 8490n, 8400n, 100000n])
  expect(['', 'abc', '1,234', '12.3456', '-5', '1.23,4'].map(parseBrl)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
})

test('dates the entry today in the current month, else on the first day', () => {
  expect(dueOnFor('2026-10', '2026-10-21')).toBe('2026-10-21')
  expect(dueOnFor('2026-11', '2026-10-21')).toBe('2026-11-01')
})

test('finds the last day of a month', () => {
  expect(['2026-10', '2026-11', '2026-02', '2028-02'].map(lastDayOf)).toEqual(['2026-10-31', '2026-11-30', '2026-02-28', '2028-02-29'])
})

test('takes today or earlier as already paid', () => {
  expect(['2026-10-01', '2026-10-21', '2026-10-22'].map((date) => paidByDefault(date, '2026-10-21'))).toEqual([true, true, false])
})

const values = { direction: 'expense' as const, description: ' Farmácia ', amount: 'R$ 84,90', category: 'Health', account: '', member: 'joint', date: '2026-10-21', paid: true }

test('validates and maps the form to the API body', () => {
  const schema = quickEntry('2026-10', '2026-10-21')
  expect(schema.safeParse(values).success).toBe(true)
  expect(toNewEntry(values, '2026-10')).toEqual({ month: '2026-10', due_on: '2026-10-21', description: 'Farmácia', direction: 'expense', amount_cents: 8490, category: 'Health', account: undefined, member: 'joint', paid_on: '2026-10-21' })
  expect(toNewEntry({ ...values, paid: false }, '2026-10').paid_on).toBeUndefined()
  const issues = schema.safeParse({ ...values, description: ' ', amount: '0,00', category: '' }).error?.issues.map(({ path }) => path[0])
  expect(issues).toEqual(['description', 'amount', 'category'])
})

test('keeps the date inside the month and refuses a future date as paid', () => {
  const schema = quickEntry('2026-10', '2026-10-21')
  const issues = (date: string, paid: boolean) => schema.safeParse({ ...values, date, paid }).error?.issues.map(({ path, message }) => `${String(path[0])}: ${message}`)
  expect(issues('2026-09-30', false)).toEqual(['date: Escolha uma data deste mês.'])
  expect(issues('2026-11-01', false)).toEqual(['date: Escolha uma data deste mês.'])
  expect(issues('', false)).toEqual(['date: Escolha uma data deste mês.'])
  expect(issues('2026-10-25', true)).toEqual(['paid: Uma data futura ainda não pode estar paga.'])
  expect(issues('2026-10-25', false)).toBeUndefined()
})
