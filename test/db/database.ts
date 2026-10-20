import { randomUUID } from 'node:crypto'
import { connect, databaseUrl } from '../../src/db/connection.ts'
import { dropDatabase, reset } from '../../src/db/reset.ts'

export const testDatabase = async () => {
  const url = new URL(databaseUrl)
  url.pathname = `/finance_test_${randomUUID().replaceAll('-', '')}`
  const applied = await reset(url.href)
  const client = await connect(url.href)
  const drop = async () => {
    await client.end()
    await dropDatabase(url.href)
  }
  return { url: url.href, client, applied, drop }
}
