import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { connectPool } from '../../src/db/connection.ts'
import { linkMember } from '../../src/db/link-member.ts'
import { seed } from '../../src/db/seed.ts'
import { api } from '../../src/http/api.ts'
import { entraVerifier, localVerifier, verifierFor } from '../../src/http/identity.ts'
import { cookiesOf, loginCookie, seal, session, sessionCookie, sessionKeyOf, sessionMs, signInFailed, unseal } from '../../src/http/session.ts'
import { testDatabase } from '../db/database.ts'

const issuer = 'https://login.example.test/tenant/v2.0'
const clientId = 'finance-web'
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const keys = async (kid: string) => (kid === 'k1' ? pair.publicKey : undefined)
const key = randomBytes(32)
const seconds = () => Math.floor(Date.now() / 1000)
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

const idToken = (claims: Record<string, unknown>) => {
  const body = `${encode({ alg: 'RS256', kid: 'k1' })}.${encode({ iss: issuer, aud: clientId, exp: seconds() + 600, oid: 'oid-marcio', ...claims })}`
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), pair.privateKey).toString('base64url')}`
}

const provider = (claims: () => Record<string, unknown> = () => ({})) => {
  const exchanges: URLSearchParams[] = []
  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ authorization_endpoint: 'https://login.example.test/authorize', token_endpoint: 'https://login.example.test/token', end_session_endpoint: 'https://login.example.test/logout' })
    const form = new URLSearchParams(String(init?.body))
    exchanges.push(form)
    if (form.get('code') !== 'good-code') return Response.json({ error: 'invalid_grant' }, { status: 400 })
    return Response.json({ id_token: idToken(claims()) })
  }) as typeof fetch
  return { fetcher, exchanges }
}

const cookieOf = (answer: Response, name: string) =>
  answer.headers
    .getSetCookie()
    .find((item) => item.startsWith(`${name}=`))
    ?.split(';')[0]
    ?.slice(name.length + 1)

const loginFlow = async (signedIn: ReturnType<typeof session>, to = '/decisoes') => {
  const answer = (await signedIn.handle(new Request(`http://localhost:3200/auth/login?to=${encodeURIComponent(to)}`))) as Response
  const location = new URL(answer.headers.get('location') ?? '')
  return { answer, location, pending: cookieOf(answer, loginCookie) as string }
}

describe('session cookie sealing', () => {
  test('a sealed value opens with the same key and name only', () => {
    const sealed = seal(key, sessionCookie, { oid: 'x' })
    assert.deepEqual(unseal(key, sessionCookie, sealed), { oid: 'x' })
    assert.equal(unseal(randomBytes(32), sessionCookie, sealed), undefined)
    assert.equal(unseal(key, loginCookie, sealed), undefined)
    const bytes = Buffer.from(sealed, 'base64url')
    bytes[bytes.length - 1] = (bytes.at(-1) as number) ^ 1
    assert.equal(unseal(key, sessionCookie, bytes.toString('base64url')), undefined)
    assert.equal(unseal(key, sessionCookie, 'garbage'), undefined)
  })

  test('the key must be 32 bytes in base64 and cookies parse', () => {
    assert.equal(sessionKeyOf(key.toString('base64')).length, 32)
    assert.throws(() => sessionKeyOf('c2hvcnQ='), /32 bytes/)
    assert.deepEqual(
      [...cookiesOf(new Request('http://localhost', { headers: { cookie: 'a=1; b=x=y; c' } }))],
      [
        ['a', '1'],
        ['b', 'x=y'],
      ],
    )
  })
})

