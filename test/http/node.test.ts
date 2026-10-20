import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listen } from '../../src/http/node.ts'

test('bridges node requests to a fetch handler', async () => {
  const server = await listen(async (request) => Response.json({ method: request.method, path: new URL(request.url).pathname, member: request.headers.get('x-member'), body: await request.text() }), 0, '127.0.0.1')
  const response = await fetch(`${server.url}/echo`, { method: 'POST', headers: { 'x-member': 'Marcio' }, body: 'hello' })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { method: 'POST', path: '/echo', member: 'Marcio', body: 'hello' })
  await server.close()
})

test('answers 500 as JSON when the handler throws', async () => {
  const server = await listen(
    async () => {
      throw new Error('boom')
    },
    0,
    '127.0.0.1',
  )
  const response = await fetch(server.url)
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'internal error' })
  await server.close()
})
