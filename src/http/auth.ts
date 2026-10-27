import { createPublicKey, type JsonWebKey, type KeyObject, verify } from 'node:crypto'
import { HttpError } from './body.ts'

export type Claims = { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; oid?: string; [claim: string]: unknown }

export type KeySource = (kid: string) => Promise<KeyObject | undefined>

export type TokenRules = { issuer: string; audience: string; keys: KeySource; now?: () => number }

const skewSeconds = 60
const refreshMs = 60_000

const invalid = (reason: string) => new HttpError(401, `invalid token: ${reason}`)

const decode = (part: string) => {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    throw invalid('malformed')
  }
}

export const bearerOf = (request: Request) => {
  const header = request.headers.get('authorization')
  if (header === null) return undefined
  const [scheme, token, ...rest] = header.trim().split(/\s+/)
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length) throw invalid('expected Bearer')
  return token
}

export const verifyToken = async (token: string, { issuer, audience, keys, now = Date.now }: TokenRules): Promise<Claims> => {
  const parts = token.split('.')
  if (parts.length !== 3) throw invalid('malformed')
  const [header, payload, signature] = parts as [string, string, string]
  const { alg, kid } = decode(header)
  if (alg !== 'RS256') throw invalid('algorithm')
  if (typeof kid !== 'string') throw invalid('key')
  const key = await keys(kid)
  if (!key) throw invalid('key')
  if (!verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), key, Buffer.from(signature, 'base64url'))) throw invalid('signature')
  const claims: Claims = decode(payload)
  const seconds = now() / 1000
  if (claims.iss !== issuer) throw invalid('issuer')
  if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience)) throw invalid('audience')
  if (typeof claims.exp !== 'number' || claims.exp + skewSeconds <= seconds) throw invalid('expired')
  if (typeof claims.nbf === 'number' && claims.nbf - skewSeconds > seconds) throw invalid('not yet valid')
  return claims
}

const json = async (url: string, fetcher: typeof fetch) => {
  const answer = await fetcher(url)
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}`)
  return answer.json()
}

export const jwksOf = (issuer: string, { fetcher = fetch, now = Date.now }: { fetcher?: typeof fetch; now?: () => number } = {}): KeySource => {
  let keys = new Map<string, KeyObject>()
  let loaded = Number.NEGATIVE_INFINITY
  let loading: Promise<void> | undefined
  const load = async () => {
    const { jwks_uri } = await json(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, fetcher)
    const { keys: listed } = await json(jwks_uri, fetcher)
    const usable = (listed as (JsonWebKey & { kid?: string; use?: string })[]).filter(({ kty, kid, use }) => kty === 'RSA' && kid && (use ?? 'sig') === 'sig')
    keys = new Map(usable.map((jwk) => [jwk.kid as string, createPublicKey({ key: jwk, format: 'jwk' })]))
    loaded = now()
  }
  return async (kid) => {
    if (!keys.has(kid) && now() - loaded >= refreshMs) {
      loading ??= load().finally(() => {
        loading = undefined
      })
      try {
        await loading
      } catch {
        throw new HttpError(503, 'token keys unavailable')
      }
    }
    return keys.get(kid)
  }
}
