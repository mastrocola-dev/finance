import { createSign, generateKeyPairSync } from 'node:crypto'
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

const codes = new Map<string, { member: string; nonce: string }>()

const tokensOf = ({ member, nonce }: { member: string; nonce: string }, publicIssuer: string) => {
  const oid = e2eIssuer.members[member as keyof typeof e2eIssuer.members]
  const now = Math.floor(Date.now() / 1000)
  const lasting = { iat: now - 30 * 86_400, nbf: now - 30 * 86_400, exp: now + 30 * 86_400 }
  const common = { iss: e2eIssuer.issuer, tid: e2eIssuer.tenant, oid, sub: oid, ...lasting }
  return {
    token_type: 'Bearer',
    scope: entraPreview.scope,
    expires_in: 3600,
    ext_expires_in: 3600,
    access_token: sign({ ...common, aud: e2eIssuer.audience, scp: 'access' }),
    id_token: sign({ ...common, iss: publicIssuer, aud: entraPreview.clientId, nonce, name: member, preferred_username: `${member.toLowerCase()}@caixa-e2e.example` }),
    client_info: encode({ uid: oid, utid: e2eIssuer.tenant }),
  }
}

const bodyOf = async (request: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk)
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

const redirect = (target: string, values: Record<string, string>, mode: string | null) => {
  const url = new URL(target)
  const params = new URLSearchParams(values).toString()
  if (mode === 'query') url.search = params
  else url.hash = params
  return url.href
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', e2eIssuer.origin)
  const json = (value: object) => response.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }).end(JSON.stringify(value))
  const origin = request.headers['x-public-origin']?.toString() ?? e2eIssuer.origin
  const publicIssuer = `${origin}${new URL(e2eIssuer.issuer).pathname}`
  if (url.pathname.endsWith('/openid-configuration'))
    return json({
      issuer: publicIssuer,
      authorization_endpoint: `${origin}/oauth2/v2.0/authorize`,
      token_endpoint: `${origin}/oauth2/v2.0/token`,
      end_session_endpoint: `${origin}/oauth2/v2.0/logout`,
      jwks_uri: `${e2eIssuer.origin}/discovery/v2.0/keys`,
      response_modes_supported: ['query', 'fragment', 'form_post'],
    })
  if (url.pathname === '/discovery/v2.0/keys') return json({ keys: [jwk] })
  if (url.pathname === '/oauth2/v2.0/authorize') {
    const member = url.searchParams.get('login_hint') ?? 'Marcio'
    if (!Object.hasOwn(e2eIssuer.members, member)) return response.writeHead(400).end('unknown member')
    const code = crypto.randomUUID()
    codes.set(code, { member, nonce: url.searchParams.get('nonce') ?? '' })
    const target = redirect(url.searchParams.get('redirect_uri') ?? '', { code, state: url.searchParams.get('state') ?? '', client_info: encode({ uid: e2eIssuer.members[member as keyof typeof e2eIssuer.members], utid: e2eIssuer.tenant }) }, url.searchParams.get('response_mode'))
    return response.writeHead(302, { location: target }).end()
  }
  if (url.pathname === '/oauth2/v2.0/token' && request.method === 'POST') {
    const grant = codes.get((await bodyOf(request)).get('code') ?? '')
    if (!grant) return response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid_grant' }))
    return json(tokensOf(grant, publicIssuer))
  }
  if (url.pathname === '/oauth2/v2.0/logout') return response.writeHead(302, { location: url.searchParams.get('post_logout_redirect_uri') ?? '/' }).end()
  response.writeHead(404).end()
}).listen(Number(new URL(e2eIssuer.origin).port), '127.0.0.1')
