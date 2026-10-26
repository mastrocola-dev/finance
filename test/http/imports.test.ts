import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { connectPool } from '../../src/db/connection.ts'
import { seed } from '../../src/db/seed.ts'
import { serveApi } from '../../src/http/api.ts'
import { serviceAgentExtractor } from '../../src/import/service-agent.ts'
import { Busy, fileNameIssue, importUploads } from '../../src/import/uploads.ts'
import { testDatabase } from '../db/database.ts'
import { sample } from '../import/sample.ts'

const segments = async (_folder: string, file: string) => [{ id: 'text-1', kind: 'text' as const, source: file.startsWith('falha') ? 'fail' : 'L1-L1', shape: { lines: 1 } }]

describe('import api', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  let folder: string
  let uploads: ReturnType<typeof importUploads>
  let server: Awaited<ReturnType<typeof serveApi>>

  const upload = async (name: string, content: string, { consent = 'true', member = 'Marcio', type = 'application/octet-stream' } = {}) => {
    const response = await fetch(`${server.url}/api/imports?consent=${consent}`, { method: 'POST', headers: { 'content-type': type, 'x-file-name': encodeURIComponent(name), 'x-member': member }, body: content })
    return { status: response.status, body: await response.json() }
  }

  const get = async (path: string) => {
    const response = await fetch(`${server.url}/api${path}`)
    return { status: response.status, body: await response.json() }
  }

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    pool = connectPool(db.url)
    folder = await mkdtemp(join(tmpdir(), 'finance-uploads-'))
    uploads = importUploads(pool, { folder, segments, extractor: (at) => serviceAgentExtractor({ folder: at, cli: 'test/import/fake-agent.ts' }) })
    server = await serveApi(pool, 0, '127.0.0.1', uploads)
  })

  after(async () => {
    await uploads.settled()
    await server.close()
    await pool.end()
    await rm(folder, { recursive: true, force: true })
    await db.drop()
  })

  test('refuses uploads without consent, member, binary body or a plain file name', async () => {
    assert.equal((await upload('notas.txt', 'x', { consent: 'false' })).status, 400)
    assert.equal((await upload('notas.txt', 'x', { member: 'Nobody' })).status, 403)
    assert.equal((await upload('notas.txt', 'x', { type: 'text/plain' })).status, 415)
    const traversal = await upload('../notas.txt', 'x')
    assert.equal(traversal.status, 422)
    assert.match(traversal.body.error, /must not contain a path/)
    assert.match((await upload('setup.exe', 'x')).body.error, /unsupported format exe/)
    assert.equal(fileNameIssue('Orçamento 2026.xlsx'), undefined)
    assert.match(fileNameIssue(' ') ?? '', /1 to 200/)
    assert.deepEqual((await get('/imports')).body, [])
  })

  test('stores the file, extracts in the background and reports progress, candidates and questions', async () => {
    const content = 'aluguel 1500\n'
    const accepted = await upload('Orçamento.txt', content)
    assert.equal(accepted.status, 202)
    assert.equal(accepted.body.fileName, 'Orçamento.txt')
    assert.equal(accepted.body.progress.total, 1)
    const hash = createHash('sha256').update(content).digest('hex')
    assert.equal(await readFile(join(folder, hash, 'Orçamento.txt'), 'utf8'), content)
    await uploads.settled()
    const { status, body } = await get(`/imports/${accepted.body.id}`)
    assert.equal(status, 200)
    assert.equal(body.status, 'verified')
    assert.deepEqual(body.progress, { state: 'done', done: 1, total: 1, error: null })
    assert.equal(body.candidates, sample.candidates.length)
    assert.deepEqual([body.inputTokens, body.outputTokens, body.costUsd], [1200, 300, '0.0081'])
    const candidates = await get(`/imports/${accepted.body.id}/candidates`)
    assert.equal(candidates.body.length, sample.candidates.length)
    assert.equal(candidates.body[0].payload.amountCents, 150000)
    assert.equal(candidates.body[0].chunk, 'L1-L1@0')
    assert.ok(candidates.body.some(({ checks }: { checks: { code: string }[] }) => checks.some(({ code }) => code === 'low_confidence')))
    const questions = await get(`/imports/${accepted.body.id}/questions`)
    assert.ok(questions.body.length >= sample.questions.length)
    assert.equal(body.openQuestions, questions.body.length)
    const audit = await pool.query<{ author: string; name: string }>("select a.author, m.name from audit_log a join member m on m.id = a.member_id where a.entity = 'import_batch' and a.entity_id = $1 order by a.id", [accepted.body.id])
    assert.deepEqual(audit.rows[0], { author: 'import', name: 'Marcio' })
    const again = await upload('copia.txt', content)
    assert.equal(again.status, 422)
    assert.match(again.body.error, new RegExp(`already in import batch ${accepted.body.id}`))
    assert.equal(await readFile(join(folder, hash, 'Orçamento.txt'), 'utf8'), content)
  })

  test('reviews a verified batch: answers, edits, accepts and rejects as the member', async () => {
    const accepted = await upload('revisao.txt', 'revisão\n', { member: 'Gabriela' })
    await uploads.settled()
    const batch = accepted.body.id
    const send = async (method: string, path: string, body: unknown, at = server.url) => {
      const response = await fetch(`${at}/api/imports/${batch}${path}`, { method, headers: { 'content-type': 'application/json', 'x-member': 'Gabriela' }, body: JSON.stringify(body) })
      return { status: response.status, body: await response.json() }
    }
    const [question] = (await get(`/imports/${batch}/questions`)).body
    const answered = await send('POST', `/questions/${question.id}/answer`, { answer: 'Gabriela' })
    assert.equal(answered.status, 200)
    assert.equal(answered.body.answer, 'Gabriela')
    const [first, second] = (await get(`/imports/${batch}/candidates`)).body
    assert.equal(second.payload.member, 'Gabriela')
    assert.equal((await send('PATCH', `/candidates/${first.id}`, { payload: { ...first.payload, amountCents: -1 } })).status, 422)
    const edited = await send('PATCH', `/candidates/${first.id}`, { payload: { ...first.payload, description: 'Aluguel de outubro' } })
    assert.deepEqual([edited.status, edited.body.status, edited.body.payload.description], [200, 'edited', 'Aluguel de outubro'])
    const chosen = await send('POST', '/candidates/accept', { ids: [first.id, second.id] })
    assert.deepEqual(
      chosen.body.map(({ status }: { status: string }) => status),
      ['edited', 'accepted'],
    )
    assert.equal((await send('POST', '/candidates/reject', { ids: [] })).status, 400)
    assert.equal((await send('POST', '/candidates/reject', { ids: ['999999'] })).status, 422)
    const audit = await pool.query<{ author: string; name: string }>("select distinct a.author, m.name from audit_log a join member m on m.id = a.member_id where a.entity in ('import_candidate', 'import_question') and a.action = 'update' and a.author = 'member'")
    assert.deepEqual(audit.rows, [{ author: 'member', name: 'Gabriela' }])
    const busy = await serveApi(pool, 0, '127.0.0.1', { ...uploads, progressOf: () => ({ state: 'extracting', done: 0, total: 1, error: null }) })
    try {
      const refused = await send('POST', '/candidates/reject', { ids: [second.id] }, busy.url)
      assert.deepEqual([refused.status, refused.body.error], [409, `import batch ${batch} is still extracting`])
    } finally {
      await busy.close()
    }
    const missing = await fetch(`${server.url}/api/imports/999999/candidates/reject`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-member': 'Gabriela' }, body: JSON.stringify({ ids: [second.id] }) })
    assert.equal(missing.status, 404)
  })

  test('keeps failed chunks on the batch and filters batches by status', async () => {
    const accepted = await upload('falha.txt', 'ilegível\n', { member: 'Gabriela' })
    await uploads.settled()
    const { body } = await get(`/imports/${accepted.body.id}`)
    assert.equal(body.failures.length, 1)
    assert.match(body.failures[0].reason, /•7890/)
    assert.equal(body.candidates, 0)
    const all = await get('/imports')
    assert.deepEqual(
      all.body.map(({ fileName }: { fileName: string }) => fileName),
      ['falha.txt', 'revisao.txt', 'Orçamento.txt'],
    )
    assert.equal((await get('/imports?status=committed')).body.length, 0)
    assert.equal((await get('/imports/999999')).status, 404)
    assert.equal((await get('/imports/999999/candidates')).status, 404)
    assert.equal((await get('/imports?status=lost')).status, 400)
  })
  test('removes the upload after commit or close and sweeps folders of finished batches', async () => {
    const send = async (batch: string, path: string, body?: unknown) => {
      const response = await fetch(`${server.url}/api/imports/${batch}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-member': 'Marcio' }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, body: await response.json() }
    }
    const hashOf = (content: string) => createHash('sha256').update(content).digest('hex')
    const exists = (hash: string) =>
      access(join(folder, hash)).then(
        () => true,
        () => false,
      )
    const kept = await upload('mantido.txt', 'mantido\n')
    const committed = await upload('fechado.txt', 'fechado\n')
    const abandoned = await upload('abandonado.txt', 'abandonado\n')
    await uploads.settled()
    const [first] = (await get(`/imports/${committed.body.id}/candidates`)).body
    await send(committed.body.id, '/candidates/accept', { ids: [first.id] })
    const written = await send(committed.body.id, '/commit')
    assert.deepEqual([written.status, written.body.status, written.body.committed], [200, 'committed', 1])
    assert.equal(await exists(hashOf('fechado\n')), false)
    const closed = await send(committed.body.id, '/close')
    assert.deepEqual([closed.status, closed.body.status, closed.body.candidates, closed.body.committed], [200, 'closed', 0, 1])
    assert.equal((await upload('de novo.txt', 'fechado\n')).status, 422)
    const dropped = await send(abandoned.body.id, '/close')
    assert.deepEqual([dropped.status, dropped.body.status, dropped.body.committed], [200, 'closed', 0])
    assert.equal(await exists(hashOf('abandonado\n')), false)
    assert.match((await send(abandoned.body.id, '/close')).body.error, /already closed/)
    assert.equal((await send('999999', '/close')).status, 404)
    const orphan = hashOf('órfão')
    await mkdir(join(folder, orphan))
    await mkdir(join(folder, 'notas'))
    assert.deepEqual(await uploads.sweep(), [orphan])
    assert.equal(await exists(hashOf('mantido\n')), true)
    assert.ok((await readdir(folder)).includes('notas'))
    assert.equal((await get(`/imports/${kept.body.id}`)).body.status, 'verified')
  })

  test('retries a batch from its kept upload as the member, one extraction at a time', async () => {
    const retry = async (batch: string, at = server.url) => {
      const response = await fetch(`${at}/api/imports/${batch}/retry`, { method: 'POST', headers: { 'x-member': 'Gabriela' } })
      return { status: response.status, body: await response.json() }
    }
    const accepted = await upload('retentar.txt', 'retentar\n')
    const batch = accepted.body.id
    await uploads.settled()
    const first = (await get(`/imports/${batch}/candidates`)).body.map(({ id }: { id: string }) => id)
    assert.equal((await get(`/imports/${batch}`)).body.retryable, 1)
    const started = await retry(batch)
    assert.deepEqual([started.status, started.body.progress], [202, { state: 'extracting', done: 0, total: 1, error: null }])
    await uploads.settled()
    const done = await get(`/imports/${batch}`)
    assert.deepEqual([done.body.status, done.body.progress, done.body.inputTokens], ['verified', { state: 'done', done: 1, total: 1, error: null }, 2400])
    const second = (await get(`/imports/${batch}/candidates`)).body.map(({ id }: { id: string }) => id)
    assert.equal(second.length, first.length)
    assert.ok(second.every((id: string) => !first.includes(id)))
    const audit = await pool.query<{ author: string; name: string }>("select distinct a.author, m.name from audit_log a join member m on m.id = a.member_id where a.entity = 'import_candidate' and a.action = 'close' and a.entity_id = any($1)", [first])
    assert.deepEqual(audit.rows, [{ author: 'import', name: 'Gabriela' }])
    const actor = { author: 'import' as const, memberId: 1n }
    const once = uploads.retry(actor, BigInt(batch))
    await assert.rejects(uploads.retry(actor, BigInt(batch)), Busy)
    await once
    const busy = await serveApi(pool, 0, '127.0.0.1', { ...uploads, retry: () => Promise.reject(new Busy(`import batch ${batch} is still extracting`)) })
    try {
      assert.deepEqual(await retry(batch, busy.url), { status: 409, body: { error: `import batch ${batch} is still extracting` } })
    } finally {
      await busy.close()
    }
    await uploads.settled()
    const [chosen] = (await get(`/imports/${batch}/candidates`)).body
    await fetch(`${server.url}/api/imports/${batch}/candidates/accept`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-member': 'Marcio' }, body: JSON.stringify({ ids: [chosen.id] }) })
    assert.equal((await get(`/imports/${batch}`)).body.retryable, 0)
    const nothing = await retry(batch)
    assert.deepEqual([nothing.status, nothing.body.error], [422, `nothing to retry in import batch ${batch}`])
    assert.equal((await get(`/imports/${batch}`)).body.progress.state, 'done')
    const gone = await upload('perdido.txt', 'perdido\n')
    await uploads.settled()
    await rm(join(folder, createHash('sha256').update('perdido\n').digest('hex')), { recursive: true })
    assert.match((await retry(gone.body.id)).body.error, /no longer kept; close the batch and upload the file again/)
    await fetch(`${server.url}/api/imports/${gone.body.id}/close`, { method: 'POST', headers: { 'x-member': 'Marcio' } })
    assert.deepEqual(await retry(gone.body.id), { status: 422, body: { error: `import batch ${gone.body.id} is not open for a retry` } })
    assert.equal((await get(`/imports/${gone.body.id}`)).body.retryable, 0)
    assert.equal((await retry('999999')).status, 404)
    assert.equal((await fetch(`${server.url}/api/imports/${batch}/retry`, { method: 'POST' })).status, 401)
  })
  test('refuses uploads and retries with 503 while the ingest runtime is not ready, without leaking the reason', async () => {
    assert.deepEqual((await get('/imports/runtime')).body, { ready: true, cause: null })
    const [batch] = (await get('/imports')).body
    uploads.warmed({ ready: false, cause: 'failed', reason: 'Command failed: uv --directory /home/someone/finance/ingest run' })
    try {
      assert.deepEqual(await get('/imports/runtime'), { status: 200, body: { ready: false, cause: 'failed' } })
      const before = await readdir(folder)
      assert.deepEqual(await upload('novo.txt', 'novo\n'), { status: 503, body: { error: 'the ingest runtime is not ready (failed)' } })
      assert.deepEqual(await readdir(folder), before)
      const retried = await fetch(`${server.url}/api/imports/${batch.id}/retry`, { method: 'POST', headers: { 'x-member': 'Marcio' } })
      assert.deepEqual([retried.status, await retried.json()], [503, { error: 'the ingest runtime is not ready (failed)' }])
      assert.equal((await get(`/imports/${batch.id}`)).body.progress?.state ?? null, batch.progress?.state ?? null)
    } finally {
      uploads.warmed({ ready: true })
    }
    assert.deepEqual((await get('/imports/runtime')).body, { ready: true, cause: null })
  })
})