describe('authorization code flow', () => {
  test('login redirects to the provider with PKCE, state and nonce in a short-lived cookie', async () => {
    const { fetcher } = provider()
    const { answer, location, pending } = await loginFlow(session({ issuer, clientId, key, keys, fetcher }))
    assert.equal(answer.status, 302)
    assert.equal(location.origin + location.pathname, 'https://login.example.test/authorize')
    const query = Object.fromEntries(location.searchParams)
    assert.equal(query.client_id, clientId)
    assert.equal(query.response_type, 'code')
    assert.equal(query.redirect_uri, 'http://localhost:3200/auth/callback')
    assert.equal(query.scope, 'openid profile')
    assert.equal(query.prompt, 'select_account')
    assert.equal(query.code_challenge_method, 'S256')
    const opened = unseal(key, loginCookie, pending)
    assert.equal(query.state, opened.state)
    assert.equal(query.nonce, opened.nonce)
    assert.equal(query.code_challenge, createHash('sha256').update(opened.verifier).digest('base64url'))
    assert.equal(opened.to, '/decisoes')
    const header = answer.headers.getSetCookie()[0] as string
    assert.match(header, /; Path=\/auth; Max-Age=600; HttpOnly; SameSite=Lax$/)
  })

  test('the return path stays on this origin and cookies are Secure outside localhost', async () => {
    const { fetcher } = provider()
    const signedIn = session({ issuer, clientId, key, keys, fetcher, publicUrl: 'https://caixa.example.test' })
    for (const to of ['//evil.test', 'https://evil.test', '/\\evil.test', 'decisoes']) assert.equal(unseal(key, loginCookie, (await loginFlow(signedIn, to)).pending).to, '/')
    const { answer, location } = await loginFlow(signedIn)
    assert.equal(location.searchParams.get('redirect_uri'), 'https://caixa.example.test/auth/callback')
    assert.match(answer.headers.getSetCookie()[0] as string, /; Secure$/)
  })

  test('the callback exchanges the code with the verifier and sets an eight-hour session', async () => {
    const claims: Record<string, unknown> = {}
    const { fetcher, exchanges } = provider(() => claims)
    const signedIn = session({ issuer, clientId, clientSecret: 'secret', key, keys, fetcher })
    const { location, pending } = await loginFlow(signedIn)
    claims.nonce = unseal(key, loginCookie, pending).nonce
    const answer = (await signedIn.handle(new Request(`http://localhost:3200/auth/callback?code=good-code&state=${location.searchParams.get('state')}`, { headers: { cookie: `${loginCookie}=${pending}` } }))) as Response
    assert.equal(answer.status, 302)
    assert.equal(answer.headers.get('location'), '/decisoes')
    const form = exchanges[0] as URLSearchParams
    assert.equal(form.get('code_verifier'), unseal(key, loginCookie, pending).verifier)
    assert.equal(form.get('client_secret'), 'secret')
    assert.equal(form.get('grant_type'), 'authorization_code')
    const sealed = cookieOf(answer, sessionCookie) as string
    const opened = unseal(key, sessionCookie, sealed)
    assert.equal(opened.oid, 'oid-marcio')
    assert.ok(Math.abs(opened.exp - Date.now() - sessionMs) < 5000)
    assert.match(answer.headers.getSetCookie().find((item) => item.startsWith(sessionCookie)) as string, /; Path=\/; Max-Age=28800; HttpOnly; SameSite=Lax$/)
    assert.equal(cookieOf(answer, loginCookie), '')
    assert.equal(signedIn.oidOf(new Request('http://localhost', { headers: { cookie: `${sessionCookie}=${sealed}` } })), 'oid-marcio')
  })
})

