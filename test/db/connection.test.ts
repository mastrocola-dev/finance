import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { connectPool } from '../../src/db/connection.ts'
import { testDatabase } from './database.ts'

let db: Awaited<ReturnType<typeof testDatabase>>

before(async () => {
  db = await testDatabase()
})

after(async () => {
  await db.drop()
})

test('pool survives an idle connection terminated by the server', async () => {
  const pool = connectPool(db.url)
  const first = await pool.connect()
  const { rows } = await first.query<{ pid: number }>('select pg_backend_pid() as pid')
  first.release()
  await db.client.query('select pg_terminate_backend($1)', [rows[0]?.pid])
  while (pool.totalCount > 0) await setTimeout(10)
  const { rows: after } = await pool.query<{ one: number }>('select 1 as one')
  assert.equal(after[0]?.one, 1)
  await pool.end()
})
