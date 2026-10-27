import assert from 'node:assert/strict'
import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { connectPool } from '../../src/db/connection.ts'
import { linkMember } from '../../src/db/link-member.ts'
import { seed } from '../../src/db/seed.ts'
import { api, routes } from '../../src/http/api.ts'
import { bearerOf, jwksOf, verifyToken } from '../../src/http/auth.ts'
import { HttpError } from '../../src/http/body.ts'
import { entraVerifier, localVerifier, verifierFor } from '../../src/http/identity.ts'
import { testDatabase } from '../db/database.ts'

const issuer = 'https://login.example.test/tenant/v2.0'
const audience = 'api://finance'
const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048 })
const trusted = pair()
const stranger = pair()
const keys = async (kid: string) => (kid === 'k1' ? trusted.publicKey : undefined)
const rules = { issuer, audience, keys }
const seconds = () => Math.floor(Date.now() / 1000)

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

const tokenOf = (claims: Record<string, unknown> = {}, { key = trusted.privateKey, header = { alg: 'RS256', kid: 'k1' } }: { key?: KeyObject; header?: Record<string, unknown> } = {}) => {
  const body = `${encode(header)}.${encode({ iss: issuer, aud: audience, exp: seconds() + 600, nbf: seconds() - 10, oid: 'oid-marcio', ...claims })}`
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`
}

const refused = (status: number, message: string) => (caught: unknown) => caught instanceof HttpError && caught.status === status && caught.message === message

describe('token verification', () => {
  test('a valid token yields its claims', async () => {
    assert.equal((await verifyToken(tokenOf(), rules)).oid, 'oid-marcio')
    assert.equal((await verifyToken(tokenOf({ aud: ['other', audience] }), rules)).oid, 'oid-marcio')
  })

  test('expired, wrong audience, wrong issuer and not yet valid tokens are refused', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ exp: seconds() - 120 }, 'expired'],
      [{ exp: undefined }, 'expired'],
      [{ aud: 'api://other' }, 'audience'],
      [{ iss: 'https://evil.example.test/v2.0' }, 'issuer'],
      [{ nbf: seconds() + 600 }, 'not yet valid'],
    ]
    for (const [claims, reason] of cases) await assert.rejects(verifyToken(tokenOf(claims), rules), refused(401, `invalid token: ${reason}`))
  })

  test('a bad signature, an unknown key, another algorithm or garbage is refused', async () => {
    await assert.rejects(verifyToken(tokenOf({}, { key: stranger.privateKey }), rules), refused(401, 'invalid token: signature'))
    const [header, , signature] = tokenOf().split('.')
    await assert.rejects(verifyToken(`${header}.${encode({ iss: issuer, aud: audience, exp: seconds() + 600, oid: 'oid-gabriela' })}.${signature}`, rules), refused(401, 'invalid token: signature'))
    await assert.rejects(verifyToken(tokenOf({}, { header: { alg: 'RS256', kid: 'k9' } }), rules), refused(401, 'invalid token: key'))
    await assert.rejects(verifyToken(tokenOf({}, { header: { alg: 'none', kid: 'k1' } }), rules), refused(401, 'invalid token: algorithm'))
    await assert.rejects(verifyToken(tokenOf({}, { header: { alg: 'HS256', kid: 'k1' } }), rules), refused(401, 'invalid token: algorithm'))
    for (const garbage of ['abc', 'a.b.c', '..']) await assert.rejects(verifyToken(garbage, rules), refused(401, 'invalid token: malformed'))
  })

  test('the bearer is read from the authorization header', () => {
    const request = (authorization?: string) => new Request('http://localhost/api', { headers: authorization ? { authorization } : {} })
    assert.equal(bearerOf(request()), undefined)
    assert.equal(bearerOf(request('bearer abc')), 'abc')
    for (const header of ['Basic abc', 'Bearer', 'Bearer a b']) assert.throws(() => bearerOf(request(header)), refused(401, 'invalid token: expected Bearer'))
  })
})

describe('issuer keys', () => {
  const jwk = { ...trusted.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' }
  const discovery = (calls: string[], fail = false) =>
    (async (url: string) => {
      calls.push(url)
      if (fail) return new Response('down', { status: 500 })
      if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ jwks_uri: 'https://login.example.test/keys' })
      return Response.json({ keys: [jwk, { kty: 'EC', kid: 'e1' }, { ...jwk, kid: 'enc', use: 'enc' }] })
    }) as typeof fetch

  test('keys come from the discovery document, are cached and refreshed for an unknown kid at most once a minute', async () => {
    const calls: string[] = []
    let clock = 0
    const source = jwksOf(`${issuer}/`, { fetcher: discovery(calls), now: () => clock })
    assert.ok(await source('k1'))
    assert.deepEqual(calls, [`${issuer}/.well-known/openid-configuration`, 'https://login.example.test/keys'])
    assert.ok(await source('k1'))
    assert.equal(await source('e1'), undefined)
    assert.equal(await source('enc'), undefined)
    assert.equal(calls.length, 2)
    clock = 61_000
    assert.equal(await source('k2'), undefined)
    assert.equal(calls.length, 4)
    assert.equal((await verifyToken(tokenOf(), { issuer, audience, keys: source })).oid, 'oid-marcio')
  })

  test('an unreachable issuer answers 503', async () => {
    await assert.rejects(jwksOf(issuer, { fetcher: discovery([], true) })('k1'), refused(503, 'token keys unavailable'))
  })
})

describe('entra mode', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  const verify = entraVerifier(rules)
  const request = (headers: Record<string, string> = {}) => new Request('http://localhost/api/debts', { headers })

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    await linkMember(db.client, 'Marcio', 'oid-marcio')
    pool = connectPool(db.url)
  })

  after(async () => {
    await pool.end()
    await db.drop()
  })

  test('the token oid maps to its member and x-member is ignored', async () => {
    assert.equal((await verify(pool, request({ authorization: `Bearer ${tokenOf()}` })))?.name, 'Marcio')
    assert.equal(await verify(pool, request({ 'x-member': 'Marcio' })), undefined)
  })

  test('a valid token without a mapped member or without oid is refused', async () => {
    await assert.rejects(verify(pool, request({ authorization: `Bearer ${tokenOf({ oid: 'oid-unknown' })}` })), refused(403, 'unknown member'))
    await assert.rejects(verify(pool, request({ authorization: `Bearer ${tokenOf({ oid: undefined })}` })), refused(401, 'invalid token: oid'))
  })

  test('a member closed after linking is refused', async () => {
    await db.client.query("insert into member (name, share_percent, closed_at, external_id) values ('Ana', 0, now(), 'oid-ana')")
    await assert.rejects(verify(pool, request({ authorization: `Bearer ${tokenOf({ oid: 'oid-ana' })}` })), refused(403, 'unknown member'))
  })

  test('linking is audited and refuses an id held by another member or an unknown member', async () => {
    const { rows } = await db.client.query("select after->>'external_id' as linked from audit_log where entity = 'member' and action = 'update' and author = 'system'")
    assert.deepEqual(rows, [{ linked: 'oid-marcio' }])
    await assert.rejects(linkMember(db.client, 'Gabriela', 'oid-marcio'), /already linked to Marcio/)
    await assert.rejects(linkMember(db.client, 'Mallory', 'oid-x'), /not found/)
    await assert.rejects(linkMember(db.client, 'Gabriela', ' '), /empty/)
  })

  test('the API answers through the token: reads, writes, 401 and 403', async () => {
    const handle = api(pool, undefined, verify)
    const call = (path: string, headers: Record<string, string>, method = 'GET') => handle(new Request(`http://localhost/api${path}`, { method, headers: { host: 'localhost', ...headers } }))
    assert.equal((await call('/audit?limit=1', { authorization: `Bearer ${tokenOf()}` })).status, 200)
    const me = await call('/me', { authorization: `Bearer ${tokenOf()}` })
    assert.equal((await me.json()).name, 'Marcio')
    const anonymous = await call('/audit?limit=1', { 'x-member': 'Marcio' })
    assert.equal(anonymous.status, 401)
    assert.deepEqual(await anonymous.json(), { error: 'this request needs a bearer token' })
    const expired = await call('/debts', { authorization: `Bearer ${tokenOf({ exp: seconds() - 600 })}` })
    assert.deepEqual([expired.status, await expired.json()], [401, { error: 'invalid token: expired' }])
    assert.equal((await call('/debts', { authorization: `Bearer ${tokenOf({ oid: 'oid-unknown' })}` })).status, 403)
  })

  test('every route needs a token except the OpenAPI document and health', async () => {
    const handle = api(pool, undefined, verify)
    const sample = (path: string) => path.replace(/:month/g, '2026-10').replace(/:\w+/g, '1')
    for (const route of routes) {
      const path = sample(route.path)
      const answer = await handle(new Request(`http://localhost/api${path}`, { method: route.method, headers: { host: 'localhost', 'x-member': 'Marcio' } }))
      if (route.open) assert.equal(answer.status, 200, `${route.method} ${path}`)
      else assert.deepEqual([answer.status, await answer.json()], [401, { error: 'this request needs a bearer token' }], `${route.method} ${path}`)
    }
    assert.deepEqual(
      routes.filter((route) => route.open).map(({ path }) => path),
      ['/openapi.json', '/health'],
    )
  })
})

describe('AUTH_MODE', () => {
  const saved = { ...process.env }
  after(() => {
    process.env = saved
  })

  test('local is the default and entra needs issuer and audience', () => {
    assert.equal(verifierFor(''), localVerifier)
    assert.equal(verifierFor('local'), localVerifier)
    delete process.env.ENTRA_ISSUER
    process.env.ENTRA_AUDIENCE = audience
    assert.throws(() => verifierFor('entra'), /AUTH_MODE entra needs ENTRA_ISSUER/)
    process.env.ENTRA_ISSUER = issuer
    delete process.env.ENTRA_AUDIENCE
    assert.throws(() => verifierFor('entra'), /AUTH_MODE entra needs ENTRA_AUDIENCE/)
    process.env.ENTRA_AUDIENCE = audience
    assert.equal(verifierFor('entra').credential, 'a bearer token')
    assert.throws(() => verifierFor('token'), /AUTH_MODE token is not enabled; use local, entra/)
    assert.throws(() => verifierFor('toString'), /not enabled/)
  })
})
