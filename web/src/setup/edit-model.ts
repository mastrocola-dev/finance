import type { Field } from '../imports/edit-model.ts'
import type { SetupKind, SetupRecord } from './model.ts'

const account: Field = { key: 'account', label: 'Conta', type: 'text', optional: true, names: 'accounts' }
const category: Field = { key: 'category', label: 'Categoria', type: 'text', names: 'categories' }
const day: Field = { key: 'dayOfMonth', label: 'Dia do mês', type: 'day' }
const name = (label: string): Field => ({ key: 'name', label, type: 'text' })
const amount = (label: string, type: 'money' | 'balance' = 'money'): Field => ({ key: 'amountCents', label, type })

export const editFields: Record<SetupKind, Field[]> = {
  income: [name('Descrição'), amount('Valor mensal'), day, account, { ...category, optional: true }],
  recurring_expense: [name('Descrição'), amount('Valor mensal'), day, account, category],
  debt: [name('Credor'), amount('Saldo devedor', 'balance'), account],
  account: [name('Apelido')],
  category: [name('Nome')],
  reserve: [name('Nome'), amount('Saldo', 'balance'), account],
  goal: [name('Nome'), amount('Meta')],
}

export const editPayload = (record: SetupRecord): Record<string, unknown> => ({
  name: record.name,
  amountCents: record.amount ? Number(record.amount.cents) : undefined,
  dayOfMonth: record.day ?? undefined,
  account: record.account ?? undefined,
  category: record.category ?? undefined,
})

export const changesOf = (record: SetupRecord, payload: Record<string, unknown>) => {
  const before = editPayload(record)
  const changes: Record<string, unknown> = {}
  for (const { key } of editFields[record.kind]) {
    const value = payload[key]
    if (value === before[key]) continue
    if (value !== undefined) changes[key] = value
    else if (key === 'account') changes.account = null
  }
  return changes
}
