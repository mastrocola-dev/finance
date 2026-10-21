import type { components } from '../api/schema.ts'
import { formatBrl, formatDay, formatMonthShort } from '../lib/format.ts'

export type Debt = components['schemas']['Debt']
export type Reserve = components['schemas']['Reserve']
export type Goal = components['schemas']['Goal']

export type Tick = { number: number; state: 'paid' | 'next' | 'open' }

export type DebtView = { id: string; name: string; balance: string; ticks: Tick[]; columns: number; label: string; progress: string; meta: string }

export type Saving = { id: string; name: string; percent: number; tone: 'ok' | 'accent'; value: string; meta: string }

const rate = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

const join = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(' · ')

const cents = (money: { cents: string }) => BigInt(money.cents)

export const formatSignedBrl = (value: bigint) => (value < 0n ? `− ${formatBrl(-value)}` : formatBrl(value))

const isOpen = (debt: Debt) => debt.installmentsRemaining === null || debt.installmentsRemaining > 0

export const monthlyInstallments = (debts: Debt[]) => debts.filter(isOpen).reduce((total, debt) => total + (debt.installment ? cents(debt.installment) : 0n), 0n)

export const ticksOf = (total: number, paid: number): Tick[] => Array.from({ length: total }, (_, index) => ({ number: index + 1, state: index < paid ? 'paid' : index === paid ? 'next' : 'open' }))

export const debtView = (debt: Debt): DebtView => {
  const total = debt.installmentsTotal
  const paid = debt.installmentsPaid
  const counted = total === null ? `${paid} pagas` : `${paid} de ${total} pagas`
  return {
    id: debt.id,
    name: debt.description,
    balance: formatBrl(debt.balance.cents),
    ticks: total === null ? [] : ticksOf(total, paid),
    columns: Math.max(48, total ?? 0),
    label: total === null ? `${paid} parcelas pagas` : `${paid} de ${total} parcelas pagas`,
    progress: join([counted, debt.nextDueOn && `próxima ${formatDay(debt.nextDueOn)}`]),
    meta: join([debt.installment && formatBrl(debt.installment.cents), debt.monthlyRatePercent && `${rate.format(Number(debt.monthlyRatePercent))}% a.m.`, debt.creditor]),
  }
}

const percentOf = (progress: string | null) => Math.min(100, Math.floor(Number(progress ?? 0)))

export const monthsUntil = (date: string, today: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - (Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)))

const monthYear = (date: string) => `${formatMonthShort(date)}/${date.slice(0, 4)}`

export const perMonth = (missing: bigint, months: number) => (missing + BigInt(months) - 1n) / BigInt(months)

const goalPlan = (goal: Goal, today: string) => {
  const missing = cents(goal.missing)
  if (missing === 0n) return 'meta atingida'
  const months = goal.dueOn ? monthsUntil(goal.dueOn, today) : 0
  return months > 0 ? `faltam ${formatBrl(perMonth(missing, months))}/mês` : `faltam ${formatBrl(missing)}`
}

export const reserveView = (reserve: Reserve): Saving => ({
  id: `reserve-${reserve.id}`,
  name: reserve.name,
  percent: percentOf(reserve.progressPercent),
  tone: 'ok',
  value: reserve.target ? `${formatBrl(reserve.balance.cents)} de ${formatBrl(reserve.target.cents)}` : formatBrl(reserve.balance.cents),
  meta: join([reserve.account, reserve.target ? (reserve.missing && cents(reserve.missing) > 0n ? `faltam ${formatBrl(reserve.missing.cents)}` : 'meta atingida') : 'sem meta']),
})

export const goalView = (goal: Goal, today: string): Saving => ({
  id: `goal-${goal.id}`,
  name: goal.name,
  percent: percentOf(goal.progressPercent),
  tone: 'accent',
  value: `${formatBrl(goal.saved.cents)} de ${formatBrl(goal.target.cents)}`,
  meta: join([goal.reserve && `em ${goal.reserve}`, goal.dueOn && `prazo ${monthYear(goal.dueOn)}`, goalPlan(goal, today)]),
})

export const savings = (reserves: Reserve[], goals: Goal[], today: string) => [...reserves.map(reserveView), ...goals.map((goal) => goalView(goal, today))]
