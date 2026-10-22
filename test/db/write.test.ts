import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { type Actor, write } from '../../src/db/write.ts'
import { testDatabase } from './database.ts'

const system: Actor = { author: 'system' }

describe('audited writes', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let marcio: bigint
  let gabriela: bigint
  let category: bigint

  const count = async (table: string) => {
    const { rows } = await client.query<{ total: number }>(`select count(*)::int as total from ${table}`)
    return rows[0]?.total
  }

  const auditOf = async (entity: string, id: unknown) => {
    const { rows } = await client.query('select author, member_id, action, before, after from audit_log where entity = $1 and entity_id = $2 order by id', [entity, id])
    return rows
  }

  before(async () => {
    db = await testDatabase()
    client = db.client
    ;[marcio, gabriela] = await write(client, system, async (ledger) => [(await ledger.create('member', { name: 'Marcio' })).id as bigint, (await ledger.create('member', { name: 'Gabriela' })).id as bigint])
    category = (await write(client, system, (ledger) => ledger.create('category', { name: 'Moradia', kind: 'expense' }))).id as bigint
  })

  after(() => db.drop())

  const rent = { competence: '2026-10-01', due_on: '2026-10-10', description: 'Aluguel', direction: 'expense', amount_cents: 150000n, origin: 'claude' }

  test('parses bigint as BigInt and dates as plain strings', async () => {
    const entry = await write(client, { author: 'claude', memberId: marcio }, (ledger) => ledger.create('entry', { ...rent, category_id: category }))
    assert.equal(typeof entry.id, 'bigint')
    assert.equal(entry.amount_cents, 150000n)
    assert.equal(entry.competence, '2026-10-01')
  })

  test('create writes one audit row with the author and the new row', async () => {
    const entry = await write(client, { author: 'claude', memberId: gabriela }, (ledger) => ledger.create('entry', { ...rent, category_id: category }))
    const [log, ...rest] = await auditOf('entry', entry.id)
    assert.equal(rest.length, 0)
    assert.equal(log?.author, 'claude')
    assert.equal(log?.member_id, gabriela)
    assert.equal(log?.action, 'create')
    assert.equal(log?.before, null)
    assert.equal(log?.after.amount_cents, 150000)
    assert.equal(log?.after.status, 'planned')
  })

  test('update and close record before and after', async () => {
    const actor: Actor = { author: 'member', memberId: marcio }
    const entry = await write(client, actor, (ledger) => ledger.create('entry', { ...rent, category_id: category }))
    const paid = await write(client, actor, (ledger) => ledger.update('entry', entry.id as bigint, { status: 'paid', paid_on: '2026-10-09' }))
    assert.equal(paid.status, 'paid')
    const closed = await write(client, actor, (ledger) => ledger.close('entry', entry.id as bigint))
    assert.ok(closed.closed_at instanceof Date)
    const logs = await auditOf('entry', entry.id)
    assert.deepEqual(
      logs.map((log) => log.action),
      ['create', 'update', 'close'],
    )
    assert.equal(logs[1]?.before.status, 'planned')
    assert.equal(logs[1]?.after.status, 'paid')
    assert.equal(logs[2]?.before.closed_at, null)
    assert.ok(logs[2]?.after.closed_at)
  })

  test('closed rows cannot be changed again', async () => {
    const entry = await write(client, system, (ledger) => ledger.create('entry', { ...rent, category_id: category }))
    await write(client, system, (ledger) => ledger.close('entry', entry.id as bigint))
    await assert.rejects(
      write(client, system, (ledger) => ledger.update('entry', entry.id as bigint, { description: 'Late rent' })),
      /not found or closed/,
    )
    await assert.rejects(
      write(client, system, (ledger) => ledger.close('entry', entry.id as bigint)),
      /not found or closed/,
    )
  })

  test('a corrected entry is closed with replaced_by', async () => {
    const [original, replacement] = await write(client, system, async (ledger) => {
      const wrong = await ledger.create('entry', { ...rent, category_id: category, amount_cents: 15000n })
      const right = await ledger.create('entry', { ...rent, category_id: category })
      return [await ledger.close('entry', wrong.id as bigint, { replaced_by: right.id }), right]
    })
    assert.equal(original?.replaced_by, replacement?.id)
  })

  test('a failure rolls back the rows and their audit', async () => {
    const entries = await count('entry')
    const audits = await count('audit_log')
    await assert.rejects(
      write(client, system, async (ledger) => {
        await ledger.create('entry', { ...rent, category_id: category })
        throw new Error('stop')
      }),
      /stop/,
    )
    await assert.rejects(
      write(client, system, async (ledger) => {
        await ledger.create('entry', { ...rent, category_id: category })
        await ledger.create('entry', { ...rent, category_id: category, competence: '2026-10-15' })
      }),
      /check constraint/,
    )
    assert.equal(await count('entry'), entries)
    assert.equal(await count('audit_log'), audits)
  })

  test('identity and lifecycle columns are not writable', async () => {
    await assert.rejects(
      write(client, system, (ledger) => ledger.create('category', { id: 99n, name: 'Food', kind: 'expense' })),
      /not writable/,
    )
    await assert.rejects(
      write(client, system, (ledger) => ledger.update('category', category, { closed_at: null })),
      /not writable/,
    )
    await assert.rejects(
      write(client, system, (ledger) => ledger.update('category', category, {})),
      /nothing to update/,
    )
  })

  test('only ledger entities are writable and there is no delete path', async () => {
    await assert.rejects(
      write(client, system, (ledger) => ledger.create('audit_log' as 'entry', {})),
      /unknown entity/,
    )
    await write(client, system, async (ledger) => assert.deepEqual(Object.keys(ledger).sort(), ['close', 'create', 'update']))
  })

  test('decision confirmations are audited without an id', async () => {
    const decision = await write(client, { author: 'claude', memberId: marcio }, (ledger) => ledger.create('decision', { title: 'Raise the reserve', proposed_by: marcio, origin: 'claude' }))
    await write(client, { author: 'member', memberId: gabriela }, (ledger) => ledger.create('decision_confirmation', { decision_id: decision.id, member_id: gabriela }))
    const { rows } = await client.query("select entity_id, after from audit_log where entity = 'decision_confirmation'")
    assert.equal(rows[0]?.entity_id, null)
    assert.equal(rows[0]?.after.decision_id, Number(decision.id))
  })

  test('active members share_percent sums to 100', async () => {
    await assert.rejects(
      write(client, system, (ledger) => ledger.update('member', marcio, { share_percent: 60 })),
      /must sum to 100, got 110/,
    )
    await assert.rejects(
      write(client, system, (ledger) => ledger.create('member', { name: 'Guest', share_percent: 0 })).then(() => write(client, system, (ledger) => ledger.close('member', gabriela))),
      /must sum to 100, got 50/,
    )
    await write(client, system, async (ledger) => {
      await ledger.update('member', marcio, { share_percent: 60 })
      await ledger.update('member', gabriela, { share_percent: 40 })
    })
    const { rows } = await client.query<{ name: string; share_percent: number }>('select name, share_percent from member where closed_at is null order by id')
    assert.deepEqual(
      rows.map((row) => [row.name, row.share_percent]),
      [
        ['Marcio', 60],
        ['Gabriela', 40],
        ['Guest', 0],
      ],
    )
  })
})
