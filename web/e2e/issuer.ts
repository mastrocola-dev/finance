import { createHash, createSign, generateKeyPairSync } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import { e2eIssuer, entraPreview } from './context.ts'

const kid = 'e2e-key'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' }

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

const sign = (claims: object) => {
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode(claims)}`
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url')}`
}

type Grant = { member: string; nonce: string; challenge: string; clientId: string; redirectUri: string }

const codes = new Map<string, Grant>()

const tokensOf = ({ member, nonce }: Grant) => {
  const oid = e2eIssuer.members[member as keyof typeof e2eIssuer.members]
  const now = Math.floor(Date.now() / 1000)
  const lasting = { iat: now - 30 * 86_400, nbf: now - 30 * 86_400, exp: now + 30 * 86_400 }
  const common = { iss: e2eIssuer.issuer, tid: e2eIssuer.tenant, oid, sub: oid, ...lasting }
  return {
    token_type: 'Bearer',
    scope: 'openid profile',
    expires_in: 3600,
    ext_expires_in: 3600,
    access_token: sign({ ...common, aud: e2eIssuer.audience, scp: 'access' }),
    id_token: sign({ ...common, aud: entraPreview.clientId, nonce, name: member, preferred_username: `${member.toLowerCase()}@caixa-e2e.example` }),
  }
}

const bodyOf = async (request: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk)
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', e2eIssuer.origin)
  const json = (value: object, status = 200) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
  if (url.pathname.endsWith('/openid-configuration'))
    return json({
      issuer: e2eIssuer.issuer,
      authorization_endpoint: `${e2eIssuer.origin}/oauth2/v2.0/authorize`,
      token_endpoint: `${e2eIssuer.origin}/oauth2/v2.0/token`,
      end_session_endpoint: `${e2eIssuer.origin}/oauth2/v2.0/logout`,
      jwks_uri: `${e2eIssuer.origin}/discovery/v2.0/keys`,
      response_modes_supported: ['query'],
      code_challenge_methods_supported: ['S256'],
    })
  if (url.pathname === '/discovery/v2.0/keys') return json({ keys: [jwk] })
  if (url.pathname === '/oauth2/v2.0/authorize') {
    const query = Object.fromEntries(url.searchParams)
    const member = /(?:^|; )e2e\.member=(\w+)/.exec(request.headers.cookie ?? '')?.[1] ?? 'Marcio'
    if (!Object.hasOwn(e2eIssuer.members, member)) return response.writeHead(400).end('unknown member')
    if (query.client_id !== entraPreview.clientId || query.response_type !== 'code' || query.code_challenge_method !== 'S256' || !query.code_challenge || !query.redirect_uri) return response.writeHead(400).end('bad authorization request')
    const code = crypto.randomUUID()
    codes.set(code, { member, nonce: query.nonce ?? '', challenge: query.code_challenge, clientId: query.client_id, redirectUri: query.redirect_uri })
    const target = new URL(query.redirect_uri)
    target.search = new URLSearchParams({ code, state: query.state ?? '' }).toString()
    return response.writeHead(302, { location: target.href }).end()
  }
  if (url.pathname === '/oauth2/v2.0/token' && request.method === 'POST') {
    const form = await bodyOf(request)
    const code = form.get('code') ?? ''
    const grant = codes.get(code)
    codes.delete(code)
    const valid = grant && form.get('grant_type') === 'authorization_code' && form.get('client_id') === grant.clientId && form.get('redirect_uri') === grant.redirectUri && challengeOf(form.get('code_verifier') ?? '') === grant.challenge
    if (!valid) return json({ error: 'invalid_grant' }, 400)
    return json(tokensOf(grant))
  }
  if (url.pathname === '/oauth2/v2.0/logout') return response.writeHead(302, { location: url.searchParams.get('post_logout_redirect_uri') ?? '/' }).end()
  response.writeHead(404).end()
}).listen(Number(new URL(e2eIssuer.origin).port), '127.0.0.1')
