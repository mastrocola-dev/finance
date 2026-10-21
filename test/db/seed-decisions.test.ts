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
        { title: 'Prepay six car loan installments', status: 'proposed', origin: 'claude', confirmedBy: [], awaiting: ['Marcio', 'Gabriela'] },
        { title: 'Upgrade home internet to 1 Gb', status: 'proposed', origin: 'manual', confirmedBy: ['Gabriela'], awaiting: ['Marcio'] },
        { title: 'Raise the monthly reserve contribution', status: 'confirmed', origin: 'manual', confirmedBy: ['Gabriela', 'Marcio'], awaiting: [] },
        { title: 'Add another streaming subscription', status: 'rejected', origin: 'manual', confirmedBy: [], awaiting: [] },
      ],
    )
    const { rows } = await client.query("select count(*)::int as total from audit_log where entity like 'decision%' and author = 'system'")
    assert.equal(rows[0]?.total, 0)
  })

  test('runs once', async () => {
    assert.equal(await seedDecisions(client), 0)
    assert.equal((await listDecisions(client, 'all')).length, 4)
  })
})
