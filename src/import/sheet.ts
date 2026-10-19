import { readSheet } from 'read-excel-file/node'
import type { NewEntry } from '../ledger/record.ts'
import { RuleError } from '../ledger/rule.ts'
import { assertDate, competenceOf } from '../ledger/summary.ts'

const columns = ['kind', 'description', 'category', 'account', 'member', 'due_on', 'amount'] as const

const directions = { income: 'income', fixed: 'expense', variable: 'expense' } as const

const text = (cell: unknown) => (typeof cell === 'string' ? cell.trim() : '')

const isBlank = (row: unknown[]) => row.every((cell) => cell === null || (typeof cell === 'string' && cell.trim() === ''))

const amountCents = (cell: unknown, line: number) => {
  if (typeof cell !== 'number') throw new RuleError(`line ${line}: amount must be a number`)
  const cents = Math.round(cell * 100)
  if (cents <= 0 || Math.abs(cell * 100 - cents) > 1e-6) throw new RuleError(`line ${line}: amount must be positive with up to 2 decimals`)
  return BigInt(cents)
}

const toEntry = (row: unknown[], month: string, line: number): NewEntry => {
  const kind = text(row[0])
  if (!Object.hasOwn(directions, kind)) throw new RuleError(`line ${line}: unknown kind ${kind}`)
  const dueOn = assertDate(text(row[5]))
  if (competenceOf(dueOn) !== competenceOf(month)) throw new RuleError(`line ${line}: due_on ${dueOn} is outside ${month}`)
  const entry = {
    month,
    dueOn,
    description: text(row[1]),
    direction: directions[kind as keyof typeof directions],
    amount: amountCents(row[6], line),
    category: text(row[2]),
    account: text(row[3]) || undefined,
    member: text(row[4]),
  }
  if (!entry.description || !entry.category || !entry.member) throw new RuleError(`line ${line}: description, category and member are required`)
  return entry
}

export const entriesFromRows = (rows: unknown[][], month: string): NewEntry[] => {
  const [header = [], ...body] = rows
  if (columns.some((name, index) => text(header[index]).toLowerCase() !== name)) throw new RuleError(`header must be ${columns.join(', ')}`)
  return body.flatMap((row, index) => (isBlank(row) ? [] : [toEntry(row, month, index + 2)]))
}

export const readMonthSheet = async (file: string, month: string) => {
  const sheet = competenceOf(month).slice(0, 7)
  return entriesFromRows(await readSheet(file, sheet), month)
}
