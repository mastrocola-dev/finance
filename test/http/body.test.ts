import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HttpError, readJson } from '../../src/http/body.ts'

const streamed = (chunks: string[]) =>
  new Request('http://localhost/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
        controller.close()
      },
    }),
    duplex: 'half',
  } as RequestInit)

test('reads a streamed JSON body', async () => {
  assert.deepEqual(await readJson(streamed(['{"a":', '"ção"}'])), { a: 'ção' })
  assert.deepEqual(await readJson(streamed([])), {})
})

test('stops a streamed body past the limit without content-length', async () => {
  await assert.rejects(readJson(streamed(['{"a":"', 'x'.repeat(20), '"}']), 16), (error) => error instanceof HttpError && error.status === 413)
})
