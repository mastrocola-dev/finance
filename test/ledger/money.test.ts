import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatBrl, money } from '../../src/ledger/money.ts'

test('formats cents as BRL', () => {
  assert.equal(formatBrl(0n), 'R$ 0,00')
  assert.equal(formatBrl(5n), 'R$ 0,05')
  assert.equal(formatBrl(123456n), 'R$ 1.234,56')
  assert.equal(formatBrl(123456789012n), 'R$ 1.234.567.890,12')
  assert.equal(formatBrl(-100050n), '-R$ 1.000,50')
})

test('money keeps cents exact as a string', () => {
  assert.deepEqual(money(9007199254740993n), { cents: '9007199254740993', brl: 'R$ 90.071.992.547.409,93' })
})
