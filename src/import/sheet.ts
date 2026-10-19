import { readSheet } from 'read-excel-file/node'
import { formatBrl } from '../ledger/money.ts'
import type { NewEntry } from '../ledger/record.ts'
import { RuleError } from '../ledger/rule.ts'
import { assertDate, competenceOf } from '../ledger/summary.ts'

const columns = ['kind', 'description', 'category', 'account', 'member', 'due_on', 'amount'] as const

const optional = 'installment'

const directions = { income: 'income', fixed: 'expense', variable: 'expense' } as const

const totalKind = 'total'

const text = (cell: unknown) => (typeof cell === 'string' ? cell.trim() : '')

const isEmpty = (cell: unknown) => cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '')

const isBlank = (row: unknown[]) => row.every(isEmpty)

const amountCents = (cell: unknown, line: number) => {
  if (typeof cell !== 'number') throw new RuleError(`line ${line}: amount must be a number`)
  const cents = Math.round(cell * 100)
  if (cents <= 0 || Math.abs(cell * 100 - cents) > 1e-6) throw new RuleError(`line ${line}: amount must be positive with up to 2 decimals`)
  return BigInt(cents)
}

const totalCents = (cell: unknown, line: number) => {
  if (typeof cell !== 'number') throw new RuleError(`line ${line}: total must be a number`)
  const cents = Math.round(cell * 100)
  if (Math.abs(cell * 100 - cents) > 1e-6) throw new RuleError(`line ${line}: total must have up to 2 decimals`)
  return BigInt(cents)
}

const installmentOf = (kind: string, cell: unknown, line: number) => {
  if (isEmpty(cell)) return undefined
  if (kind !== 'fixed') throw new RuleError(`line ${line}: installment is only for fixed lines`)
  if (typeof cell !== 'number' || !Number.isInteger(cell) || cell <= 0) throw new RuleError(`line ${line}: installment must be a positive whole number`)
  return cell
}

const toEntry = (row: unknown[], month: string, line: number): NewEntry => {
  const kind = text(row[0])
  if (!Object.hasOwn(directions, kind)) throw new RuleError(`line ${line}: unknown kind ${kind}`)
  const dueOn = assertDate(text(row[5]))
  if (competenceOf(dueOn) !== competenceOf(month)) throw new RuleError(`line ${line}: due_on ${dueOn} is outside ${month}`)
  const installment = installmentOf(kind, row[7], line)
  const entry = {
    month,
    dueOn,
    description: text(row[1]),
    direction: directions[kind as keyof typeof directions],
    amount: amountCents(row[6], line),
    category: text(row[2]),
    account: text(row[3]) || undefined,
    member: text(row[4]),
    ...(installment === undefined ? {} : { installment }),
  }
  if (!entry.description || !entry.category || !entry.member) throw new RuleError(`line ${line}: description, category and member are required`)
  return entry
}

const checkHeader = (header: unknown[]) => {
  const names = header.map((cell) => text(cell).toLowerCase())
  const extra = names[columns.length] ?? ''
  if (columns.some((name, index) => names[index] !== name) || (extra !== '' && extra !== optional)) {
    throw new RuleError(`header must be ${columns.join(', ')}, optionally ${optional}`)
  }
}

const netCents = (entries: NewEntry[]) => entries.reduce((sum, entry) => sum + (entry.direction === 'income' ? entry.amount : -entry.amount), 0n)

export const entriesFromRows = (rows: unknown[][], month: string): NewEntry[] => {
  const [header = [], ...body] = rows
  checkHeader(header)
  const lines = body.map((row, index) => ({ row, line: index + 2 })).filter(({ row }) => !isBlank(row))
  const totals = lines.filter(({ row }) => text(row[0]) === totalKind)
  if (totals.length > 1) throw new RuleError(`line ${totals[1]?.line}: only one total row is allowed`)
  const entries = lines.filter(({ row }) => text(row[0]) !== totalKind).map(({ row, line }) => toEntry(row, month, line))
  const [total] = totals
  if (total) {
    const expected = totalCents(total.row[6], total.line)
    const actual = netCents(entries)
    if (expected !== actual) throw new RuleError(`line ${total.line}: total ${formatBrl(expected)} does not match the lines ${formatBrl(actual)}`)
  }
  return entries
}

export const readMonthSheet = async (file: string, month: string) => {
  const sheet = competenceOf(month).slice(0, 7)
  return entriesFromRows(await readSheet(file, sheet), month)
}
