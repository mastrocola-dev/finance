import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { type KeySource, verifyToken } from './auth.ts'
import { HttpError } from './body.ts'

export type SessionConfig = {
  issuer: string
  clientId: string
  clientSecret?: string
  scopes?: string
  key: Buffer
  keys: KeySource
  publicUrl?: string
  fetcher?: typeof fetch
  now?: () => number
}

export type Session = {
  handle: (request: Request) => Promise<Response | undefined>
  oidOf: (request: Request) => string | undefined
  carries: (request: Request) => boolean
}

type Endpoints = { authorization_endpoint: string; token_endpoint: string; end_session_endpoint?: string }

export const sessionCookie = 'finance.session'
export const loginCookie = 'finance.login'
export const sessionMs = 8 * 60 * 60 * 1000
export const signInFailed = '/?entrada=falhou'
const loginMs = 10 * 60 * 1000
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

export const sessionKeyOf = (value: string) => {
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('SESSION_KEY must be 32 bytes in base64')
  return key
}

export const seal = (key: Buffer, name: string, value: unknown) => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv).setAAD(Buffer.from(name))
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

export const unseal = (key: Buffer, name: string, sealed: string) => {
  try {
    const bytes = Buffer.from(sealed, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)).setAAD(Buffer.from(name))
    decipher.setAuthTag(bytes.subarray(12, 28))
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'))
  } catch {
    return undefined
  }
}

export const cookiesOf = (request: Request) =>
  new Map(
    (request.headers.get('cookie') ?? '')
      .split(';')
      .map((pair) => pair.trim().split('='))
      .filter(([name, value]) => name && value !== undefined)
      .map(([name, ...value]) => [name as string, value.join('=')]),
  )

const same = (left: string, right: string) => left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right))

const returnPath = (value: string | null) => (value && /^\/(?![/\\])/.test(value) && !value.includes('\\') ? value : '/')

const failed = (reason: string) => new HttpError(400, `sign-in failed: ${reason}`)

export const session = ({ issuer, clientId, clientSecret, scopes = 'openid profile', key, keys, publicUrl, fetcher = fetch, now = Date.now }: SessionConfig): Session => {
  let endpoints: Promise<Endpoints> | undefined
  const discover = () => {
    endpoints ??= fetcher(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)
      .then((answer) => {
        if (!answer.ok) throw new Error(`discovery answered ${answer.status}`)
        return answer.json() as Promise<Endpoints>
      })
      .catch((caught) => {
        endpoints = undefined
        throw caught
      })
    return endpoints.catch(() => {
      throw new HttpError(503, 'identity provider unavailable')
    })
  }

  const originOf = (request: Request) => new URL(publicUrl ?? request.url).origin
  const cookie = (request: Request, name: string, value: string, path: string, seconds: number) => {
    const secure = localHosts.has(new URL(originOf(request)).hostname) ? '' : '; Secure'
    return `${name}=${value}; Path=${path}; Max-Age=${seconds}; HttpOnly; SameSite=Lax${secure}`
  }
  const redirect = (location: string, ...cookies: string[]) => {
    const headers = new Headers({ location, 'cache-control': 'no-store' })
    for (const item of cookies) headers.append('set-cookie', item)
    return new Response(null, { status: 302, headers })
  }
  const opened = (request: Request, name: string) => {
    const sealed = cookiesOf(request).get(name)
    const value = sealed ? unseal(key, name, sealed) : undefined
    return value && typeof value.exp === 'number' && value.exp > now() ? value : undefined
  }

  const login = async (request: Request) => {
    const { authorization_endpoint } = await discover()
    const verifier = randomBytes(32).toString('base64url')
    const state = randomBytes(16).toString('base64url')
    const nonce = randomBytes(16).toString('base64url')
    const to = returnPath(new URL(request.url).searchParams.get('to'))
    const target = new URL(authorization_endpoint)
    const query = {
      client_id: clientId,
      response_type: 'code',
      response_mode: 'query',
      redirect_uri: `${originOf(request)}/auth/callback`,
      scope: scopes,
      prompt: 'select_account',
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }
    for (const [name, value] of Object.entries(query)) target.searchParams.set(name, value)
    return redirect(target.href, cookie(request, loginCookie, seal(key, loginCookie, { state, nonce, verifier, to, exp: now() + loginMs }), '/auth', loginMs / 1000))
  }

  const exchange = async (request: Request) => {
    const params = new URL(request.url).searchParams
    const pending = opened(request, loginCookie)
    if (!pending) throw failed('no sign-in in progress')
    if (!same(params.get('state') ?? '', pending.state)) throw failed('state')
    if (params.has('error')) throw failed(params.get('error') ?? 'error')
    const code = params.get('code')
    if (!code) throw failed('code')
    const { token_endpoint } = await discover()
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${originOf(request)}/auth/callback`, client_id: clientId, code_verifier: pending.verifier })
    if (clientSecret) form.set('client_secret', clientSecret)
    const answer = await fetcher(token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form })
    if (!answer.ok) throw failed('token')
    const { id_token } = await answer.json()
    if (typeof id_token !== 'string') throw failed('token')
    const claims = await verifyToken(id_token, { issuer, audience: clientId, keys, now })
    if (typeof claims.nonce !== 'string' || !same(claims.nonce, pending.nonce)) throw failed('nonce')
    if (typeof claims.oid !== 'string' || !claims.oid) throw failed('oid')
    return redirect(pending.to, cookie(request, sessionCookie, seal(key, sessionCookie, { oid: claims.oid, exp: now() + sessionMs }), '/', sessionMs / 1000), cookie(request, loginCookie, '', '/auth', 0))
  }

  const callback = (request: Request) => exchange(request).catch(() => redirect(signInFailed, cookie(request, loginCookie, '', '/auth', 0)))

  const logout = async (request: Request) => {
    const { end_session_endpoint } = await discover().catch(() => ({ end_session_endpoint: undefined }))
    const target = end_session_endpoint ? new URL(end_session_endpoint) : undefined
    target?.searchParams.set('post_logout_redirect_uri', `${originOf(request)}/`)
    return Response.json({ logout_url: target?.href ?? null }, { headers: { 'set-cookie': cookie(request, sessionCookie, '', '/', 0), 'cache-control': 'no-store' } })
  }

  const actions: Record<string, [string, (request: Request) => Promise<Response>]> = {
    '/auth/login': ['GET', login],
    '/auth/callback': ['GET', callback],
    '/auth/logout': ['POST', logout],
  }

  return {
    handle: async (request) => {
      const { pathname } = new URL(request.url)
      if (!Object.hasOwn(actions, pathname)) return undefined
      const [method, run] = actions[pathname] as [string, (request: Request) => Promise<Response>]
      if (request.method !== method) return Response.json({ error: 'method not allowed' }, { status: 405, headers: { allow: method } })
      return run(request)
    },
    oidOf: (request) => opened(request, sessionCookie)?.oid,
    carries: (request) => cookiesOf(request).has(sessionCookie),
  }
}
