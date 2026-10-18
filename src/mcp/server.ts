import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod'
import type { Queryable } from '../db/connection.ts'
import { listDebts } from '../ledger/debts.ts'
import { listEntries, states } from '../ledger/entries.ts'
import { compareMonths } from '../ledger/summary.ts'
import { result } from './json.ts'

const month = z.string().describe('Month as YYYY-MM')
const today = z.string().optional().describe('Reference date YYYY-MM-DD for pending and late; defaults to today in America/Sao_Paulo')
const readOnly = { readOnlyHint: true, openWorldHint: false }

export const createServer = (client: Queryable) => {
  const server = new McpServer({ name: 'finance', version: '0.1.0' })

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

  return server
}
