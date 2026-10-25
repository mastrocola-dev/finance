import * as z from 'zod'
import { batchStatuses } from '../import/batches.ts'
import { kinds } from '../import/candidate.ts'
import { authors } from '../ledger/audit.ts'
import { statuses } from '../ledger/decisions.ts'
import { origins, states } from '../ledger/entries.ts'
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

export const categoryQuery = z.object({ direction: direction.optional() })

export const decisionQuery = z.object({
  status: z.enum([...statuses, 'all']).default('proposed'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const auditQuery = z.object({
  author: z.enum(authors).optional(),
  member: z.string().optional().describe('Member name'),
  entity: z.string().optional().describe('Table name such as entry or decision'),
  before: id.optional().describe('Cursor: the next value of the previous page'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const importQuery = z.object({ status: z.enum(batchStatuses).optional() })

export const questionPath = z.object({ id, question: id })
export const candidatePath = z.object({ id, candidate: id })
export const answerBody = z.object({ answer: z.string().describe('One of the options or free text; naming an existing member, account, category or reserve resolves every candidate carrying the asked name') })
export const candidateEdit = z.object({ payload: z.record(z.string(), z.unknown()).describe('Full candidate payload in camelCase, checked against the schema of its kind') })
export const candidateIds = z.object({ ids: z.array(id).min(1).max(500) })

export const uploadQuery = z.object({ consent: z.literal('true').describe('Confirms the member agreed that the file content is sent to the model for extraction') })

const fileName = z
  .string()
  .min(1)
  .max(600)
  .transform((value, context) => {
    try {
      return decodeURIComponent(value)
    } catch {
      context.addIssue({ code: 'custom', message: 'file name must be percent-encoded' })
      return z.NEVER
    }
  })

export const uploadHeaders = z.object({ 'x-file-name': fileName.describe('Original file name, percent-encoded; the extension sets the format') })

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
  installmentsTotal: z.int().nullable(),
  origin: z.enum(origins).describe('forecast marks entries planned from a recurring source'),
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
  nextDueOn: date.nullable().describe('Oldest unpaid installment, else a month after the last one recorded'),
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

const member = z.strictObject({ id, name: z.string(), sharePercent: z.int() })

const category = z.strictObject({ id, name: z.string(), direction })

const account = z.strictObject({ id, nickname: z.string(), lastFour: z.string().describe('Last four digits only'), member: z.string().nullable().describe('Owner; null means joint') })

const goal = z.strictObject({
  id,
  name: z.string(),
  reserve: z.string().nullable(),
  target: money,
  saved: money,
  missing: money,
  progressPercent: z.string(),
  dueOn: date.nullable(),
})

const auditItem = z.strictObject({
  id,
  at: z.iso.datetime(),
  author: z.enum(authors),
  member: z.string().nullable(),
  entity: z.string(),
  entityId: z.string().nullable(),
  action: z.enum(['create', 'update', 'close']),
  subject: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
})

const auditPage = z.strictObject({
  items: z.array(auditItem),
  counts: z.strictObject(Object.fromEntries(authors.map((name) => [name, z.int()])) as Record<(typeof authors)[number], z.ZodInt>),
  memberCounts: z.array(z.strictObject({ name: z.string(), total: z.int() })).describe('Entries written by each member themselves'),
  next: id.nullable().describe('Pass as before to read the next page'),
})

const part = z.strictObject({ name: z.string(), sharePercent: z.int(), paid: money, share: money, balance: money.describe('Paid minus share; negative owes') })
const transfer = z.strictObject({ from: z.string(), to: z.string(), amount: money })
const split = z.strictObject({ month: date, total: money.describe('Joint expenses paid from member accounts'), members: z.array(part), transfers: z.array(transfer) })

const netWorth = z.strictObject({ reserves: money, goals: money.describe('Goals not kept in a reserve'), debts: money, netWorth: money })

const forecast = z.strictObject({ month: date, skipped: z.int(), created: z.array(entry) })

const check = z.strictObject({ code: z.string(), detail: z.string().optional() })

const progress = z.strictObject({
  state: z.enum(['extracting', 'done', 'failed']),
  done: z.int().describe('Chunks extracted'),
  total: z.int().describe('Chunks planned'),
  error: z.string().nullable(),
})

const importBatch = z.strictObject({
  id,
  fileName: z.string(),
  format: z.string(),
  status: z.enum(batchStatuses),
  createdAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  inputTokens: z.int(),
  outputTokens: z.int(),
  costUsd: z.string().describe('Model cost in US dollars, four decimals'),
  checks: z.array(check).describe('Batch checks such as total_mismatch'),
  failures: z.array(z.strictObject({ source: z.string(), offset: z.int(), reason: z.string() })).describe('Chunks whose extraction failed'),
  totals: z.array(z.record(z.string(), z.unknown())).describe('Totals printed in the source'),
  candidates: z.int().describe('Open candidates'),
  flagged: z.int().describe('Open candidates with at least one check'),
  openQuestions: z.int(),
  committed: z.int().describe('Candidates written to the ledger, kept after the batch is closed'),
  retryable: z.int().describe('Chunks a retry would extract again: failed, or holding pending candidates below the confidence threshold and nothing reviewed; 0 once committed or closed'),
  progress: progress.nullable().describe('Extraction progress while this API process runs it; null otherwise'),
})

const importCandidate = z.strictObject({
  id,
  kind: z.enum(kinds),
  source: z.string().describe('Where in the file the candidate was read'),
  chunk: z.string().nullable(),
  confidence: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected', 'edited']),
  payload: z.record(z.string(), z.unknown()).describe('Candidate fields in camelCase, amounts in integer cents'),
  checks: z.array(check),
  recordId: id.nullable().describe('Ledger row created from this candidate when the batch was committed; its table is the kind'),
})

const importQuestion = z.strictObject({
  id,
  candidateId: id.nullable(),
  question: z.string(),
  options: z.array(z.string()),
  source: z.string().nullable(),
  chunk: z.string().nullable(),
  answer: z.string().nullable(),
})

const error = z.strictObject({ error: z.string(), issues: z.array(z.strictObject({ path: z.string(), message: z.string() })).optional() })

const document = z.looseObject({ openapi: z.string() })

export const schemas = {
  Money: money,
  Entry: entry,
  CategoryTotals: categoryTotals,
  Side: side,
  MonthSummary: monthSummary,
  CategoryDifference: categoryDifference,
  Comparison: comparison,
  Debt: debt,
  Reserve: reserve,
  Decision: decision,
  Forecast: forecast,
  Member: member,
  Category: category,
  Account: account,
  Goal: goal,
  AuditItem: auditItem,
  AuditPage: auditPage,
  SplitPart: part,
  Transfer: transfer,
  Split: split,
  NetWorth: netWorth,
  ImportBatch: importBatch,
  ImportCandidate: importCandidate,
  ImportQuestion: importQuestion,
  ApiError: error,
  OpenApiDocument: document,
}
