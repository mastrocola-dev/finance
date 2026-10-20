import type { Queryable } from '../db/connection.ts'
import { RuleError } from './rule.ts'

export type Totals = { count: number; total: bigint; paid: bigint; pending: bigint; late: bigint }
export type CategoryTotals = Totals & { category: string }
export type Side = Totals & { byCategory: CategoryTotals[] }
export type MonthSummary = { month: string; today: string; income: Side; expenses: Side; balance: bigint }
export type CategoryDifference = { category: string; month: bigint; other: bigint; difference: bigint }
export type Comparison = {
  month: MonthSummary
  other: MonthSummary
  difference: { income: bigint; expenses: bigint; balance: bigint; expensesByCategory: CategoryDifference[] }
}

type Direction = 'income' | 'expense'
type Bucket = { direction: Direction; category: string; count: number; total: string; paid: string; pending: string; late: string }

const zone = 'America/Sao_Paulo'

export const localToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(now)

export const competenceOf = (month: string) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/.exec(month)
  if (!match) throw new RuleError(`month must be YYYY-MM, got ${month}`)
  return `${match[1]}-${match[2]}-01`
}

export const shiftMonth = (month: string, count: number) => {
  const competence = competenceOf(month)
  return new Date(Date.UTC(Number(competence.slice(0, 4)), Number(competence.slice(5, 7)) - 1 + count, 1)).toISOString().slice(0, 10)
}

export const assertDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new RuleError(`date must be YYYY-MM-DD, got ${date}`)
  return date
}

const buckets = `
  select e.direction, c.name as category, count(*)::int as count,
    sum(e.amount_cents)::text as total,
    coalesce(sum(e.amount_cents) filter (where e.status = 'paid'), 0)::text as paid,
    coalesce(sum(e.amount_cents) filter (where e.status = 'planned' and e.due_on >= $2), 0)::text as pending,
    coalesce(sum(e.amount_cents) filter (where e.status = 'late' or (e.status = 'planned' and e.due_on < $2)), 0)::text as late
  from entry e join category c on c.id = e.category_id
  where e.closed_at is null and e.competence = $1
  group by e.direction, c.name`

const empty = (): Totals => ({ count: 0, total: 0n, paid: 0n, pending: 0n, late: 0n })

const totalsOf = ({ count, total, paid, pending, late }: Bucket): Totals => ({ count, total: BigInt(total), paid: BigInt(paid), pending: BigInt(pending), late: BigInt(late) })

const add = (sum: Totals, part: Totals): Totals => ({ count: sum.count + part.count, total: sum.total + part.total, paid: sum.paid + part.paid, pending: sum.pending + part.pending, late: sum.late + part.late })

const byTotal = (a: CategoryTotals, b: CategoryTotals) => (a.total === b.total ? a.category.localeCompare(b.category) : a.total > b.total ? -1 : 1)

const side = (rows: Bucket[], direction: Direction): Side => {
  const byCategory = rows
    .filter((row) => row.direction === direction)
    .map((row) => ({ category: row.category, ...totalsOf(row) }))
    .sort(byTotal)
  return { ...byCategory.reduce(add, empty()), byCategory }
}

export const monthSummary = async (client: Queryable, month: string, today = localToday()): Promise<MonthSummary> => {
  const competence = competenceOf(month)
  const { rows } = await client.query<Bucket>(buckets, [competence, assertDate(today)])
  const income = side(rows, 'income')
  const expenses = side(rows, 'expense')
  return { month: competence, today, income, expenses, balance: income.total - expenses.total }
}

const categoryDifferences = (month: Side, other: Side) => {
  const totals = (side: Side) => new Map(side.byCategory.map(({ category, total }) => [category, total]))
  const current = totals(month)
  const previous = totals(other)
  return [...new Set([...current.keys(), ...previous.keys()])]
    .map((category) => {
      const a = current.get(category) ?? 0n
      const b = previous.get(category) ?? 0n
      return { category, month: a, other: b, difference: a - b }
    })
    .sort((a, b) => (a.difference === b.difference ? a.category.localeCompare(b.category) : a.difference > b.difference ? -1 : 1))
}

export const compareMonths = async (client: Queryable, month: string, other = shiftMonth(month, -1), today = localToday()): Promise<Comparison> => {
  const current = await monthSummary(client, month, today)
  const previous = await monthSummary(client, other, today)
  return {
    month: current,
    other: previous,
    difference: {
      income: current.income.total - previous.income.total,
      expenses: current.expenses.total - previous.expenses.total,
      balance: current.balance - previous.balance,
      expensesByCategory: categoryDifferences(current.expenses, previous.expenses),
    },
  }
}
