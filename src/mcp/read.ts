import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod'
import type { Database } from '../db/connection.ts'
import { listDebts } from '../ledger/debts.ts'
import { listDecisions, statuses } from '../ledger/decisions.ts'
import { listEntries, states } from '../ledger/entries.ts'
import { listReserves } from '../ledger/reserves.ts'
import { compareMonths } from '../ledger/summary.ts'
import { result } from './json.ts'
import { month, readOnly, today } from './schema.ts'

export const registerReads = (server: McpServer, client: Database) => {
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
    'list_reserves',
    {
      title: 'List reserves',
      description: 'Active reserves with balance, target, amount missing to the target and progress percent. Use the name with update_reserve.',
      annotations: readOnly,
    },
    async () => result(await listReserves(client)),
  )

  server.registerTool(
    'list_decisions',
    {
      title: 'List joint decisions',
      description: 'Joint decisions, newest first, with who confirmed and who is still awaited. Status defaults to proposed; "all" lists every status. Use the id with confirm_decision, reject_decision or withdraw_decision.',
      inputSchema: z.object({
        status: z.enum([...statuses, 'all']).default('proposed'),
        limit: z.int().min(1).max(100).default(20),
      }),
      annotations: readOnly,
    },
    async (input) => result(await listDecisions(client, input.status, input.limit)),
  )
}
