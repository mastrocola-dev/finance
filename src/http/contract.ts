import * as z from 'zod'
import { statuses } from '../ledger/decisions.ts'
import { states } from '../ledger/entries.ts'
import { date, id, month, today } from '../mcp/schema.ts'

export const memberHeader = 'x-member'

const direction = z.enum(['income', 'expense'])

export const monthPath = z.object({ month })
export const idPath = z.object({ id })
export const namePath = z.object({ name: z.string().describe('Reserve name, percent-encoded') })
export const referenceQuery = z.object({ today })

export const summaryQuery = z.object({ compare_with: month.optional().describe('Month to compare with; defaults to the previous month'), today })

export const entryQuery = z.object({
  direction: direction.optional(),
  category: z.string().optional(),
  account: z.string().optional().describe('Account nickname'),
  member: z.string().optional().describe('Member name or joint'),
  state: z.enum(states).optional(),
  today,
})

export const decisionQuery = z.object({
  status: z.enum([...statuses, 'all']).default('proposed'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const newEntry = z.object({
  month,
  due_on: date,
  description: z.string().trim().min(1),
  direction,
  amount_cents: z.int().positive(),
  category: z.string(),
  account: z.string().optional(),
  member: z.string().describe('Member name or joint'),
  paid_on: date.optional(),
})

export const payment = z.object({ paid_on: date.optional() })

export const reserveChanges = z.object({ balance_cents: z.int().optional(), target_cents: z.int().positive().optional() })

export const newDecision = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  amount_cents: z.int().positive().optional(),
})

const money = z.strictObject({ cents: z.string().describe('Integer cents in BRL'), brl: z.string().describe('Formatted as R$ 1.234,56') })

const entry = z.strictObject({
  id,
  competence: date,
  dueOn: date,
  description: z.string(),
  direction,
  amount: money,
  category: z.string(),
  account: z.string().nullable(),
  member: z.string().nullable(),
  status: z.enum(['planned', 'paid', 'late']),
  state: z.enum(states),
  paidOn: date.nullable(),
  installmentNumber: z.int().nullable(),
})

const totals = { count: z.int(), total: money, paid: money, pending: money, late: money }
const categoryTotals = z.strictObject({ category: z.string(), ...totals })
const side = z.strictObject({ ...totals, byCategory: z.array(categoryTotals) })
const monthSummary = z.strictObject({ month: date, today: date, income: side, expenses: side, balance: money })
const categoryDifference = z.strictObject({ category: z.string(), month: money, other: money, difference: money })

const comparison = z.strictObject({
  month: monthSummary,
  other: monthSummary,
  difference: z.strictObject({ income: money, expenses: money, balance: money, expensesByCategory: z.array(categoryDifference) }),
})

const debt = z.strictObject({
  id,
  creditor: z.string(),
  description: z.string(),
  member: z.string().nullable(),
  account: z.string().nullable(),
  principal: money,
  balance: money,
  monthlyRatePercent: z.string().nullable(),
  installment: money.nullable(),
  installmentsTotal: z.int().nullable(),
  installmentsPaid: z.int(),
  installmentsRemaining: z.int().nullable(),
  startsOn: date,
})

const reserve = z.strictObject({
  id,
  name: z.string(),
  account: z.string().nullable(),
  balance: money,
  target: money.nullable(),
  missing: money.nullable(),
  progressPercent: z.string().nullable(),
})

const decision = z.strictObject({
  id,
  title: z.string(),
  description: z.string(),
  amount: money.nullable(),
  status: z.enum(statuses),
  proposedBy: z.string(),
  origin: z.enum(['manual', 'claude']),
  confirmedBy: z.array(z.string()),
  awaiting: z.array(z.string()),
  createdAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
})

const forecast = z.strictObject({ month: date, skipped: z.int(), created: z.array(entry) })

const error = z.strictObject({ error: z.string(), issues: z.array(z.strictObject({ path: z.string(), message: z.string() })).optional() })

const document = z.looseObject({ openapi: z.string() })

export const schemas = { Money: money, Entry: entry, CategoryTotals: categoryTotals, Side: side, MonthSummary: monthSummary, CategoryDifference: categoryDifference, Comparison: comparison, Debt: debt, Reserve: reserve, Decision: decision, Forecast: forecast, ApiError: error, OpenApiDocument: document }
