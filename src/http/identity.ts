import type { Database } from '../db/connection.ts'
import { findMember, type Member } from '../ledger/members.ts'
import { HttpError } from './body.ts'
import { memberHeader } from './contract.ts'

export type Verifier = (client: Database, request: Request) => Promise<Member | undefined>

export const localVerifier: Verifier = async (client, request) => {
  const name = request.headers.get(memberHeader)
  if (name === null) return undefined
  const member = await findMember(client, name)
  if (!member) throw new HttpError(403, 'unknown member')
  return member
}

export const tokenVerifier: Verifier = async (_client, request) => {
  if (!request.headers.get('authorization')) return undefined
  throw new HttpError(401, 'token verification is not configured')
}

const verifiers = { local: localVerifier, token: tokenVerifier }

export const enabledModes = ['local']

export const verifierFor = (mode = process.env.AUTH_MODE) => {
  const chosen = mode || 'local'
  if (!enabledModes.includes(chosen) || !Object.hasOwn(verifiers, chosen)) throw new Error(`AUTH_MODE ${chosen} is not enabled; use ${enabledModes.join(', ')}`)
  return verifiers[chosen as keyof typeof verifiers]
}

export const identify = (client: Database, request: Request, verify: Verifier = verifierFor()) => verify(client, request)
