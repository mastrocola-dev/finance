import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Database } from '../../src/db/connection.ts'
import type { IngestReadiness } from '../../src/import/ingest.ts'
import { importUploads, Unavailable } from '../../src/import/uploads.ts'

const failed: IngestReadiness = { ready: false, cause: 'missing', reason: 'uv is not installed' }

const gate = () => {
  const calls: ((value: IngestReadiness) => void)[] = []
  const warm = () => new Promise<IngestReadiness>((resolve) => calls.push(resolve))
  const answer = (index: number, value: IngestReadiness) => {
    const call = calls[index]
    assert.ok(call)
    call(value)
  }
  return { calls, warm, answer }
}

test('warms again in the background, one attempt at a time, once the runtime failed', async () => {
  const { calls, warm, answer } = gate()
  const seen: IngestReadiness[] = []
  const uploads = importUploads({} as Database, { warm, cooldownMs: 0, onWarmed: (value) => seen.push(value) })
  const first = uploads.warm()
  assert.equal(uploads.warm(), first)
  answer(0, failed)
  assert.deepEqual(await first, failed)
  assert.deepEqual(uploads.runtime(), { ready: false, cause: 'missing', warming: true })
  assert.deepEqual(uploads.runtime(), { ready: false, cause: 'missing', warming: true })
  await assert.rejects(uploads.start({ author: 'import', memberId: 1n }, 'notas.txt', new Uint8Array()), Unavailable)
  assert.equal(calls.length, 2)
  answer(1, { ready: true })
  await uploads.settled()
  assert.deepEqual(uploads.runtime(), { ready: true, cause: null, warming: false })
  assert.equal(calls.length, 2)
  assert.deepEqual(seen, [failed, { ready: true }])
})

test('waits for the cooldown before warming again', async () => {
  const { calls, warm, answer } = gate()
  const uploads = importUploads({} as Database, { warm, cooldownMs: 60000 })
  const first = uploads.warm()
  answer(0, failed)
  await first
  assert.deepEqual(uploads.runtime(), { ready: false, cause: 'missing', warming: false })
  assert.equal(calls.length, 1)
})

test('reports a warmer that throws as a failed runtime', async () => {
  const uploads = importUploads({} as Database, { warm: () => Promise.reject(new Error('boom')), cooldownMs: 60000 })
  assert.deepEqual(await uploads.warm(), { ready: false, cause: 'failed', reason: 'Error: boom' })
  assert.deepEqual(uploads.runtime(), { ready: false, cause: 'failed', warming: false })
})
