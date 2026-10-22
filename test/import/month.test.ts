import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import { importMonth } from '../../src/import/month.ts'
import { readMonthSheet } from '../../src/import/sheet.ts'
import { RuleError } from '../../src/ledger/rule.ts'
import { testDatabase } from '../db/database.ts'

describe('importMonth', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  const actor = { author: 'import' } as const

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
  })

  after(() => db.drop())

  const imports = async (month: string) => (await client.query("select count(*)::int as count from entry where competence = $1 and origin = 'import'", [`${month}-01`])).rows[0]?.count

  test('writes the sheet entries as import origin in one audited transaction', async () => {
    const entries = await readMonthSheet('test/fixtures/2026-10-import.xlsx', '2026-10')
    const result = await importMonth(client, actor, '2026-10', entries)
    assert.equal(result.created.length, 5)
    assert.equal(await imports('2026-10'), 5)
    const audited = await client.query("select count(*)::int as count from audit_log where author = 'import' and entity = 'entry' and action = 'create'")
    assert.equal(audited.rows[0]?.count, 5)
  })

  test('refuses to import a month twice', async () => {
    const entries = await readMonthSheet('test/fixtures/2026-10-import.xlsx', '2026-10')
    await assert.rejects(importMonth(client, actor, '2026-10', entries), (error) => error instanceof RuleError && error.message === '2026-10 was already imported')
    assert.equal(await imports('2026-10'), 5)
  })

  test('rolls the whole sheet back when one line fails', async () => {
    const [valid, second] = await readMonthSheet('test/fixtures/2026-10-import.xlsx', '2026-10')
    assert.ok(valid && second)
    const november = [
      { ...valid, month: '2026-11', dueOn: '2026-11-05' },
      { ...second, month: '2026-11', dueOn: '2026-11-03', category: 'Nope' },
    ]
    await assert.rejects(importMonth(client, actor, '2026-11', november), (error) => error instanceof RuleError && error.message === 'unknown income category Nope')
    assert.equal(await imports('2026-11'), 0)
  })

  test('rejects entries outside the month', async () => {
    const [valid] = await readMonthSheet('test/fixtures/2026-10-import.xlsx', '2026-10')
    assert.ok(valid)
    await assert.rejects(importMonth(client, actor, '2026-11', [valid]), (error) => error instanceof RuleError && error.message === 'entry Salário Marcio is outside 2026-11')
  })
})
