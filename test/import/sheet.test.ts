import assert from 'node:assert/strict'
import { test } from 'node:test'
import { entriesFromRows, readMonthSheet } from '../../src/import/sheet.ts'
import { RuleError } from '../../src/ledger/rule.ts'

const header = ['kind', 'description', 'category', 'account', 'member', 'due_on', 'amount']

test('reads a monthly sheet into ledger entries', async () => {
  const entries = await readMonthSheet('test/fixtures/2026-10-import.xlsx', '2026-10')
  assert.deepEqual(
    entries.map((entry) => [entry.direction, entry.description, entry.amount]),
    [
      ['income', 'Marcio salary', 950000n],
      ['income', 'Freelance design', 125050n],
      ['expense', 'Rent', 320000n],
      ['expense', 'Phone plan', 9990n],
      ['expense', 'Groceries', 81245n],
    ],
  )
  assert.deepEqual(entries[2], { month: '2026-10', dueOn: '2026-10-10', description: 'Rent', direction: 'expense', amount: 320000n, category: 'Housing', account: 'Joint checking', member: 'joint' })
})

test('maps fixed and variable kinds to expenses and skips blank rows', () => {
  const entries = entriesFromRows([header, ['fixed', 'Rent', 'Housing', '', 'joint', '2026-10-10', 100], [], ['variable', 'Fuel', 'Transport', '', 'Marcio', '2026-10-31', 50.5]], '2026-10')
  assert.deepEqual(
    entries.map((entry) => [entry.direction, entry.account, entry.amount]),
    [
      ['expense', undefined, 10000n],
      ['expense', undefined, 5050n],
    ],
  )
})

test('rejects a bad header, kind, date, amount or missing field with the line', () => {
  const base = ['income', 'Salary', 'Salary', '', 'Marcio', '2026-10-05', 100]
  const cases = [
    [[['kind', 'description'], base], 'header must be'],
    [[header, ['gift', 'Gift', 'Salary', '', 'Marcio', '2026-10-05', 100]], 'line 2: unknown kind gift'],
    [[header, ['income', 'Salary', 'Salary', '', 'Marcio', '2026-11-05', 100]], 'line 2: due_on 2026-11-05 is outside 2026-10'],
    [[header, ['income', 'Salary', 'Salary', '', 'Marcio', '2026-10-05', 'R$ 100']], 'line 2: amount must be a number'],
    [[header, ['income', 'Salary', 'Salary', '', 'Marcio', '2026-10-05', 1.005]], 'line 2: amount must be positive with up to 2 decimals'],
    [[header, ['income', 'Salary', '', '', 'Marcio', '2026-10-05', 100]], 'line 2: description, category and member are required'],
  ] as const
  for (const [rows, message] of cases) {
    assert.throws(
      () => entriesFromRows(rows as never, '2026-10'),
      (error) => error instanceof RuleError && error.message.includes(message),
    )
  }
})

test('rejects a month without a sheet in the workbook', async () => {
  await assert.rejects(readMonthSheet('test/fixtures/2026-10-import.xlsx', '2026-09'))
})

test('reads an optional installment column for fixed lines only', () => {
  const withInstallment = [...header, 'installment']
  const entries = entriesFromRows([withInstallment, ['fixed', 'Sofa', 'Home', '', 'joint', '2026-10-12', 450, 3], ['fixed', 'Gym', 'Leisure', '', 'Marcio', '2026-10-07', 150, '']], '2026-10')
  assert.deepEqual(
    entries.map((entry) => entry.installment),
    [3, undefined],
  )
  assert.throws(
    () => entriesFromRows([withInstallment, ['variable', 'Fuel', 'Transport', '', 'Marcio', '2026-10-31', 50, 2]], '2026-10'),
    (error) => error instanceof RuleError && error.message === 'line 2: installment is only for fixed lines',
  )
  assert.throws(
    () => entriesFromRows([withInstallment, ['fixed', 'Sofa', 'Home', '', 'joint', '2026-10-12', 450, 1.5]], '2026-10'),
    (error) => error instanceof RuleError && error.message === 'line 2: installment must be a positive whole number',
  )
})

test('checks a total row against the net of the lines', () => {
  const rows = [header, ['income', 'Salary', 'Salary', '', 'Marcio', '2026-10-05', 100], ['fixed', 'Rent', 'Housing', '', 'joint', '2026-10-10', 40]]
  assert.equal(entriesFromRows([...rows, ['total', '', '', '', '', '', 60]], '2026-10').length, 2)
  assert.throws(
    () => entriesFromRows([...rows, ['total', '', '', '', '', '', 59]], '2026-10'),
    (error) => error instanceof RuleError && error.message === 'line 4: total R$ 59,00 does not match the lines R$ 60,00',
  )
  assert.throws(
    () => entriesFromRows([...rows, ['total', '', '', '', '', '', 60], ['total', '', '', '', '', '', 60]], '2026-10'),
    (error) => error instanceof RuleError && error.message === 'line 5: only one total row is allowed',
  )
})
