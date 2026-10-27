import type { Database } from '../db/connection.ts'
import { findMember, type Member, memberByExternalId } from '../ledger/members.ts'
import { bearerOf, jwksOf, type TokenRules, verifyToken } from './auth.ts'
import { HttpError } from './body.ts'
import { memberHeader } from './contract.ts'

export type Verifier = ((client: Database, request: Request) => Promise<Member | undefined>) & { credential: string; openReads: boolean }

const verifier = (credential: string, openReads: boolean, resolve: (client: Database, request: Request) => Promise<Member | undefined>): Verifier => Object.assign(resolve, { credential, openReads })

export const localVerifier = verifier(`the ${memberHeader} header`, true, async (client, request) => {
  const name = request.headers.get(memberHeader)
  if (name === null) return undefined
  const member = await findMember(client, name)
  if (!member) throw new HttpError(403, 'unknown member')
  return member
})

export const entraVerifier = (rules: TokenRules) =>
  verifier('a bearer token', false, async (client, request) => {
    const token = bearerOf(request)
    if (token === undefined) return undefined
    const { oid } = await verifyToken(token, rules)
    if (typeof oid !== 'string' || !oid) throw new HttpError(401, 'invalid token: oid')
    const member = await memberByExternalId(client, oid)
    if (!member) throw new HttpError(403, 'unknown member')
    return member
  })

const required = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`AUTH_MODE entra needs ${name}`)
  return value
}

const verifiers: Record<string, () => Verifier> = {
  local: () => localVerifier,
  entra: () => {
    const issuer = required('ENTRA_ISSUER')
    return entraVerifier({ issuer, audience: required('ENTRA_AUDIENCE'), keys: jwksOf(issuer) })
  },
}

export const verifierFor = (mode = process.env.AUTH_MODE) => {
  const chosen = mode || 'local'
  if (!Object.hasOwn(verifiers, chosen)) throw new Error(`AUTH_MODE ${chosen} is not enabled; use ${Object.keys(verifiers).join(', ')}`)
  return verifiers[chosen]?.() as Verifier
}

export const identify = (client: Database, request: Request, verify: Verifier) => verify(client, request)
