import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { importOutput, importOutputJsonSchema, payloads } from '../../src/import/candidate.ts'
import { sample } from './sample.ts'

const withPayload = (index: number, changes: Record<string, unknown>) => {
  const candidates = sample.candidates.map((item, position) => (position === index ? { ...item, payload: { ...item.payload, ...changes } } : item))
  return { ...sample, candidates }
}

const rejects = (output: unknown, pattern: RegExp) => {
  const parsed = importOutput.safeParse(output)
  assert.equal(parsed.success, false)
  assert.match(JSON.stringify(parsed.error?.issues), pattern)
}

describe('import candidate schema', () => {
  test('accepts one candidate of every kind', () => {
    const parsed = importOutput.parse(sample)
    assert.deepEqual(new Set(parsed.candidates.map((item) => item.kind)), new Set(Object.keys(payloads)))
  })

  test('refuses identifying numbers in text fields', () => {
    rejects(withPayload(0, { description: 'Pix 12345678' }), /five or more digits/)
    rejects(withPayload(2, { lastFour: '54321' }), /lastFour/)
  })

  test('refuses unknown fields, fractional cents and impossible dates', () => {
    rejects(withPayload(0, { cpf: 'x' }), /unrecognized_keys/)
    rejects(withPayload(0, { amountCents: 10.5 }), /amountCents/)
    rejects(withPayload(0, { amountCents: 0 }), /amountCents/)
    rejects(withPayload(0, { date: '2026-02-30' }), /date/)
    rejects(withPayload(1, { installment: { number: 4, total: 3 } }), /exceeds/)
    rejects(withPayload(4, { endsOn: '2025-12-31' }), /before startsOn/)
    rejects(withPayload(6, { installmentsPaid: 25 }), /exceeds/)
  })

  test('refuses a candidate without a source or with a payload of another kind', () => {
    rejects({ ...sample, candidates: [{ ...sample.candidates[0], source: ' ' }] }, /source/)
    rejects({ ...sample, candidates: [{ ...sample.candidates[3], kind: 'reserve' }] }, /payload/)
    rejects({ ...sample, candidates: [{ ...sample.candidates[0], confidence: 2 }] }, /confidence/)
  })

  test('refuses a question about a missing candidate', () => {
    rejects({ ...sample, questions: [{ ...sample.questions[0], candidate: 9 }] }, /missing candidate/)
  })

  test('accepts printed totals and defaults them to none', () => {
    assert.deepEqual(importOutput.parse(sample).totals, [])
    const totals = [
      { source: '2026-10!G40', month: '2026-10-01', direction: 'expense', category: 'Moradia', amountCents: 150000 },
      { source: '2026-10!G41', month: '2026-10-01', direction: 'net', amountCents: -158990 },
    ]
    assert.deepEqual(importOutput.parse({ ...sample, totals }).totals, totals)
  })

  test('refuses totals off the first day, negative subtotals and a net total by category', () => {
    const total = { source: '2026-10!G40', month: '2026-10-01', direction: 'expense', amountCents: 150000 }
    rejects({ ...sample, totals: [{ ...total, month: '2026-10-15' }] }, /first day of the month/)
    rejects({ ...sample, totals: [{ ...total, amountCents: -1 }] }, /only a net total/)
    rejects({ ...sample, totals: [{ ...total, direction: 'net', category: 'Moradia' }] }, /net total has no category/)
    rejects({ ...sample, totals: [{ ...total, amountCents: 1.5 }] }, /amountCents/)
  })

  test('exports a closed JSON Schema for the agent output', () => {
    const schema = JSON.parse(JSON.stringify(importOutputJsonSchema())) as { $schema: string; additionalProperties: boolean; required: string[]; properties: { candidates: { items: { oneOf?: unknown[]; anyOf?: unknown[] } } } }
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.equal(schema.additionalProperties, false)
    assert.deepEqual(schema.required, ['candidates', 'questions'])
    const variants = (schema.properties.candidates.items.oneOf ?? schema.properties.candidates.items.anyOf ?? []) as { properties: { kind: { const: string }; payload: { additionalProperties: boolean } } }[]
    assert.deepEqual(new Set(variants.map((item) => item.properties.kind.const)), new Set(Object.keys(payloads)))
    assert.ok(variants.every((item) => item.properties.payload.additionalProperties === false))
  })
})
