import { formatDay } from '../lib/format.ts'
import { type Entry, percentOf } from '../overview/model.ts'

const rank = { late: 0, pending: 1, paid: 2 }

const billOrder = (a: Entry, b: Entry) => rank[a.state] - rank[b.state] || (a.paidOn ?? a.dueOn).localeCompare(b.paidOn ?? b.dueOn) || a.description.localeCompare(b.description)

export const billsOf = (entries: Entry[]) => entries.filter((entry) => entry.direction === 'expense').sort(billOrder)

export const progressOf = (bills: Entry[]) => {
  const paid = bills.filter((bill) => bill.state === 'paid')
  const open = bills.filter((bill) => bill.state !== 'paid').reduce((total, bill) => total + BigInt(bill.amount.cents), 0n)
  return { paidCount: paid.length, count: bills.length, open, percent: Math.round(percentOf(BigInt(paid.length), BigInt(bills.length))) }
}

const when = (bill: Entry) => {
  if (bill.state === 'paid') return bill.paidOn ? `pago ${formatDay(bill.paidOn)}` : 'pago'
  if (bill.state === 'late') return `Atrasada · venceu ${formatDay(bill.dueOn)}`
  return `vence ${formatDay(bill.dueOn)}`
}

export const billMeta = (bill: Entry) => [when(bill), bill.member ?? 'Conjunto', bill.account, bill.installmentNumber && `parcela ${bill.installmentNumber}`].filter(Boolean).join(' · ')

export const withPayment = (bill: Entry, paid: boolean, on: string): Entry => (paid ? { ...bill, status: 'paid', state: 'paid', paidOn: on } : { ...bill, status: 'planned', state: bill.dueOn < on ? 'late' : 'pending', paidOn: null })

export const stableOrder = (previous: string[], bills: Entry[]) => {
  const ids = bills.map((bill) => bill.id)
  const same = previous.length === ids.length && ids.every((id) => previous.includes(id))
  return same ? previous : ids
}
