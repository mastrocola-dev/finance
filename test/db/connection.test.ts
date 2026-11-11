import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { after, before, test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'
import { connectPool, urlFrom } from '../../src/db/connection.ts'
import { testDatabase } from './database.ts'

const run = promisify(execFile)

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

test('DATABASE_URL wins, PGHOST alone defers to the node-postgres environment, neither means localhost', () => {
  assert.equal(urlFrom({ DATABASE_URL: 'postgres://a@b/c', PGHOST: 'other' }), 'postgres://a@b/c')
  assert.equal(urlFrom({ PGHOST: 'db.example' }), undefined)
  assert.equal(urlFrom({ DATABASE_URL: '', PGHOST: 'db.example' }), undefined)
  assert.equal(urlFrom({}), 'postgres://postgres@localhost:5432/finance')
})

const pgEnvironment = (extra: Record<string, string> = {}) => {
  const url = new URL(db.url)
  return {
    PATH: process.env.PATH ?? '',
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
    ...extra,
  }
}

const script = (file: string, env: Record<string, string>, ...args: string[]) => run(process.execPath, [`src/db/${file}`, ...args], { env })

test('migration job and member scripts connect through PG* variables without DATABASE_URL', async () => {
  const env = pgEnvironment()
  assert.equal((await script('migrate.ts', env)).stdout.trim(), 'up to date')
  assert.equal((await script('add-member.ts', env, 'Ana', '100')).stdout.trim(), 'added Ana')
  assert.equal((await script('link-member.ts', env, 'Ana', 'oid-ana')).stdout.trim(), 'linked Ana')
  const { rows } = await db.client.query('select name, external_id from member where closed_at is null')
  assert.deepEqual(rows, [{ name: 'Ana', external_id: 'oid-ana' }])
})

test('PGSSLMODE=require makes the connection insist on TLS', async () => {
  const caught = await script('migrate.ts', pgEnvironment({ PGSSLMODE: 'require' })).then(
    () => undefined,
    (error: { stderr: string }) => error,
  )
  assert.ok(caught, 'migration should refuse a server it cannot verify over TLS')
  assert.match(caught.stderr, /SSL|certificate/i)
  assert.equal((await script('migrate.ts', pgEnvironment({ PGSSLMODE: 'disable' }))).stdout.trim(), 'up to date')
})
