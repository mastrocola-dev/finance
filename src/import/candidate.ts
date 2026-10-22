import * as z from 'zod'

const digitRun = /\d{5,}/

const text = (description: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => !digitRun.test(value), 'runs of five or more digits are not allowed')
    .describe(description)

const cents = (description: string) => z.int().min(1).max(100_000_000_000).describe(`${description}, integer cents of BRL`)
const balance = (description: string) => z.int().min(0).max(100_000_000_000).describe(`${description}, integer cents of BRL`)
const day = (description: string) => z.iso.date().describe(`${description}, YYYY-MM-DD`)
const dayOfMonth = z.int().min(1).max(31).describe('Day of the month it falls due')
const count = (description: string) => z.int().min(1).max(600).describe(description)
const member = text("Member name as written in the source, 'joint' when shared by the household; omit when unknown").optional()
const category = text('Category name as written in the source or the closest household category')
const account = text('Account nickname, never a number').optional()

const ordered = (start: string, end: string) => (value: Record<string, unknown>) => {
  const [from, to] = [value[start], value[end]]
  return typeof from !== 'string' || typeof to !== 'string' || from <= to
}

export const entryPayload = z.strictObject({
  date: day('Due or transaction date'),
  description: text('Description as written in the source, without numbers that identify accounts or people'),
  direction: z.enum(['income', 'expense']),
  amountCents: cents('Absolute amount'),
  category,
  account,
  member,
  paid: z.boolean().describe('True when the source shows it as paid or received'),
  installment: z
    .strictObject({ number: count('Installment number'), total: count('Total installments') })
    .refine(({ number, total }) => number <= total, 'installment number exceeds the total')
    .optional(),
})

export const accountPayload = z.strictObject({
  institution: text('Bank or institution name'),
  nickname: text('Short name for the account'),
  lastFour: z
    .string()
    .regex(/^\d{4}$/)
    .describe('Last four digits only'),
  kind: z.enum(['checking', 'savings', 'credit_card', 'investment', 'cash']),
  member,
})

export const categoryPayload = z.strictObject({
  name: text('Category name'),
  kind: z.enum(['income', 'expense']),
})

export const incomePayload = z
  .strictObject({
    description: text('Recurring income description'),
    amountCents: cents('Monthly amount'),
    dayOfMonth,
    startsOn: day('First month it applies'),
    endsOn: day('Last date it applies').optional(),
    category: category.optional(),
    account,
    member,
  })
  .refine(ordered('startsOn', 'endsOn'), 'endsOn is before startsOn')

export const recurringExpensePayload = z
  .strictObject({
    description: text('Recurring expense description'),
    amountCents: cents('Monthly amount'),
    dayOfMonth,
    startsOn: day('First month it applies'),
    endsOn: day('Last date it applies').optional(),
    installmentsTotal: count('Total installments when it is paid in installments').optional(),
    category,
    account,
    member,
  })
  .refine(ordered('startsOn', 'endsOn'), 'endsOn is before startsOn')

export const debtPayload = z
  .strictObject({
    creditor: text('Creditor name'),
    description: text('What the debt is'),
    principalCents: cents('Original amount'),
    balanceCents: balance('Outstanding balance'),
    monthlyRatePercent: z.number().min(0).max(100).optional().describe('Monthly interest rate in percent'),
    installmentCents: cents('Installment amount').optional(),
    installmentsTotal: count('Total installments').optional(),
    installmentsPaid: z.int().min(0).max(600).optional().describe('Installments already paid'),
    startsOn: day('Start date'),
    account,
    member,
  })
  .refine(({ installmentsPaid, installmentsTotal }) => installmentsPaid === undefined || installmentsTotal === undefined || installmentsPaid <= installmentsTotal, 'installmentsPaid exceeds installmentsTotal')

export const reservePayload = z.strictObject({
  name: text('Reserve name'),
  balanceCents: balance('Current balance'),
  targetCents: cents('Target').optional(),
  account,
})

export const goalPayload = z.strictObject({
  name: text('Goal name'),
  targetCents: cents('Target'),
  savedCents: balance('Saved so far'),
  dueOn: day('Target date').optional(),
  reserve: text('Reserve that funds the goal').optional(),
})

export const payloads = {
  entry: entryPayload,
  account: accountPayload,
  category: categoryPayload,
  income: incomePayload,
  recurring_expense: recurringExpensePayload,
  debt: debtPayload,
  reserve: reservePayload,
  goal: goalPayload,
}

export type CandidateKind = keyof typeof payloads

export const kinds = Object.keys(payloads) as [CandidateKind, ...CandidateKind[]]

const source = text('Source address of the segment or record, such as 2026-10!A3:G3, $.transactions[12] or p2:L4-L5')
const confidence = z.number().min(0).max(1).describe('Confidence from 0 to 1 that the payload matches the source')

const variant = <K extends CandidateKind>(kind: K) => z.strictObject({ kind: z.literal(kind), source, confidence, payload: payloads[kind] })

export const candidate = z.discriminatedUnion('kind', [variant('entry'), variant('account'), variant('category'), variant('income'), variant('recurring_expense'), variant('debt'), variant('reserve'), variant('goal')])

export const question = z.strictObject({
  question: z.string().trim().min(1).max(300).describe('Question for the household in Portuguese, such as "GMA é a Gabriela?"'),
  options: z.array(z.string().trim().min(1).max(100)).max(6).describe('Suggested answers, empty for free text'),
  source: source.optional(),
  candidate: z.int().min(0).optional().describe('Index in candidates of the item the question is about'),
})

export const total = z
  .strictObject({
    source,
    month: z.iso
      .date()
      .refine((value) => value.endsWith('-01'), 'month must be the first day of the month')
      .describe('Competence month as its first day, YYYY-MM-01'),
    direction: z.enum(['income', 'expense', 'net']).describe('What the total sums: income, expenses, or net as income minus expenses'),
    category: category.optional().describe('Category the total covers, only for income or expense subtotals'),
    amountCents: z.int().min(-100_000_000_000).max(100_000_000_000).describe('Total as written in the source, integer cents of BRL; only net may be negative'),
  })
  .refine(({ direction, category }) => direction !== 'net' || category === undefined, 'a net total has no category')
  .refine(({ direction, amountCents }) => direction === 'net' || amountCents >= 0, 'only a net total may be negative')

export const importOutput = z
  .strictObject({
    candidates: z.array(candidate).max(500),
    questions: z.array(question).max(50),
    totals: z.array(total).max(50).default([]).describe('Totals and subtotals printed in the source, used only to check the candidates'),
  })
  .refine(({ candidates, questions }) => questions.every((item) => item.candidate === undefined || item.candidate < candidates.length), 'question points at a missing candidate')

export type Candidate = z.infer<typeof candidate>
export type ImportOutput = z.infer<typeof importOutput>
export type Total = z.infer<typeof total>

export const importOutputJsonSchema = () => z.toJSONSchema(importOutput, { io: 'input', target: 'draft-2020-12' })
