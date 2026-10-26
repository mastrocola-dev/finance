import { McpServer } from '@modelcontextprotocol/server'
import type { PoolClient } from 'pg'
import * as z from 'zod'
import type { Database } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { findDecision } from '../ledger/decisions.ts'
import { findEntry } from '../ledger/entries.ts'
import { forecastMonth } from '../ledger/forecast.ts'
import type { Member } from '../ledger/members.ts'
import { cancelEntry, confirmDecision, correctEntry, createEntry, markPaid, type NewEntry, proposeDecision, rejectDecision, updateReserve, withdrawDecision } from '../ledger/record.ts'
import { findReserve } from '../ledger/reserves.ts'
import { closeRecord, listSetup, registerRecord, setupKinds } from '../ledger/setup.ts'
import { result } from './json.ts'
import { registerReads } from './read.ts'
import { date, id, month, today, writes } from './schema.ts'

export const createServer = (client: Database, member?: Member) => {
  const server = new McpServer({ name: 'finance', version: '0.1.0' })
  registerReads(server, client)

  const writing = async <T>(work: (connection: PoolClient, actor: Actor) => Promise<T>) => {
    if (!member) throw new Error('writes need a calling member: x-member header over HTTP or FINANCE_MEMBER over stdio')
    const connection = await client.connect()
    try {
      return await work(connection, { author: 'claude', memberId: member.id })
    } finally {
      connection.release()
    }
  }

  const entryFields = {
    month,
    due_on: date,
    description: z.string().trim().min(1),
    direction: z.enum(['income', 'expense']),
    amount_cents: z.int().positive().describe('Amount in cents of BRL'),
    category: z.string(),
    account: z.string().optional().describe('Account nickname'),
    member: z.string().describe('Member name or "joint"'),
    paid_on: date.optional(),
  }

  const entryOf = (input: z.output<z.ZodObject<typeof entryFields>>): NewEntry => ({
    month: input.month,
    dueOn: input.due_on,
    description: input.description,
    direction: input.direction,
    amount: BigInt(input.amount_cents),
    category: input.category,
    account: input.account,
    member: input.member,
    paidOn: input.paid_on,
  })

  server.registerTool(
    'create_entry',
    {
      title: 'Create entry',
      description: 'Record a planned (or already paid, with paid_on) income or expense in a month on behalf of the calling member. Category must match the direction; member is a member name or "joint". Never executes a payment.',
      inputSchema: z.object({ ...entryFields, today }),
      annotations: writes,
    },
    async (input) => {
      const created = await writing((connection, actor) => createEntry(connection, actor, entryOf(input)))
      return result(await findEntry(client, created, input.today))
    },
  )

  server.registerTool(
    'correct_entry',
    {
      title: 'Correct entry',
      description: 'Correct an open entry with the full set of new values; the old one is closed and points to its replacement. Confirm the change with the member first.',
      inputSchema: z.object({ id, ...entryFields, today }),
      annotations: writes,
    },
    async (input) => {
      const replaced = await writing((connection, actor) => correctEntry(connection, actor, BigInt(input.id), entryOf(input)))
      return result(await findEntry(client, replaced, input.today))
    },
  )

  server.registerTool(
    'cancel_entry',
    {
      title: 'Cancel entry',
      description: 'Cancel an open entry that should not exist (typo, duplicate, plan that will not happen). It is closed, never deleted, and the forecast does not plan it again. Confirm with the member first.',
      inputSchema: z.object({ id }),
      annotations: writes,
    },
    async (input) => result({ id: String(await writing((connection, actor) => cancelEntry(connection, actor, BigInt(input.id)))) }),
  )

  server.registerTool(
    'register_record',
    {
      title: 'Register record',
      description: 'Register a category, account, reserve, income, recurring expense, debt or goal. The payload is camelCase and follows the import candidate schema of its kind (amounts in integer cents; accounts keep institution, nickname and last four digits only).',
      inputSchema: z.object({ kind: z.enum(setupKinds), payload: z.record(z.string(), z.unknown()) }),
      annotations: writes,
    },
    async (input) => {
      const created = String(await writing((connection, actor) => registerRecord(connection, actor, input.kind, input.payload)))
      return result((await listSetup(client)).find((record) => record.kind === input.kind && record.id === created))
    },
  )

  server.registerTool(
    'close_record',
    {
      title: 'Close record',
      description: 'Close a registered category, account, reserve, income, recurring expense, debt or goal; it stays in history and is no longer used for new entries or forecasts.',
      inputSchema: z.object({ kind: z.enum(setupKinds), id }),
      annotations: writes,
    },
    async (input) => result({ id: String(await writing((connection, actor) => closeRecord(connection, actor, input.kind, BigInt(input.id)))) }),
  )

  server.registerTool(
    'mark_paid',
    {
      title: 'Mark entry paid',
      description: 'Record that a planned or late entry was paid (or received) on paid_on, today by default. Only records the fact; never executes a payment.',
      inputSchema: z.object({ id, paid_on: date.optional(), today }),
      annotations: writes,
    },
    async (input) => {
      const paid = await writing((connection, actor) => markPaid(connection, actor, BigInt(input.id), input.paid_on ?? input.today))
      return result(await findEntry(client, paid, input.today))
    },
  )

  server.registerTool(
    'forecast_month',
    {
      title: 'Forecast month',
      description: 'Plan the entries of a month from the active recurring expenses and incomes, at their registered amounts and due days. Sources that already have an entry in the month, even a closed one, are skipped, so calling it again changes nothing.',
      inputSchema: z.object({ month, today }),
      annotations: { ...writes, idempotentHint: true },
    },
    async (input) => {
      const forecast = await writing((connection, actor) => forecastMonth(connection, actor, input.month))
      const created = await Promise.all(forecast.created.map((entry) => findEntry(client, entry, input.today)))
      return result({ month: forecast.month, skipped: forecast.skipped, created })
    },
  )

  server.registerTool(
    'update_reserve',
    {
      title: 'Update reserve',
      description: 'Set the current balance and/or the target of a reserve, found by name. The balance never goes below zero. Only records the new figures; never moves money.',
      inputSchema: z.object({
        reserve: z.string().describe('Reserve name'),
        balance_cents: z.int().nonnegative().optional().describe('New balance in cents of BRL'),
        target_cents: z.int().positive().optional().describe('New target in cents of BRL'),
      }),
      annotations: writes,
    },
    async (input) => {
      await writing((connection, actor) =>
        updateReserve(connection, actor, input.reserve, {
          balance: input.balance_cents === undefined ? undefined : BigInt(input.balance_cents),
          target: input.target_cents === undefined ? undefined : BigInt(input.target_cents),
        }),
      )
      return result(await findReserve(client, input.reserve))
    },
  )

  server.registerTool(
    'propose_decision',
    {
      title: 'Propose joint decision',
      description: 'Propose a joint decision on behalf of the calling member. It stays proposed until every active member confirms it with confirm_decision, the proposer included. Never executes a payment.',
      inputSchema: z.object({
        title: z.string().trim().min(1),
        description: z.string().optional(),
        amount_cents: z.int().positive().optional().describe('Amount involved in cents of BRL'),
      }),
      annotations: writes,
    },
    async (input) => {
      const proposed = await writing((connection, actor) =>
        proposeDecision(connection, actor, {
          title: input.title,
          description: input.description,
          amount: input.amount_cents === undefined ? undefined : BigInt(input.amount_cents),
        }),
      )
      return result(await findDecision(client, proposed))
    },
  )

  const answers = [
    ['confirm_decision', 'Confirm joint decision', 'Record that the calling member confirms a proposed decision. It becomes confirmed only when every active member has confirmed.', confirmDecision],
    ['reject_decision', 'Reject joint decision', 'Reject a decision proposed by another member; it is closed as rejected.', rejectDecision],
    ['withdraw_decision', 'Withdraw joint decision', 'Withdraw a decision the calling member proposed; it is closed as withdrawn.', withdrawDecision],
  ] as const

  for (const [name, title, description, answer] of answers) {
    server.registerTool(name, { title, description, inputSchema: z.object({ id }), annotations: writes }, async (input) => {
      const answered = await writing((connection, actor) => answer(connection, actor, BigInt(input.id)))
      return result(await findDecision(client, answered))
    })
  }

  return server
}
