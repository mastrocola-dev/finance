import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { connectPool } from '../../src/db/connection.ts'
import { seed } from '../../src/db/seed.ts'
import { HttpError } from '../../src/http/body.ts'
import { identify, localVerifier } from '../../src/http/identity.ts'
import { testDatabase } from '../db/database.ts'

const request = (headers: Record<string, string> = {}) => new Request('http://localhost/api/debts', { headers })

const refused = (status: number, message: string) => (caught: unknown) => caught instanceof HttpError && caught.status === status && caught.message === message

describe('identify', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    await db.client.query("insert into member (name, share_percent, closed_at) values ('Ana', 0, now())")
    pool = connectPool(db.url)
  })

  after(async () => {
    await pool.end()
    await db.drop()
  })

  test('without identity there is no member', async () => {
    assert.equal(await identify(pool, request(), localVerifier), undefined)
  })

  test('the local verifier resolves the x-member header to an active member', async () => {
    assert.equal((await identify(pool, request({ 'x-member': ' gabriela ' }), localVerifier))?.name, 'Gabriela')
  })

  test('an unknown, empty or closed member is refused with 403', async () => {
    for (const name of ['Mallory', '', 'Ana']) await assert.rejects(identify(pool, request({ 'x-member': name }), localVerifier), refused(403, 'unknown member'))
  })
})
