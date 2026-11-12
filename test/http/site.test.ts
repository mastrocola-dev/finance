import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { Database } from '../../src/db/connection.ts'
import { api } from '../../src/http/api.ts'
import type { Verifier } from '../../src/http/identity.ts'
import { listen } from '../../src/http/node.ts'
import { immutable, revalidate, site } from '../../src/http/site.ts'
import type { ImportUploads } from '../../src/import/uploads.ts'

const page = '<!doctype html><title>Caixa</title>'
const script = 'console.log(1)'
const nobody: Verifier = Object.assign(async () => undefined, { credential: 'a session', openReads: false })

describe('web served by the api', () => {
  let root: string
  let outside: string
  let server: Awaited<ReturnType<typeof listen>>

  const get = (path: string, init: RequestInit = {}) => fetch(`${server.url}${path}`, init)

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'finance-web-'))
    outside = await mkdtemp(join(tmpdir(), 'finance-secret-'))
    await mkdir(join(root, 'assets'))
    await writeFile(join(root, 'index.html'), page)
    await writeFile(join(root, 'sw.js'), 'self')
    await writeFile(join(root, 'assets', 'index-a1b2c3.js'), script)
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(outside, join(root, 'linked'))
    server = await listen(api({} as Database, {} as ImportUploads, nobody, ['127.0.0.1'], [], site(root)), 0, '127.0.0.1')
  })

  after(async () => {
    await server.close()
    await rm(root, { recursive: true })
    await rm(outside, { recursive: true })
  })

  test('the root and deep links answer the page without a session, revalidated', async () => {
    for (const path of ['/', '/decisoes', '/importar/12?aba=itens']) {
      const response = await get(path)
      assert.equal(response.status, 200, path)
      assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8')
      assert.equal(response.headers.get('cache-control'), revalidate)
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('x-frame-options'), 'DENY')
      assert.equal(await response.text(), page)
    }
  })

  test('hashed assets are immutable, other files revalidate', async () => {
    const asset = await get('/assets/index-a1b2c3.js')
    assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8')
    assert.equal(asset.headers.get('cache-control'), immutable)
    assert.equal(await asset.text(), script)
    const worker = await get('/sw.js')
    assert.equal(worker.headers.get('cache-control'), revalidate)
    await worker.body?.cancel()
  })

  test('a matching etag answers 304 and HEAD answers no body', async () => {
    const first = await get('/')
    await first.body?.cancel()
    const etag = first.headers.get('etag') ?? ''
    assert.match(etag, /^W\/"/)
    const again = await get('/', { headers: { 'if-none-match': etag } })
    assert.equal(again.status, 304)
    const head = await get('/sw.js', { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.headers.get('content-length'), '4')
    assert.equal(await head.text(), '')
  })

  test('api and auth paths never fall back to the page', async () => {
    for (const path of ['/api/nope', '/api', '/auth/nope']) {
      const response = await get(path)
      assert.equal(response.status, 404, path)
      assert.deepEqual(await response.json(), { error: 'not found' })
    }
    const guarded = await get('/api/debts')
    assert.equal(guarded.status, 401)
    await guarded.body?.cancel()
  })

  test('missing files, writes and paths outside the build are not served', async () => {
    for (const path of ['/assets/gone.js', `/..%2f${basename(outside)}%2fsecret.txt`, '/linked/secret.txt', '/%E0%A4%A.js', '/a%00b.js']) {
      const response = await get(path)
      assert.equal(response.status, 404, path)
      assert.notEqual(await response.text(), 'secret')
    }
    const write = await get('/decisoes', { method: 'POST' })
    assert.equal(write.status, 404)
    await write.body?.cancel()
  })

  test('without WEB_ROOT nothing is served outside the api', async () => {
    assert.equal(site(undefined), undefined)
    const handle = api({} as Database, {} as ImportUploads, nobody, ['localhost'], [], undefined)
    const response = await handle(new Request('http://localhost/', { headers: { host: 'localhost' } }))
    assert.equal(response.status, 404)
  })
})
