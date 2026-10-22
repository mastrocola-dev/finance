import { hostHeaderValidationResponse, localhostAllowedHostnames, localhostAllowedOrigins, originValidationResponse } from '@modelcontextprotocol/server'
import type { PoolClient } from 'pg'
import * as z from 'zod'
import { connectPool, type Database } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { findBatch, listBatches, listCandidates, listQuestions } from '../import/batches.ts'
import { maxBytes } from '../import/cli.ts'
import { type ImportUploads, importUploads } from '../import/uploads.ts'
import { listAudit } from '../ledger/audit.ts'
import { listAccounts, listCategories } from '../ledger/catalog.ts'
import { listDebts } from '../ledger/debts.ts'
import { findDecision, listDecisions } from '../ledger/decisions.ts'
import { findEntry, listEntries } from '../ledger/entries.ts'
import { forecastMonth } from '../ledger/forecast.ts'
import { listGoals } from '../ledger/goals.ts'
import { findMember, listMembers, type Member } from '../ledger/members.ts'
import { confirmDecision, createEntry, markPaid, markUnpaid, proposeDecision, rejectDecision, updateReserve, withdrawDecision } from '../ledger/record.ts'
import { findReserve, listReserves } from '../ledger/reserves.ts'
import { RuleError } from '../ledger/rule.ts'
import { monthSplit } from '../ledger/split.ts'
import { compareMonths } from '../ledger/summary.ts'
import { netWorth } from '../ledger/worth.ts'
import { toJson } from '../mcp/json.ts'
import { HttpError, readBytes, readJson } from './body.ts'
import { auditQuery, categoryQuery, decisionQuery, entryQuery, idPath, importQuery, memberHeader, monthPath, namePath, newDecision, newEntry, payment, referenceQuery, reserveChanges, schemas, summaryQuery, uploadHeaders, uploadQuery } from './contract.ts'
import { listen } from './node.ts'
import { openApi } from './openapi.ts'

export const apiPrefix = '/api'

type Schema = z.ZodType
type Parsed<T> = T extends Schema ? z.output<T> : undefined
type Spec = { method: string; path: string; operationId: string; summary: string; params?: Schema; query?: Schema; headers?: Schema; body?: Schema; upload?: true; response: Schema; status?: number }
type Input<S extends Spec> = { request: Request; params: Parsed<S['params']>; query: Parsed<S['query']>; headers: Parsed<S['headers']>; body: Parsed<S['body']>; member?: Member; client: Database; imports: ImportUploads }
export type Route = Spec & { pattern: URLPattern; handle: (input: Input<Spec>) => Promise<unknown> }

const writing = async <T>({ client, member }: { client: Database; member?: Member }, work: (connection: PoolClient, actor: Actor) => Promise<T>) => {
  if (!member) throw new HttpError(401, `writes need the ${memberHeader} header`)
  const connection = await client.connect()
  try {
    return await work(connection, { author: 'member', memberId: member.id })
  } finally {
    connection.release()
  }
}

const route = <S extends Spec>(spec: S, handle: (input: Input<S>) => Promise<unknown>): Route => ({ ...spec, pattern: new URLPattern({ pathname: `${apiPrefix}${spec.path}` }), handle: handle as Route['handle'] })

const cents = (value: number | undefined) => (value === undefined ? undefined : BigInt(value))

const batchView = async ({ client, imports }: { client: Database; imports: ImportUploads }, id: bigint) => {
  const batch = await findBatch(client, id)
  if (!batch) throw new HttpError(404, `import batch ${id} not found`)
  return { ...batch, progress: imports.progressOf(id) }
}

const existingBatch = async (client: Database, id: string) => {
  const batch = await findBatch(client, BigInt(id))
  if (!batch) throw new HttpError(404, `import batch ${id} not found`)
  return BigInt(id)
}

const decisionAnswers = [
  ['confirm', 'confirmDecision', 'Confirm a proposed decision as the caller', confirmDecision],
  ['reject', 'rejectDecision', 'Reject a decision proposed by another member', rejectDecision],
  ['withdraw', 'withdrawDecision', 'Withdraw a decision the caller proposed', withdrawDecision],
] as const

