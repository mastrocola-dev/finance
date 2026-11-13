import type { ImportOutput } from '../import/candidate.ts'
import type { LedgerContext } from '../import/context.ts'

export const questionsPerChunk = 2
export const charsPerToken = 3

const same = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0
const newOrExisting = /\bnov[ao]s?\b.*\bexistentes?\b|\bexistentes?\b.*\bnov[ao]s?\b/i

export const contextTokens = (ledger: LedgerContext) => Math.ceil(JSON.stringify({ ledger }).length / charsPerToken)

export const ruleViolations = (ledger: LedgerContext, output: ImportOutput, questionChunks: string[]) => {
  const found: string[] = []
  const perChunk = Map.groupBy(questionChunks, (key) => key)
  for (const [key, list] of perChunk) if (list.length > questionsPerChunk) found.push(`${key} asks ${list.length} questions`)
  for (const { question } of output.questions) if (newOrExisting.test(question)) found.push(`asks new or existing: ${question}`)
  const created = { income: [] as string[], expense: [] as string[] }
  for (const item of output.candidates) {
    if (item.kind !== 'category') continue
    const { name, kind } = item.payload
    if (ledger.categories[kind].some((known) => same(known, name))) found.push(`category ${name} already exists`)
    else if (created[kind].some((known) => same(known, name))) found.push(`category ${name} proposed twice`)
    else created[kind].push(name)
  }
  const members = ledger.members.map(({ name }) => name)
  for (const item of output.candidates) {
    if (item.kind !== 'entry' && item.kind !== 'income' && item.kind !== 'recurring_expense') continue
    const kind = item.kind === 'entry' ? item.payload.direction : item.kind === 'income' ? 'income' : 'expense'
    const { category, member } = item.payload
    if (category !== undefined && ![...ledger.categories[kind], ...created[kind]].includes(category)) found.push(`${item.source}: category ${category} is neither listed nor proposed`)
    if (member !== undefined && member !== 'joint' && !members.includes(member)) found.push(`${item.source}: member ${member} is not a ledger name`)
  }
  return found
}
