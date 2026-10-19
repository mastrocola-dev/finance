import { hostHeaderValidationResponse, localhostAllowedHostnames, localhostAllowedOrigins, originValidationResponse } from '@modelcontextprotocol/server'
import type { PoolClient } from 'pg'
import * as z from 'zod'
import { connectPool, type Database } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { listDebts } from '../ledger/debts.ts'
import { listDecisions, statuses } from '../ledger/decisions.ts'
import { findEntry, listEntries, states } from '../ledger/entries.ts'
import { findMember, type Member } from '../ledger/members.ts'
import { createEntry, markPaid } from '../ledger/record.ts'
import { listReserves } from '../ledger/reserves.ts'
import { RuleError } from '../ledger/rule.ts'
import { compareMonths } from '../ledger/summary.ts'
import { toJson } from '../mcp/json.ts'
import { HttpError, readJson } from './body.ts'
import { listen } from './node.ts'

export const apiPrefix = '/api'
export const memberHeader = 'x-member'

type Context = { request: Request; params: Record<string, string | undefined>; query: Record<string, string>; member?: Member; client: Database }
type Route = { method: string; pattern: URLPattern; handle: (context: Context) => Promise<unknown>; status: number }

const month = z.string()
const date = z.string()
const id = z.string().regex(/^\d+$/, 'id must be digits')
const today = date.optional()

const referenceDate = ({ query }: Context) => today.parse(query.today)

const entryFilters = z.object({
  direction: z.enum(['income', 'expense']).optional(),
  category: z.string().optional(),
  account: z.string().optional(),
  member: z.string().optional(),
  state: z.enum(states).optional(),
  today,
})

const newEntry = z.object({
  month,
  due_on: date,
  description: z.string().trim().min(1),
  direction: z.enum(['income', 'expense']),
  amount_cents: z.int().positive(),
  category: z.string(),
  account: z.string().optional(),
  member: z.string(),
  paid_on: date.optional(),
})

const writing = async <T>({ client, member }: Context, work: (connection: PoolClient, actor: Actor) => Promise<T>) => {
  if (!member) throw new HttpError(401, `writes need the ${memberHeader} header`)
  const connection = await client.connect()
  try {
    return await work(connection, { author: 'member', memberId: member.id })
  } finally {
    connection.release()
  }
}

const route = (method: string, path: string, handle: Route['handle'], status = 200): Route => ({ method, pattern: new URLPattern({ pathname: `${apiPrefix}${path}` }), handle, status })

const routes = [
  route('GET', '/months/:month/summary', async ({ client, params, query }) => {
    const input = z.object({ compare_with: month.optional(), today }).parse(query)
    return compareMonths(client, params.month ?? '', input.compare_with, input.today)
  }),
  route('GET', '/months/:month/entries', async ({ client, params, query }) => {
    const { today, ...filters } = entryFilters.parse(query)
    return listEntries(client, { month: params.month ?? '', ...filters }, today)
  }),
  route('GET', '/debts', ({ client }) => listDebts(client)),
  route('GET', '/reserves', ({ client }) => listReserves(client)),
  route('GET', '/decisions', async ({ client, query }) => {
    const input = z.object({ status: z.enum([...statuses, 'all']).default('proposed'), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(query)
    return listDecisions(client, input.status, input.limit)
  }),
  route(
    'POST',
    '/entries',
    async (context) => {
      const input = newEntry.parse(await readJson(context.request))
      const created = await writing(context, (connection, actor) =>
        createEntry(connection, actor, {
          month: input.month,
          dueOn: input.due_on,
          description: input.description,
          direction: input.direction,
          amount: BigInt(input.amount_cents),
          category: input.category,
          account: input.account,
          member: input.member,
          paidOn: input.paid_on,
        }),
      )
      return findEntry(context.client, created, referenceDate(context))
    },
    201,
  ),
  route('POST', '/entries/:id/paid', async (context) => {
    const entry = BigInt(id.parse(context.params.id))
    const input = z.object({ paid_on: date.optional() }).parse(await readJson(context.request))
    const paid = await writing(context, (connection, actor) => markPaid(connection, actor, entry, input.paid_on ?? referenceDate(context)))
    return findEntry(context.client, paid, referenceDate(context))
  }),
]

const error = (message: string, status: number, extra = {}) => Response.json({ error: message, ...extra }, { status })

const failure = (caught: unknown) => {
  if (caught instanceof HttpError) return error(caught.message, caught.status)
  if (caught instanceof z.ZodError) return error('invalid input', 400, { issues: caught.issues.map(({ path, message }) => ({ path: path.join('.'), message })) })
  if (caught instanceof RuleError) return error(caught.message, 422)
  return error('internal error', 500)
}

const memberOf = async (client: Database, request: Request) => {
  const name = request.headers.get(memberHeader)
  if (name === null) return undefined
  const member = await findMember(client, name)
  if (!member) throw new HttpError(403, 'unknown member')
  return member
}

const query = (url: URL) => Object.fromEntries(url.searchParams)

export const api = (client: Database) => async (request: Request) => {
  const rejected = hostHeaderValidationResponse(request, localhostAllowedHostnames()) ?? originValidationResponse(request, localhostAllowedOrigins())
  if (rejected) return rejected
  const url = new URL(request.url)
  const matches = routes.flatMap((candidate) => {
    const match = candidate.pattern.exec(url)
    return match ? [{ ...candidate, params: match.pathname.groups }] : []
  })
  if (!matches.length) return error('not found', 404)
  const matched = matches.find(({ method }) => method === request.method)
  if (!matched) return Response.json({ error: 'method not allowed' }, { status: 405, headers: { allow: matches.map(({ method }) => method).join(', ') } })
  try {
    const member = await memberOf(client, request)
    if (request.method !== 'GET' && !member) throw new HttpError(401, `writes need the ${memberHeader} header`)
    return Response.json(toJson(await matched.handle({ request, params: matched.params, query: query(url), member, client })), { status: matched.status })
  } catch (caught) {
    return failure(caught)
  }
}

export const serveApi = (client: Database, port = Number(process.env.API_PORT ?? 3200), host = process.env.API_HOST ?? '127.0.0.1') => listen(api(client), port, host)

if (import.meta.main) {
  const pool = connectPool()
  const server = await serveApi(pool)
  console.error(`finance api on ${server.url}${apiPrefix}`)
  const stop = async () => {
    await server.close()
    await pool.end()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
