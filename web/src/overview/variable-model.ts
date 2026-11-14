import type { components } from '../api/schema.ts'
import { percentOf } from './model.ts'

export type VariablePlan = components['schemas']['VariablePlan']

export type VariableLine = { id: string; name: string; member: string | null; spent: bigint; estimate: bigint; percent: number; over: boolean }

const cents = (money: { cents: string }) => BigInt(money.cents)

export const variableLines = (plan: VariablePlan): VariableLine[] =>
  plan.items.map((item) => {
    const spent = cents(item.spent)
    const estimate = cents(item.estimate)
    return { id: item.id, name: item.description, member: item.member, spent, estimate, percent: percentOf(spent, estimate), over: spent > estimate }
  })

export const variableTotals = (plan: VariablePlan) => ({ spent: cents(plan.spent), estimate: cents(plan.estimate), unspent: cents(plan.unspent) })
