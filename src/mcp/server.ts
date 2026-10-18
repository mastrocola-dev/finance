import { McpServer } from '@modelcontextprotocol/server'
import type { PoolClient } from 'pg'
import * as z from 'zod'
import type { Database } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { listDebts } from '../ledger/debts.ts'
import { findDecision } from '../ledger/decisions.ts'
import { findEntry, listEntries, states } from '../ledger/entries.ts'
import type { Member } from '../ledger/members.ts'
import { confirmDecision, createEntry, markPaid, proposeDecision, rejectDecision, updateReserve, withdrawDecision } from '../ledger/record.ts'
import { findReserve } from '../ledger/reserves.ts'
import { compareMonths } from '../ledger/summary.ts'
import { result } from './json.ts'

const month = z.string().describe('Month as YYYY-MM')
const today = z.string().optional().describe('Reference date YYYY-MM-DD for pending and late; defaults to today in America/Sao_Paulo')
const date = z.string().describe('Date as YYYY-MM-DD')
const id = z.string().regex(/^\d+$/, 'id must be digits')
const readOnly = { readOnlyHint: true, openWorldHint: false }
const writes = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

export const createServer = (client: Database, member?: Member) => {
  const server = new McpServer({ name: 'finance', version: '0.1.0' })

  const writing = async <T>(work: (connection: PoolClient, actor: Actor) => Promise<T>) => {
    if (!member) throw new Error('writes need a calling member: x-member header over HTTP or FINANCE_MEMBER over stdio')
    const connection = await client.connect()
    try {
      return await work(connection, { author: 'claude', memberId: member.id })
    } finally {
      connection.release()
    }
  }

  server.registerTool(
    'month_summary',
    {
      title: 'Month summary',
      description: 'Income and expenses of a month by category with paid, pending and late totals, compared with another month (previous by default). Amounts are cents as strings plus BRL display.',
      inputSchema: z.object({ month, compare_with: month.optional(), today }),
      annotations: readOnly,
    },
    async (input) => result(await compareMonths(client, input.month, input.compare_with, input.today)),
  )

  server.registerTool(
    'list_entries',
    {
      title: 'List entries',
      description: 'Active entries of a month ordered by due date. Optional filters: direction, category name, account nickname, member name or "joint", state (paid, pending, late). A null member means a joint entry.',
      inputSchema: z.object({
        month,
        direction: z.enum(['income', 'expense']).optional(),
        category: z.string().optional(),
        account: z.string().optional(),
        member: z.string().optional(),
        state: z.enum(states).optional(),
        today,
      }),
      annotations: readOnly,
    },
    async ({ today, ...filters }) => result(await listEntries(client, filters, today)),
  )

  server.registerTool(
    'list_debts',
    {
      title: 'List debts',
      description: 'Active debts with principal, balance, monthly rate and installments. A null member means a joint debt.',
      annotations: readOnly,
    },
    async () => result(await listDebts(client)),
  )

  server.registerTool(
    'create_entry',
    {
      title: 'Create entry',
      description: 'Record a planned (or already paid, with paid_on) income or expense in a month on behalf of the calling member. Category must match the direction; member is a member name or "joint". Never executes a payment.',
      inputSchema: z.object({
        month,
        due_on: date,
        description: z.string().trim().min(1),
        direction: z.enum(['income', 'expense']),
        amount_cents: z.int().positive().describe('Amount in cents of BRL'),
        category: z.string(),
        account: z.string().optional().describe('Account nickname'),
        member: z.string().describe('Member name or "joint"'),
        paid_on: date.optional(),
        today,
      }),
      annotations: writes,
    },
    async (input) => {
      const created = await writing((connection, actor) =>
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
      return result(await findEntry(client, created, input.today))
    },
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