export const routes: Route[] = [
  route({ method: 'GET', path: '/openapi.json', operationId: 'getOpenApi', summary: 'This OpenAPI document', response: schemas.OpenApiDocument }, async () => openApi(routes)),
  route({ method: 'GET', path: '/months/:month/summary', operationId: 'getMonthSummary', summary: 'Month totals compared with another month', params: monthPath, query: summaryQuery, response: schemas.Comparison }, ({ client, params, query }) => compareMonths(client, params.month, query.compare_with, query.today)),
  route({ method: 'GET', path: '/months/:month/entries', operationId: 'listEntries', summary: 'Entries of a month with filters', params: monthPath, query: entryQuery, response: z.array(schemas.Entry) }, ({ client, params, query: { today, ...filters } }) =>
    listEntries(client, { month: params.month, ...filters }, today),
  ),
  route({ method: 'GET', path: '/debts', operationId: 'listDebts', summary: 'Active debts', response: z.array(schemas.Debt) }, ({ client }) => listDebts(client)),
  route({ method: 'GET', path: '/reserves', operationId: 'listReserves', summary: 'Reserves with progress to target', response: z.array(schemas.Reserve) }, ({ client }) => listReserves(client)),
  route({ method: 'GET', path: '/decisions', operationId: 'listDecisions', summary: 'Decisions by status, newest first', query: decisionQuery, response: z.array(schemas.Decision) }, ({ client, query }) => listDecisions(client, query.status, query.limit)),
  route({ method: 'GET', path: '/members', operationId: 'listMembers', summary: 'Active members with their share of joint expenses', response: z.array(schemas.Member) }, ({ client }) => listMembers(client)),
  route({ method: 'GET', path: '/categories', operationId: 'listCategories', summary: 'Active categories, optionally of one direction', query: categoryQuery, response: z.array(schemas.Category) }, ({ client, query }) => listCategories(client, query.direction)),
  route({ method: 'GET', path: '/accounts', operationId: 'listAccounts', summary: 'Active accounts by nickname and last four digits, joint first', response: z.array(schemas.Account) }, ({ client }) => listAccounts(client)),
  route({ method: 'GET', path: '/goals', operationId: 'listGoals', summary: 'Goals with progress, nearest due first', response: z.array(schemas.Goal) }, ({ client }) => listGoals(client)),
  route({ method: 'GET', path: '/net-worth', operationId: 'getNetWorth', summary: 'Reserves and goals minus debt balances', response: schemas.NetWorth }, ({ client }) => netWorth(client)),
  route({ method: 'GET', path: '/months/:month/split', operationId: 'getMonthSplit', summary: 'Who owes whom from joint expenses paid from member accounts', params: monthPath, response: schemas.Split }, ({ client, params }) => monthSplit(client, params.month)),
  route({ method: 'GET', path: '/audit', operationId: 'listAudit', summary: 'Audit log, newest first, with counts per author', query: auditQuery, response: schemas.AuditPage }, ({ client, query: { before, ...filter } }) => listAudit(client, { ...filter, before: before === undefined ? undefined : BigInt(before) })),
  route({ method: 'POST', path: '/entries', operationId: 'createEntry', summary: 'Record an entry', query: referenceQuery, body: newEntry, response: schemas.Entry, status: 201 }, async (input) => {
    const { body } = input
    const created = await writing(input, (connection, actor) =>
      createEntry(connection, actor, {
        month: body.month,
        dueOn: body.due_on,
        description: body.description,
        direction: body.direction,
        amount: BigInt(body.amount_cents),
        category: body.category,
        account: body.account,
        member: body.member,
        paidOn: body.paid_on,
      }),
    )
    return findEntry(input.client, created, input.query.today)
  }),
  route({ method: 'POST', path: '/entries/:id/paid', operationId: 'markPaid', summary: 'Mark an entry as paid', params: idPath, query: referenceQuery, body: payment, response: schemas.Entry }, async (input) => {
    const paid = await writing(input, (connection, actor) => markPaid(connection, actor, BigInt(input.params.id), input.body.paid_on ?? input.query.today))
    return findEntry(input.client, paid, input.query.today)
  }),
  route({ method: 'POST', path: '/entries/:id/unpaid', operationId: 'markUnpaid', summary: 'Undo a payment mark, back to planned', params: idPath, query: referenceQuery, response: schemas.Entry }, async (input) => {
    const reopened = await writing(input, (connection, actor) => markUnpaid(connection, actor, BigInt(input.params.id)))
    return findEntry(input.client, reopened, input.query.today)
  }),
  route({ method: 'PATCH', path: '/reserves/:name', operationId: 'updateReserve', summary: 'Change the balance or target of a reserve', params: namePath, body: reserveChanges, response: schemas.Reserve }, async (input) => {
    const name = decodeURIComponent(input.params.name)
    await writing(input, (connection, actor) => updateReserve(connection, actor, name, { balance: cents(input.body.balance_cents), target: cents(input.body.target_cents) }))
    return findReserve(input.client, name)
  }),
  route({ method: 'POST', path: '/decisions', operationId: 'proposeDecision', summary: 'Propose a joint decision', body: newDecision, response: schemas.Decision, status: 201 }, async (input) => {
    const { body } = input
    const proposed = await writing(input, (connection, actor) => proposeDecision(connection, actor, { title: body.title, description: body.description, amount: cents(body.amount_cents) }))
    return findDecision(input.client, proposed)
  }),
  ...decisionAnswers.map(([action, operationId, summary, answer]) =>
    route({ method: 'POST', path: `/decisions/:id/${action}`, operationId, summary, params: idPath, response: schemas.Decision }, async (input) => {
      const answered = await writing(input, (connection, actor) => answer(connection, actor, BigInt(input.params.id)))
      return findDecision(input.client, answered)
    }),
  ),
  route({ method: 'POST', path: '/months/:month/forecast', operationId: 'forecastMonth', summary: 'Plan the recurring entries of a month', params: monthPath, query: referenceQuery, response: schemas.Forecast }, async (input) => {
    const forecast = await writing(input, (connection, actor) => forecastMonth(connection, actor, input.params.month))
    const created = await Promise.all(forecast.created.map((entry) => findEntry(input.client, entry, input.query.today)))
    return { month: forecast.month, skipped: forecast.skipped, created }
  }),
  route({ method: 'POST', path: '/imports', operationId: 'uploadImport', summary: 'Upload a file to import; extraction runs in the background', query: uploadQuery, headers: uploadHeaders, upload: true, response: schemas.ImportBatch, status: 202 }, async (input) => {
    if (!input.member) throw new HttpError(401, `writes need the ${memberHeader} header`)
    if (input.request.headers.get('content-type') !== 'application/octet-stream') throw new HttpError(415, 'content-type must be application/octet-stream')
    const bytes = await readBytes(input.request, maxBytes)
    const id = await input.imports.start({ author: 'import', memberId: input.member.id }, input.headers['x-file-name'], bytes)
    return batchView(input, id)
  }),
  route({ method: 'GET', path: '/imports', operationId: 'listImports', summary: 'Import batches, newest first', query: importQuery, response: z.array(schemas.ImportBatch) }, async ({ client, imports, query }) =>
    (await listBatches(client, query.status)).map((batch) => ({ ...batch, progress: imports.progressOf(BigInt(batch.id)) })),
  ),
  route({ method: 'GET', path: '/imports/:id', operationId: 'getImport', summary: 'One import batch with its extraction progress', params: idPath, response: schemas.ImportBatch }, (input) => batchView(input, BigInt(input.params.id))),
  route({ method: 'GET', path: '/imports/:id/candidates', operationId: 'listImportCandidates', summary: 'Open candidates of an import batch', params: idPath, response: z.array(schemas.ImportCandidate) }, async ({ client, params }) => listCandidates(client, await existingBatch(client, params.id))),
  route({ method: 'GET', path: '/imports/:id/questions', operationId: 'listImportQuestions', summary: 'Open questions of an import batch', params: idPath, response: z.array(schemas.ImportQuestion) }, async ({ client, params }) => listQuestions(client, await existingBatch(client, params.id))),
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

export const api =
  (client: Database, imports = importUploads(client)) =>
  async (request: Request) => {
    const rejected = hostHeaderValidationResponse(request, localhostAllowedHostnames()) ?? originValidationResponse(request, localhostAllowedOrigins())
    if (rejected) return rejected
    const url = new URL(request.url)
    const matches = routes.flatMap((candidate) => {
      const match = candidate.pattern.exec(url)
      return match ? [{ ...candidate, groups: match.pathname.groups }] : []
    })
    if (!matches.length) return error('not found', 404)
    const matched = matches.find(({ method }) => method === request.method)
    if (!matched) return Response.json({ error: 'method not allowed' }, { status: 405, headers: { allow: matches.map(({ method }) => method).join(', ') } })
    try {
      const member = await memberOf(client, request)
      if (request.method !== 'GET' && !member) throw new HttpError(401, `writes need the ${memberHeader} header`)
      const params = matched.params?.parse(matched.groups)
      const parsedQuery = matched.query?.parse(Object.fromEntries(url.searchParams))
      const headers = matched.headers?.parse(Object.fromEntries(request.headers))
      const body = matched.body?.parse(await readJson(request))
      return Response.json(toJson(await matched.handle({ request, params, query: parsedQuery, headers, body, member, client, imports })), { status: matched.status ?? 200 })
    } catch (caught) {
      return failure(caught)
    }
  }

export const serveApi = (client: Database, port = Number(process.env.API_PORT ?? 3200), host = process.env.API_HOST ?? '127.0.0.1', imports?: ImportUploads) => listen(api(client, imports), port, host)

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
