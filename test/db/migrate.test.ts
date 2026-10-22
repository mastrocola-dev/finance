import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { migrate } from '../../src/db/migrate.ts'
import { testDatabase } from './database.ts'

const tables = ['account', 'audit_log', 'category', 'debt', 'decision', 'decision_confirmation', 'entry', 'goal', 'income', 'member', 'recurring_expense', 'reserve', 'schema_migration']

describe('migrations', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client

  before(async () => {
    db = await testDatabase()
    client = db.client
  })

  after(() => db.drop())

  const memberId = async (name: string) => {
    const { rows } = await client.query<{ id: string }>('insert into member (name) values ($1) returning id', [name])
    return rows[0]?.id
  }

  const categoryId = async () => {
    const { rows } = await client.query<{ id: string }>("insert into category (name, kind) values ('Moradia', 'expense') on conflict (name, kind) do update set name = excluded.name returning id")
    return rows[0]?.id
  }

  test('applies every migration to an empty database', async () => {
    assert.deepEqual(db.applied, ['001-ledger.sql', '002-ledger-clock.sql'])
    const { rows } = await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' order by table_name")
    assert.deepEqual(
      rows.map((row) => row.table_name),
      tables,
    )
  })

  test('is idempotent', async () => {
    assert.deepEqual(await migrate(client), [])
  })

  test('sets the database time zone', async () => {
    const { rows } = await client.query<{ timezone: string }>('select setting as timezone from pg_db_role_setting, unnest(setconfig) setting where setdatabase = (select oid from pg_database where datname = current_database())')
    assert.deepEqual(
      rows.map((row) => row.timezone),
      ['TimeZone=America/Sao_Paulo'],
    )
  })

  test('accounts keep only the last four digits', async () => {
    await client.query("insert into account (institution, nickname, last_four, kind) values ('Banco Ficticio', 'Conta conjunta', '1234', 'checking')")
    const invalid = [
      ['Banco Ficticio', 'Card', '12345'],
      ['Banco Ficticio', 'Card', '12a4'],
      ['Banco Ficticio', 'Card 4111111111111111', '1111'],
      ['Banco 0001234567', 'Card', '1111'],
    ]
    for (const [institution, nickname, lastFour] of invalid) {
      await assert.rejects(client.query("insert into account (institution, nickname, last_four, kind) values ($1, $2, $3, 'credit_card')", [institution, nickname, lastFour]), /check constraint/)
    }
  })

  test('entries require a competence on the first day and a payment date only when paid', async () => {
    const category = await categoryId()
    const insert = (competence: string, status: string, paidOn: string | null) => client.query("insert into entry (competence, due_on, description, direction, amount_cents, category_id, status, paid_on, origin) values ($1, $1, 'Aluguel', 'expense', 150000, $2, $3, $4, 'manual')", [competence, category, status, paidOn])
    await insert('2026-10-01', 'planned', null)
    await insert('2026-10-01', 'paid', '2026-10-05')
    await assert.rejects(insert('2026-10-15', 'planned', null), /check constraint/)
    await assert.rejects(insert('2026-10-01', 'paid', null), /check constraint/)
    await assert.rejects(insert('2026-10-01', 'planned', '2026-10-05'), /check constraint/)
    await assert.rejects(insert('2026-10-01', 'cancelled', null), /check constraint/)
  })

  test('money is stored as bigint cents', async () => {
    const { rows } = await client.query<{ column_name: string; data_type: string }>("select table_name || '.' || column_name as column_name, data_type from information_schema.columns where table_schema = 'public' and column_name like '%cents'")
    assert.ok(rows.length >= 10)
    assert.deepEqual(new Set(rows.map((row) => row.data_type)), new Set(['bigint']))
  })

  test('rows are never deleted', async () => {
    await memberId('Marcio')
    await assert.rejects(client.query("delete from member where name = 'Marcio'"), /never deleted/)
    await assert.rejects(client.query('truncate entry'), /never deleted/)
  })

  test('audit log is append only', async () => {
    const member = await memberId('Gabriela')
    await client.query("insert into audit_log (author, member_id, entity, entity_id, action, after) values ('member', $1, 'member', $1, 'create', '{}')", [member])
    await assert.rejects(client.query("update audit_log set action = 'close'"), /immutable/)
    await assert.rejects(client.query('delete from audit_log'), /immutable/)
    await assert.rejects(client.query("insert into audit_log (author, entity, action) values ('claude', 'entry', 'create')"), /check constraint/)
  })

  test('decisions are proposed until closed', async () => {
    const member = await memberId('Proposer')
    await client.query("insert into decision (title, proposed_by, origin) values ('Raise the reserve', $1, 'claude')", [member])
    await assert.rejects(client.query("insert into decision (title, proposed_by, origin, status) values ('Buy a car', $1, 'manual', 'confirmed')", [member]), /check constraint/)
  })
})
