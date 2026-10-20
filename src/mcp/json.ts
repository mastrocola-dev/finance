import { money } from '../ledger/money.ts'

const convert = (key: string, value: unknown): unknown => {
  if (typeof value === 'bigint') return key === 'id' ? value.toString() : money(value)
  if (Array.isArray(value)) return value.map((item) => convert('', item))
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, convert(name, item)]))
  return value
}

export const toJson = (value: unknown) => convert('', value)

export const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(toJson(value)) }] })
