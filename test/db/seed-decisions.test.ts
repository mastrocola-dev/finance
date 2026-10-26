import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import { seedDecisions } from '../../src/db/seed-decisions.ts'
import { listDecisions } from '../../src/ledger/decisions.ts'
import { testDatabase } from './database.ts'

describe('fictional decisions', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
  })

  after(() => db.drop())

  test('plants pending, confirmed and rejected decisions through the ledger commands', async () => {
    assert.equal(await seedDecisions(client), 4)
    const decisions = await listDecisions(client, 'all')
    assert.deepEqual(
      decisions.map(({ title, status, origin, confirmedBy, awaiting }) => ({ title, status, origin, confirmedBy, awaiting })),
      [
        { title: 'Antecipar seis parcelas do financiamento do carro', status: 'proposed', origin: 'claude', confirmedBy: [], awaiting: ['Marcio', 'Gabriela'] },
        { title: 'Trocar a internet de casa para 1 Gb', status: 'proposed', origin: 'manual', confirmedBy: ['Gabriela'], awaiting: ['Marcio'] },
        { title: 'Aumentar o aporte mensal na reserva', status: 'confirmed', origin: 'manual', confirmedBy: ['Gabriela', 'Marcio'], awaiting: [] },
        { title: 'Assinar mais um streaming', status: 'rejected', origin: 'manual', confirmedBy: [], awaiting: [] },
      ],
    )
    const { rows } = await client.query("select count(*)::int as total from audit_log where entity like 'decision%' and author = 'system'")
    assert.equal(rows[0]?.total, 0)
    const times = await client.query<{ at: string }>("select to_char(at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as at from audit_log where entity like 'decision%' order by id")
    assert.deepEqual(
      times.rows.map((row) => row.at),
      ['2026-10-17 19:30', '2026-10-17 21:05', '2026-10-18 08:10', '2026-10-18 08:10', '2026-10-18 09:02', '2026-10-18 09:02', '2026-10-18 09:40', '2026-10-18 09:40', '2026-10-18 10:15'],
    )
    const order = await client.query<{ backwards: number }>('select count(*)::int as backwards from (select at < lag(at) over (order by id) as earlier from audit_log) steps where earlier')
    assert.equal(order.rows[0]?.backwards, 0)
  })

  test('runs once', async () => {
    assert.equal(await seedDecisions(client), 0)
    assert.equal((await listDecisions(client, 'all')).length, 4)
  })
})
