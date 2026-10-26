import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { shares, transfers } from '../../src/ledger/split.ts'

describe('split', () => {
  test('shares the total by percent and gives leftover cents in member order', () => {
    const parts = shares([
      { name: 'A', sharePercent: 50, paid: 1001n },
      { name: 'B', sharePercent: 50, paid: 0n },
    ])
    assert.deepEqual(
      parts.map(({ share, balance }) => [share, balance]),
      [
        [501n, 500n],
        [500n, -500n],
      ],
    )
    assert.deepEqual(transfers(parts), [{ from: 'B', to: 'A', amount: 500n }])
  })

  test('follows uneven shares and settles with as many transfers as needed', () => {
    const parts = shares([
      { name: 'A', sharePercent: 60, paid: 0n },
      { name: 'B', sharePercent: 20, paid: 7000n },
      { name: 'C', sharePercent: 20, paid: 3000n },
    ])
    assert.deepEqual(
      parts.map(({ share }) => share),
      [6000n, 2000n, 2000n],
    )
    assert.deepEqual(transfers(parts), [
      { from: 'A', to: 'B', amount: 5000n },
      { from: 'A', to: 'C', amount: 1000n },
    ])
  })

  test('owes nothing when nobody paid a joint expense', () => {
    const parts = shares([
      { name: 'A', sharePercent: 50, paid: 0n },
      { name: 'B', sharePercent: 50, paid: 0n },
    ])
    assert.deepEqual(transfers(parts), [])
    assert.ok(parts.every(({ share, balance }) => share === 0n && balance === 0n))
  })
})
