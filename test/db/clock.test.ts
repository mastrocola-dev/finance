import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { clockNow, fixedClock } from '../../src/db/clock.ts'
import { connectPool } from '../../src/db/connection.ts'
import { localToday } from '../../src/ledger/summary.ts'
import { testDatabase } from './database.ts'

let db: Awaited<ReturnType<typeof testDatabase>>

before(async () => {
  db = await testDatabase()
})

after(async () => {
  await db.drop()
})

test('an empty or missing clock means the real time', () => {
  assert.equal(fixedClock(''), undefined)
  assert.equal(fixedClock(undefined), undefined)
  assert.ok(Math.abs(clockNow(undefined).getTime() - Date.now()) < 1000)
})

test('a clock must be a full time with offset', () => {
  assert.equal(fixedClock('2026-10-18T12:00:00-03:00'), '2026-10-18T12:00:00-03:00')
  assert.equal(fixedClock('2026-10-18T15:00Z'), '2026-10-18T15:00Z')
  for (const wrong of ['2026-10-18', '2026-10-18 12:00:00-03:00', '2026-13-40T12:00:00Z', 'yesterday']) assert.throws(() => fixedClock(wrong), /FINANCE_CLOCK must be a time/)
})

test('FINANCE_CLOCK fixes today in Sao Paulo', (context) => {
  const previous = process.env.FINANCE_CLOCK
  context.after(() => {
    if (previous === undefined) delete process.env.FINANCE_CLOCK
    else process.env.FINANCE_CLOCK = previous
  })
  process.env.FINANCE_CLOCK = '2026-10-19T01:30:00Z'
  assert.equal(localToday(), '2026-10-18')
})

test('a pool with a clock writes ledger time at that instant', async () => {
  const pool = connectPool(db.url, false, '2026-10-18T12:00:00-03:00')
  const { rows } = await pool.query<{ at: Date }>('select ledger_now() as at')
  assert.equal(rows[0]?.at.toISOString(), '2026-10-18T15:00:00.000Z')
  await pool.end()
})

test('a read-only pool keeps both the clock and read-only mode', async () => {
  const pool = connectPool(db.url, true, '2026-10-18T12:00:00-03:00')
  const { rows } = await pool.query<{ at: Date; mode: string }>("select ledger_now() as at, current_setting('default_transaction_read_only') as mode")
  assert.equal(rows[0]?.at.toISOString(), '2026-10-18T15:00:00.000Z')
  assert.equal(rows[0]?.mode, 'on')
  await pool.end()
})

test('a pool without a clock follows the database time', async () => {
  const pool = connectPool(db.url, false, undefined)
  const { rows } = await pool.query<{ at: Date }>('select ledger_now() as at')
  assert.ok(Math.abs((rows[0]?.at.getTime() ?? 0) - Date.now()) < 5000)
  await pool.end()
})
