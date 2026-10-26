import type { components } from '../api/schema.ts'
import { formatThousandsBrl } from '../lib/format.ts'

export type Entry = components['schemas']['Entry']

export type CategorySpend = { name: string; cents: bigint; previous: bigint; share: number }

const sum = (entries: Entry[]) => entries.reduce((total, entry) => total + BigInt(entry.amount.cents), 0n)

const byState = (entries: Entry[], ...states: Entry['state'][]) => entries.filter((entry) => states.includes(entry.state))

const spendByCategory = (entries: Entry[]) => {
  const totals = new Map<string, bigint>()
  for (const entry of entries) totals.set(entry.category, (totals.get(entry.category) ?? 0n) + BigInt(entry.amount.cents))
  return totals
}

export const categories = (entries: Entry[], previousEntries: Entry[]): CategorySpend[] => {
  const current = spendByCategory(entries.filter((entry) => entry.direction === 'expense'))
  const previous = spendByCategory(previousEntries.filter((entry) => entry.direction === 'expense'))
  const largest = [...current.values()].reduce((max, cents) => (cents > max ? cents : max), 0n)
  return [...current].map(([name, cents]) => ({ name, cents, previous: previous.get(name) ?? 0n, share: largest > 0n ? Number((cents * 1000n) / largest) / 10 : 0 })).sort((a, b) => (a.cents === b.cents ? a.name.localeCompare(b.name) : a.cents > b.cents ? -1 : 1))
}

export const change = (cents: bigint, previous: bigint) => (previous === 0n ? undefined : Number(((cents - previous) * 1000n) / previous) / 10)

export const percentOf = (part: bigint, whole: bigint) => (whole > 0n ? Number((part * 1000n) / whole) / 10 : 0)

const dueOrder = (a: Entry, b: Entry) => (a.state === b.state ? a.dueOn.localeCompare(b.dueOn) : a.state === 'late' ? -1 : 1)

export const overview = (entries: Entry[]) => {
  const income = entries.filter((entry) => entry.direction === 'income')
  const expenses = entries.filter((entry) => entry.direction === 'expense')
  const paidExpenses = byState(expenses, 'paid')
  const open = byState(expenses, 'pending', 'late')
  return {
    balance: sum(income) - sum(expenses),
    income: { total: sum(income), received: sum(byState(income, 'paid')), count: income.length, receivedCount: byState(income, 'paid').length },
    expenses: { total: sum(expenses), paid: sum(paidExpenses), pending: sum(byState(expenses, 'pending')), late: sum(byState(expenses, 'late')), count: expenses.length, paidCount: paidExpenses.length },
    open: sum(open),
    due: open.sort(dueOrder),
  }
}

export type Overview = ReturnType<typeof overview>

export type FlowMonth = { month: string; income: bigint; expenses: bigint; net: bigint }

export const flow = (months: { month: string; entries: Entry[] }[]): FlowMonth[] =>
  months.map(({ month, entries }) => {
    const income = sum(entries.filter((entry) => entry.direction === 'income'))
    const expenses = sum(entries.filter((entry) => entry.direction === 'expense'))
    return { month, income, expenses, net: income - expenses }
  })

const range = (values: bigint[]) => {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `entre ${formatThousandsBrl(sorted[0] ?? 0n)} e ${formatThousandsBrl(sorted.at(-1) ?? 0n)}`
}

export const flowSummary = (months: FlowMonth[]) => `Receitas ${range(months.map(({ income }) => income))}; despesas ${range(months.map(({ expenses }) => expenses))}`
