import { readdir, readFile } from 'node:fs/promises'
import type { Client } from 'pg'
import { connect } from './connection.ts'

const migrationsDir = new URL('../../db/migrations/', import.meta.url)
const migrationName = /^\d{3}-[a-z0-9-]+\.sql$/
const lockKey = 'finance.migrate'

const inTransaction = async (client: Client, work: () => Promise<unknown>) => {
  await client.query('begin')
  try {
    await work()
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

export const migrate = async (client: Client) => {
  await client.query('select pg_advisory_lock(hashtext($1))', [lockKey])
  try {
    await client.query('create table if not exists schema_migration (name text primary key, applied_at timestamptz not null default now())')
    const { rows } = await client.query<{ name: string }>('select name from schema_migration')
    const applied = new Set(rows.map((row) => row.name))
    const files = (await readdir(migrationsDir)).filter((file) => migrationName.test(file)).sort()
    const pending = files.filter((file) => !applied.has(file))
    for (const file of pending) {
      const sql = await readFile(new URL(file, migrationsDir), 'utf8')
      await inTransaction(client, async () => {
        await client.query(sql)
        await client.query('insert into schema_migration (name) values ($1)', [file])
      })
    }
    return pending
  } finally {
    await client.query('select pg_advisory_unlock(hashtext($1))', [lockKey])
  }
}

if (import.meta.main) {
  const client = await connect()
  try {
    const applied = await migrate(client)
    console.log(applied.length ? `applied ${applied.join(', ')}` : 'up to date')
  } finally {
    await client.end()
  }
}
