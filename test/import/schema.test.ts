import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { importOutput } from '../../src/import/candidate.ts'
import { outputSchemaPath, outputSchemaText, parameterCounts, structured } from '../../src/import/schema.ts'
import { sample } from './sample.ts'

test('committed output schema is current (npm run agent:schema)', async () => {
  assert.equal(await readFile(outputSchemaPath, 'utf8'), outputSchemaText())
})

test('output schema keeps only what structured output accepts', () => {
  const text = outputSchemaText()
  for (const key of ['oneOf', 'minimum', 'maximum', 'minLength', 'maxLength', 'maxItems']) assert.equal(text.includes(`"${key}"`), false, key)
  assert.match(text, /"anyOf"/)
  assert.match(text, /"format": "date"/)
  assert.match(text, /"pattern": "\^\\\\d\{4\}\$"/)
  assert.equal(text.match(/"pattern"/g)?.length, 1)
})

test('structured rewrites nested nodes and leaves values alone', () => {
  const schema = { oneOf: [{ type: 'string', format: 'date', pattern: '^x$', maxLength: 3, description: 'minimum' }], items: [{ maximum: 1, const: 'oneOf' }] }
  assert.deepEqual(structured(schema), { anyOf: [{ type: 'string', format: 'date', description: 'minimum' }], items: [{ const: 'oneOf' }] })
})

test('the zod schema still enforces what the json schema drops', () => {
  assert.equal(importOutput.safeParse(sample).success, true)
  const tooMany = { candidates: Array.from({ length: 501 }, () => sample.candidates[0]), questions: [] }
  assert.equal(importOutput.safeParse(tooMany).success, false)
})

test('output schema stays within the structured output limits of the Messages API', () => {
  const { optional, unions } = parameterCounts(JSON.parse(outputSchemaText()))
  assert.ok(optional <= 20, `optional parameters: ${optional} (API limit 24, kept 4 apart)`)
  assert.ok(unions <= 12, `union parameters: ${unions} (API limit 16, kept 4 apart)`)
})

test('nullable and defaulted properties are required so the model answers null instead of guessing', () => {
  const schema = { type: 'object', properties: { a: { anyOf: [{ type: 'string' }, { type: 'null' }] }, b: { type: 'array', default: [] }, c: { type: 'string' } }, required: [] }
  assert.deepEqual(structured(schema), { type: 'object', properties: { a: { anyOf: [{ type: 'string' }, { type: 'null' }] }, b: { type: 'array' }, c: { type: 'string' } }, required: ['a', 'b'] })
})

test('null means unknown and parses as an absent field', () => {
  const output = { ...sample, questions: [{ question: 'GMA é a Gabriela?', options: [], source: null, candidate: null }] }
  const parsed = importOutput.parse(output)
  assert.equal(parsed.questions[0]?.source, undefined)
  assert.equal(parsed.questions[0]?.candidate, undefined)
})
