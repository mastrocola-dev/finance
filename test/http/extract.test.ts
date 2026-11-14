import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { extract } from '../../src/http/extract.ts'
import { listen } from '../../src/http/node.ts'
import { extractKeyHeader, extractKeyOf, remoteUploads } from '../../src/http/remote-uploads.ts'
import { Busy, type ImportUploads, Unavailable } from '../../src/import/uploads.ts'
import { RuleError } from '../../src/ledger/rule.ts'

const key = 'extract-key-for-tests-only-0123456789'
const calls: unknown[][] = []
let refusal: Error | undefined

const fake = {
  start: async (actor: unknown, name: string, bytes: Uint8Array) => {
    calls.push(['start', actor, name, new TextDecoder().decode(bytes)])
    if (refusal) throw refusal
    return 7n
  },
  retry: async (actor: unknown, batchId: bigint) => {
    calls.push(['retry', actor, batchId])
    if (refusal) throw refusal
  },
  discard: async (batchId: bigint) => [`hash-${batchId}`],
  runtime: () => ({ ready: true, cause: null, warming: false }),
  progressOf: (ids: bigint[]) => new Map(ids.filter((id) => id === 7n).map((id) => [id, { state: 'extracting' as const, done: 1, total: 3, error: null }])),
} as unknown as ImportUploads

let server: Awaited<ReturnType<typeof listen>>

before(async () => {
  server = await listen(extract(fake, key), 0, '127.0.0.1')
})

after(() => server.close())

const remote = () => remoteUploads(server.url, key)

test('passes uploads, retries, discards, runtime and progress through to the uploads of the extraction service', async () => {
  calls.length = 0
  refusal = undefined
  const imports = remote()
  assert.equal(await imports.start({ author: 'import', memberId: 2n }, 'Orçamento 1/2.txt', new TextEncoder().encode('aluguel\n')), 7n)
  await imports.retry({ author: 'import' }, 7n)
  assert.deepEqual(calls, [
    ['start', { author: 'import', memberId: 2n }, 'Orçamento 1/2.txt', 'aluguel\n'],
    ['retry', { author: 'import' }, 7n],
  ])
  assert.deepEqual(await imports.discard(9n), ['hash-9'])
  assert.deepEqual(await imports.runtime(), { ready: true, cause: null, warming: false })
  assert.deepEqual(await imports.progressOf([7n, 8n]), new Map([[7n, { state: 'extracting', done: 1, total: 3, error: null }]]))
  assert.deepEqual(await imports.progressOf([]), new Map())
})

test('gives back rule, busy and unavailable refusals as the same errors', async () => {
  const imports = remote()
  for (const [error, type] of [
    [new RuleError('this file is already in import batch 3'), RuleError],
    [new Busy('import batch 7 is still extracting'), Busy],
    [new Unavailable('the ingest runtime is not ready (missing)'), Unavailable],
  ] as const) {
    refusal = error
    await assert.rejects(imports.start({ author: 'import' }, 'notas.txt', new Uint8Array()), (caught: Error) => caught instanceof type && caught.message === error.message)
    await assert.rejects(imports.retry({ author: 'import' }, 7n), type)
  }
  refusal = new Error('database password is local')
  await assert.rejects(imports.start({ author: 'import' }, 'notas.txt', new Uint8Array()), (caught: Error) => !(caught instanceof RuleError) && caught.message === 'internal error')
  refusal = undefined
})

test('answers health without the key and refuses everything else without it', async () => {
  assert.deepEqual(await (await fetch(`${server.url}/health`)).json(), { status: 'ok' })
  for (const given of [undefined, 'wrong', `${key}x`]) {
    const response = await fetch(`${server.url}/runtime`, { headers: given ? { [extractKeyHeader]: given } : {} })
    assert.equal(response.status, 401)
  }
  await assert.rejects(remoteUploads(server.url, 'another-key-of-thirty-two-characters').discard(1n), /needs the x-extract-key header/)
})

test('refuses malformed requests', async () => {
  const send = (path: string, init: RequestInit = {}) => fetch(`${server.url}${path}`, { ...init, headers: { [extractKeyHeader]: key, ...init.headers } }).then((response) => response.status)
  assert.equal(await send('/progress?ids=1,x'), 400)
  assert.equal(await send(`/progress?ids=${Array.from({ length: 201 }, (_, index) => index).join(',')}`), 400)
  assert.equal(await send('/uploads', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' }), 415)
  assert.equal(await send('/uploads', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-file-name': '%E0%A4%A' }, body: 'x' }), 400)
  assert.equal(await send('/batches/7/retry', { method: 'POST', headers: { 'x-member-id': 'Marcio' } }), 400)
  assert.equal(await send('/batches/7/close', { method: 'POST' }), 404)
  assert.equal(await send('/batches/7/retry'), 404)
})

test('reports an unreachable extraction service as unavailable and its runtime as failed', async () => {
  const down = remoteUploads('http://127.0.0.1:9', key)
  await assert.rejects(down.start({ author: 'import' }, 'notas.txt', new Uint8Array()), (caught: Error) => caught instanceof Unavailable && caught.message === 'the extraction service cannot be reached')
  await assert.rejects(Promise.resolve(down.progressOf([1n])), Unavailable)
  assert.deepEqual(await down.runtime(), { ready: false, cause: 'failed', warming: false })
})

test('requires an extraction key of at least 32 characters', () => {
  assert.equal(extractKeyOf(key), key)
  for (const value of ['', 'short']) assert.throws(() => extractKeyOf(value), /EXTRACT_KEY must have at least 32 characters/)
})
