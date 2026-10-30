import type { Database } from '../db/connection.ts'
import { findMember, type Member, memberByExternalId } from '../ledger/members.ts'
import { bearerOf, jwksOf, type TokenRules, verifyToken } from './auth.ts'
import { HttpError } from './body.ts'
import { memberHeader } from './contract.ts'
import { type Session, session, sessionKeyOf } from './session.ts'

export type Verifier = ((client: Database, request: Request) => Promise<Member | undefined>) & { credential: string; openReads: boolean; issuer?: string; session?: Session }

const verifier = (credential: string, openReads: boolean, resolve: (client: Database, request: Request) => Promise<Member | undefined>, issuer?: string, signedIn?: Session): Verifier => Object.assign(resolve, { credential, openReads, issuer, session: signedIn })

export const localVerifier = verifier(`the ${memberHeader} header`, true, async (client, request) => {
  const name = request.headers.get(memberHeader)
  if (name === null) return undefined
  const member = await findMember(client, name)
  if (!member) throw new HttpError(403, 'unknown member')
  return member
})

const oidOf = async (request: Request, rules: TokenRules, signedIn?: Session) => {
  const token = bearerOf(request)
  if (token === undefined) return signedIn?.oidOf(request)
  const { oid } = await verifyToken(token, rules)
  if (typeof oid !== 'string' || !oid) throw new HttpError(401, 'invalid token: oid')
  return oid
}

export const entraVerifier = (rules: TokenRules, signedIn?: Session) =>
  verifier(
    signedIn ? 'a signed-in session or a bearer token' : 'a bearer token',
    false,
    async (client, request) => {
      const oid = await oidOf(request, rules, signedIn)
      if (oid === undefined) return undefined
      const member = await memberByExternalId(client, oid)
      if (!member) throw new HttpError(403, 'unknown member')
      return member
    },
    rules.issuer,
    signedIn,
  )

const required = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`AUTH_MODE entra needs ${name}`)
  return value
}

const verifiers: Record<string, (signIn: boolean) => Verifier> = {
  local: () => localVerifier,
  entra: (signIn) => {
    const issuer = required('ENTRA_ISSUER')
    const keys = jwksOf(issuer)
    const audience = required('ENTRA_AUDIENCE')
    if (!signIn) return entraVerifier({ issuer, audience, keys })
    const signedIn = session({ issuer, clientId: required('ENTRA_CLIENT_ID'), clientSecret: process.env.ENTRA_CLIENT_SECRET?.trim() || undefined, scopes: process.env.ENTRA_SCOPES?.trim() || undefined, key: sessionKeyOf(required('SESSION_KEY')), keys, publicUrl: process.env.API_PUBLIC_URL?.trim() || undefined })
    return entraVerifier({ issuer, audience, keys }, signedIn)
  },
}

export const verifierFor = (mode = process.env.AUTH_MODE, signIn = false) => {
  const chosen = mode || 'local'
  if (!Object.hasOwn(verifiers, chosen)) throw new Error(`AUTH_MODE ${chosen} is not enabled; use ${Object.keys(verifiers).join(', ')}`)
  return verifiers[chosen]?.(signIn) as Verifier
}

export const identify = (client: Database, request: Request, verify: Verifier) => verify(client, request)