describe('signed-in API', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  const { fetcher } = provider()
  const signedIn = session({ issuer, clientId, key, keys, fetcher })
  const verify = entraVerifier({ issuer, audience: 'api://finance', keys }, signedIn)
  const live = (claims: Record<string, unknown> = {}) => `${sessionCookie}=${seal(key, sessionCookie, { oid: 'oid-marcio', exp: Date.now() + 60_000, ...claims })}`

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

  const call = (path: string, headers: Record<string, string>, init: RequestInit = {}) => api(pool, undefined, verify)(new Request(`http://localhost${path}`, { ...init, headers: { host: 'localhost', ...headers } }))

  test('a bad state, a missing sign-in, a bad code, a wrong nonce or a foreign token goes back to the sign-in screen', async () => {
    const cases: [Record<string, unknown>, string, string, string][] = [
      [{}, 'wrong-state', 'good-code', 'state'],
      [{}, '', 'bad-code', 'token'],
      [{ nonce: 'other' }, '', 'good-code', 'nonce'],
      [{ aud: 'someone-else' }, '', 'good-code', 'invalid token: audience'],
    ]
    for (const [claims, state, code, reason] of cases) {
      const { fetcher } = provider(() => claims)
      const signedIn = session({ issuer, clientId, key, keys, fetcher })
      const { location, pending } = await loginFlow(signedIn)
      const handle = api(pool, undefined, entraVerifier({ issuer, audience: 'api://finance', keys }, signedIn))
      const answer = await handle(new Request(`http://localhost/auth/callback?code=${code}&state=${state || location.searchParams.get('state')}`, { headers: { host: 'localhost', cookie: `${loginCookie}=${pending}` } }))
      assert.deepEqual([answer.status, answer.headers.get('location')], [302, signInFailed], reason)
      assert.equal(cookieOf(answer, sessionCookie), undefined)
      assert.equal(cookieOf(answer, loginCookie), '')
    }
    const { fetcher } = provider()
    const signedIn = session({ issuer, clientId, key, keys, fetcher })
    const missing = (await signedIn.handle(new Request('http://localhost/auth/callback?code=good-code&state=x'))) as Response
    assert.deepEqual([missing.status, missing.headers.get('location')], [302, '/?entrada=falhou'])
  })

  test('the session cookie identifies the member', async () => {
    const me = await call('/api/me', { cookie: live() })
    assert.deepEqual([me.status, (await me.json()).name], [200, 'Marcio'])
    assert.equal((await call('/api/me', { cookie: live({ oid: 'oid-unknown' }) })).status, 403)
  })

  test('expired and tampered cookies count as signed out', async () => {
    for (const cookie of [live({ exp: Date.now() - 1 }), `${live().slice(0, -2)}xx`, `${sessionCookie}=${seal(randomBytes(32), sessionCookie, { oid: 'oid-marcio', exp: Date.now() + 60_000 })}`]) {
      const answer = await call('/api/me', { cookie })
      assert.deepEqual([answer.status, await answer.json()], [401, { error: 'this request needs a signed-in session or a bearer token' }])
    }
  })

  test('a write with the cookie needs an Origin of this API', async () => {
    const body = JSON.stringify({ title: 'Teste', description: 'x', amount_cents: 100 })
    const write = (headers: Record<string, string>) => call('/api/decisions', { cookie: live(), 'content-type': 'application/json', ...headers }, { method: 'POST', body })
    const missing = await write({})
    assert.deepEqual([missing.status, await missing.json()], [403, { error: 'a signed-in write needs an Origin header' }])
    assert.equal((await write({ origin: 'https://evil.example.test' })).status, 403)
    assert.notEqual((await write({ origin: 'http://localhost:3200' })).status, 403)
  })

  test('logout clears the cookie, needs an Origin and offers the provider logout', async () => {
    assert.equal((await call('/auth/logout', { cookie: live() }, { method: 'POST' })).status, 403)
    const answer = await call('/auth/logout', { cookie: live(), origin: 'http://localhost:3200' }, { method: 'POST' })
    assert.equal(answer.status, 200)
    assert.deepEqual(await answer.json(), { logout_url: 'https://login.example.test/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%2F' })
    assert.match(answer.headers.get('set-cookie') ?? '', /^finance\.session=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax$/)
    assert.equal((await call('/auth/logout', {})).status, 405)
    assert.equal((await call('/auth/nope', {})).status, 404)
  })

  test('local mode has no session routes and ignores the cookie', async () => {
    const handle = api(pool, undefined, localVerifier)
    const login = await handle(new Request('http://localhost/auth/login', { headers: { host: 'localhost' } }))
    assert.equal(login.status, 404)
    const me = await handle(new Request('http://localhost/api/me', { headers: { host: 'localhost', cookie: live() } }))
    assert.equal(me.status, 401)
    const named = await handle(new Request('http://localhost/api/me', { headers: { host: 'localhost', 'x-member': 'Gabriela' } }))
    assert.equal((await named.json()).name, 'Gabriela')
  })
})

describe('AUTH_MODE entra needs the session', () => {
  const saved = { ...process.env }
  after(() => {
    process.env = saved
  })

  test('the entra API needs a client id and a valid session key, MCP does not', () => {
    Object.assign(process.env, { ENTRA_ISSUER: issuer, ENTRA_AUDIENCE: 'api://finance', SESSION_KEY: key.toString('base64') })
    delete process.env.ENTRA_CLIENT_ID
    assert.throws(() => verifierFor('entra', true), /AUTH_MODE entra needs ENTRA_CLIENT_ID/)
    process.env.ENTRA_CLIENT_ID = clientId
    assert.equal(verifierFor('entra', true).credential, 'a signed-in session or a bearer token')
    process.env.SESSION_KEY = 'c2hvcnQ='
    assert.throws(() => verifierFor('entra', true), /32 bytes/)
    delete process.env.SESSION_KEY
    assert.throws(() => verifierFor('entra', true), /AUTH_MODE entra needs SESSION_KEY/)
    assert.equal(verifierFor('entra').session, undefined)
  })
})
