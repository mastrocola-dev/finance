import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, describe, test } from 'node:test'
import { connectPool } from '../../src/db/connection.ts'
import { seed, seedToday } from '../../src/db/seed.ts'
import { routes, serveApi } from '../../src/http/api.ts'
import { documentFile, serialized } from '../../src/http/document.ts'
import { openApi } from '../../src/http/openapi.ts'
import { testDatabase } from '../db/database.ts'

type Operation = { operationId: string; parameters: { name: string; in: string }[]; requestBody?: unknown; responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }> }
type Sample = { path: string; body?: unknown }

const document = openApi(routes) as unknown as { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, unknown> } }

const operationOf = (route: (typeof routes)[number]) => document.paths[route.pattern.pathname.replace(/:(\w+)/g, '{$1}')]?.[route.method.toLowerCase()]

describe('openapi', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  let server: Awaited<ReturnType<typeof serveApi>>

  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${server.url}/api${path}`, {
      method,
      headers: { 'x-member': 'Marcio', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    pool = connectPool(db.url)
    server = await serveApi(pool, 0, '127.0.0.1')
  })

  after(async () => {
    await server.close()
    await pool.end()
    await db.drop()
  })

  test('documents every route with its parameters, body and response', () => {
    const ids = routes.map(({ operationId }) => operationId)
    assert.equal(new Set(ids).size, ids.length)
    for (const route of routes) {
      const operation = operationOf(route)
      assert.ok(operation, `${route.method} ${route.path} is not documented`)
      assert.equal(operation.operationId, route.operationId)
      const pathNames = [...route.path.matchAll(/:(\w+)/g)].map(([, name]) => name)
      assert.deepEqual(
        operation.parameters.filter((parameter) => parameter.in === 'path').map(({ name }) => name),
        pathNames,
        `${route.operationId} path parameters`,
      )
      assert.equal(Boolean(operation.requestBody), Boolean(route.body), `${route.operationId} body`)
      const reference = operation.responses[route.status ?? 200]?.content?.['application/json']?.schema?.$ref
      assert.ok(reference, `${route.operationId} has no response schema`)
      assert.ok(document.components.schemas[reference.replace('#/components/schemas/', '')], `${route.operationId} response schema ${reference} is missing`)
    }
  })

  test('keeps openapi.json in sync with the routes', async () => {
    assert.equal(await readFile(documentFile, 'utf8'), serialized(), 'run npm run openapi')
  })

  test('serves the document', async () => {
    const { status, body } = await call('GET', '/openapi.json')
    assert.equal(status, 200)
    assert.deepEqual(body, document)
  })

  test('answers every route with its documented response shape', async () => {
    const proposed = await call('POST', '/decisions', { title: 'New sofa', amount_cents: 250000 })
    const answered = await Promise.all(['Rejected trip', 'Withdrawn trip'].map((title) => call('POST', '/decisions', { title })))
    const today = `today=${seedToday}`
    const samples: Record<string, Sample> = {
      getOpenApi: { path: '/openapi.json' },
      getMonthSummary: { path: `/months/2026-10/summary?${today}` },
      listEntries: { path: `/months/2026-10/entries?${today}` },
      listDebts: { path: '/debts' },
      listReserves: { path: '/reserves' },
      listDecisions: { path: '/decisions?status=all' },
      listMembers: { path: '/members' },
      listCategories: { path: '/categories?direction=expense' },
      listAccounts: { path: '/accounts' },
      listGoals: { path: '/goals' },
      getNetWorth: { path: '/net-worth' },
      getMonthSplit: { path: '/months/2026-10/split' },
      listAudit: { path: '/audit?limit=5' },
      createEntry: { path: `/entries?${today}`, body: { month: '2026-10', due_on: '2026-10-26', description: 'Bakery', direction: 'expense', amount_cents: 1800, category: 'alimentação', member: 'joint' } },
      markPaid: { path: `/entries/ENTRY/paid?${today}`, body: {} },
      markUnpaid: { path: `/entries/ENTRY/unpaid?${today}` },
      updateReserve: { path: '/reserves/Reserva%20de%20emerg%C3%AAncia', body: { target_cents: 3000000 } },
      proposeDecision: { path: '/decisions', body: { title: 'Bike', description: 'Commuting' } },
      confirmDecision: { path: `/decisions/${proposed.body.id}/confirm` },
      rejectDecision: { path: `/decisions/${answered[0]?.body.id}/reject` },
      withdrawDecision: { path: `/decisions/${answered[1]?.body.id}/withdraw` },
      forecastMonth: { path: `/months/2026-12/forecast?${today}` },
    }
    let entry = ''
    for (const route of routes) {
      const sample = samples[route.operationId]
      assert.ok(sample, `${route.operationId} has no sample request`)
      const member = route.operationId === 'rejectDecision' ? 'Gabriela' : 'Marcio'
      const response = await fetch(`${server.url}/api${sample.path.replace('ENTRY', entry)}`, {
        method: route.method,
        headers: { 'x-member': member, ...(sample.body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: sample.body === undefined ? undefined : JSON.stringify(sample.body),
      })
      const body = await response.json()
      assert.equal(response.status, route.status ?? 200, `${route.operationId}: ${JSON.stringify(body)}`)
      const parsed = route.response.safeParse(body)
      assert.ok(parsed.success, `${route.operationId}: ${parsed.error?.message}`)
      if (route.operationId === 'createEntry') entry = body.id
    }
  })
})
