import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { after, before, describe, test } from 'node:test'
import { promisify } from 'node:util'
import { addMembers, membersOf } from '../../src/db/add-member.ts'
import { testDatabase } from './database.ts'

const run = promisify(execFile)

const npm = (url: string, ...args: string[]) => run('npm', ['run', '--silent', ...args], { env: { ...process.env, DATABASE_URL: url } })

describe('member bootstrap', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>

  const members = async () => (await db.client.query('select name, share_percent, external_id from member where closed_at is null order by id')).rows

  before(async () => {
    db = await testDatabase()
  })

  after(async () => {
    await db.drop()
  })

  test('arguments pair names with whole share percents', () => {
    assert.deepEqual(membersOf(['Marcio', '50', 'Gabriela', '50']), [
      { name: 'Marcio', sharePercent: 50 },
      { name: 'Gabriela', sharePercent: 50 },
    ])
    assert.equal(membersOf([]), undefined)
    assert.equal(membersOf(['Marcio']), undefined)
    assert.equal(membersOf(['Marcio', '50.5']), undefined)
  })

  test('shares that do not add up to 100 are refused and nothing is written', async () => {
    await assert.rejects(addMembers(db.client, [{ name: 'Marcio', sharePercent: 50 }]), /must sum to 100, got 50/)
    await assert.rejects(
      addMembers(db.client, [
        { name: 'Marcio', sharePercent: 60 },
        { name: 'Gabriela', sharePercent: 50 },
      ]),
      /got 110/,
    )
    await assert.rejects(addMembers(db.client, [{ name: 'Marcio', sharePercent: 101 }]), /whole number from 0 to 100/)
    await assert.rejects(addMembers(db.client, [{ name: ' ', sharePercent: 100 }]), /name is empty/)
    await assert.rejects(
      addMembers(db.client, [
        { name: 'Ana', sharePercent: 50 },
        { name: 'ana', sharePercent: 50 },
      ]),
      /names repeat/,
    )
    assert.deepEqual(await members(), [])
  })

  test('member:add then member:link work on an empty migrated database', async () => {
    assert.equal((await npm(db.url, 'member:add', '--', 'Marcio', '50', 'Gabriela', '50')).stdout.trim(), 'added Marcio, Gabriela')
    assert.equal((await npm(db.url, 'member:link', '--', 'Gabriela', 'oid-gabriela')).stdout.trim(), 'linked Gabriela')
    assert.deepEqual(await members(), [
      { name: 'Marcio', share_percent: 50, external_id: null },
      { name: 'Gabriela', share_percent: 50, external_id: 'oid-gabriela' },
    ])
    const { rows } = await db.client.query("select author, action, count(*)::int as total from audit_log where entity = 'member' group by author, action order by action")
    assert.deepEqual(rows, [
      { author: 'system', action: 'create', total: 2 },
      { author: 'system', action: 'update', total: 1 },
    ])
  })

  test('a duplicate open name or shares past 100 are refused', async () => {
    await assert.rejects(addMembers(db.client, [{ name: 'marcio ', sharePercent: 0 }]), /member marcio already exists/)
    await assert.rejects(addMembers(db.client, [{ name: 'Ana', sharePercent: 10 }]), /got 110/)
    await assert.rejects(npm(db.url, 'member:add', '--', 'Ana', '10'), (caught: { code: number; stderr: string }) => caught.code === 1 && /got 110/.test(caught.stderr))
    await assert.rejects(npm(db.url, 'member:add', '--', 'Ana'), (caught: { stderr: string }) => /usage: npm run member:add/.test(caught.stderr))
    assert.equal((await members()).length, 2)
  })
})
