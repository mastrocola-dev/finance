import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { contextTokens, ruleViolations } from '../../src/eval/rules.ts'
import { importOutput } from '../../src/import/candidate.ts'
import { emptyContext } from '../../src/import/context.ts'

const ledger = { ...emptyContext(), members: [{ name: 'Gabriela', initials: 'G' }], categories: { income: ['Salário'], expense: ['Mercado', 'Saúde'] } }
const entry = (source: string, category: string, member?: string, direction: 'income' | 'expense' = 'expense') => ({ kind: 'entry', source, confidence: 0.9, payload: { date: '2026-11-02', description: 'Item', direction, amountCents: 100, category, member, paid: true } }) as const
const category = (name: string) => ({ kind: 'category', source: 'L1', confidence: 0.9, payload: { name, kind: 'expense' } }) as const
const question = (text: string) => ({ question: text, options: [] })

describe('import prompt rules in evaluations', () => {
  test('passes an output that reuses categories, proposes new ones once and maps members', () => {
    const output = importOutput.parse({ candidates: [entry('L1', 'Mercado', 'joint'), entry('L2', 'Pets', 'Gabriela'), category('Pets'), entry('L3', 'Salário', undefined, 'income')], questions: [question('Foi R$ 70 ou R$ 700?')], totals: [] })
    assert.deepEqual(ruleViolations(ledger, output, ['L1@0']), [])
  })

  test('names every broken rule', () => {
    const output = importOutput.parse({
      candidates: [entry('L1', 'Supermercado', 'Gabi'), category('saude'), category('Pets'), category('pets'), entry('L2', 'Mercado', undefined, 'income')],
      questions: [question('Supermercado é uma categoria nova ou existente?'), question('a'), question('b')],
      totals: [],
    })
    assert.deepEqual(ruleViolations(ledger, output, ['L1@0', 'L1@0', 'L1@0']), [
      'L1@0 asks 3 questions',
      'asks new or existing: Supermercado é uma categoria nova ou existente?',
      'category saude already exists',
      'category pets proposed twice',
      'L1: category Supermercado is neither listed nor proposed',
      'L1: member Gabi is not a ledger name',
      'L2: category Mercado is neither listed nor proposed',
    ])
  })

  test('estimates the tokens the ledger block adds to each chunk', () => {
    assert.equal(contextTokens(emptyContext()), Math.ceil(JSON.stringify({ ledger: emptyContext() }).length / 3))
  })
})
