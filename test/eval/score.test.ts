import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { type Expected, match, sameValue, score } from '../../src/eval/score.ts'
import type { ImportOutput } from '../../src/import/candidate.ts'

const entry = (payload: Record<string, unknown>): Expected => ({ kind: 'entry', payload })
const usage = { inputTokens: 10, outputTokens: 5, costUsdMicros: 105 }

const predicted = (payload: Record<string, unknown>) => ({ kind: 'entry' as const, source: 'L1', confidence: 0.9, payload: { date: '2026-10-01', description: 'x', direction: 'expense' as const, amountCents: 1, category: 'Casa', paid: true, ...payload } })

describe('eval scoring', () => {
  test('compares text by normalized containment and everything else exactly', () => {
    assert.ok(sameValue('Aluguel', 'PIX ENVIADO ALUGUEL APTO'))
    assert.ok(sameValue('Alimentação', 'alimentacao'))
    assert.ok(!sameValue('Alimentação', 'Mercado'))
    assert.ok(!sameValue('IO', 'Rio'))
    assert.ok(sameValue({ number: 3, total: 10 }, { number: 3, total: 10 }))
    assert.ok(!sameValue(100, '100'))
  })

  test('pairs each expected item with its best predicted item of the same kind once', () => {
    const expected = [entry({ date: '2026-10-02', amountCents: 500 }), entry({ date: '2026-10-03', amountCents: 700 })]
    const found = [entry({ date: '2026-10-03', amountCents: 700 }), { kind: 'account' as const, payload: { date: '2026-10-02', amountCents: 500 } }, entry({ date: '2026-10-02', amountCents: 999 })]
    assert.deepEqual(
      match(expected, found).map(({ wanted, found }) => [wanted, found]),
      [
        [1, 0],
        [0, 2],
      ],
    )
    assert.deepEqual(match([entry({ date: '2026-10-02', amountCents: 500, category: 'Casa' })], [entry({ date: '2026-10-02', amountCents: 1 })]), [])
  })

  test('scores candidates, judged fields, totals and cost', () => {
    const expected = [entry({ date: '2026-10-01', amountCents: 1000, category: 'Moradia' }), entry({ date: '2026-10-05', amountCents: 300, direction: 'income' }), { kind: 'reserve' as const, payload: { name: 'Viagem' } }]
    const output: ImportOutput = {
      candidates: [predicted({ amountCents: 1000, category: 'Aluguel' }), predicted({ date: '2026-10-05', amountCents: 300, direction: 'expense' }), predicted({ date: '2026-10-09', amountCents: 50 })],
      questions: [],
      totals: [
        { source: 'A9', month: '2026-10-01', direction: 'expense', amountCents: 1350 },
        { source: 'A10', month: '2026-10-01', direction: 'expense', amountCents: 9 },
      ],
    }
    const result = score(expected, output, usage)
    assert.deepEqual(result.candidates, { expected: 3, predicted: 3, correct: 2, precision: 2 / 3, recall: 2 / 3 })
    assert.deepEqual(result.fields['entry.amountCents'], { expected: 2, predicted: 3, correct: 2, precision: 2 / 3, recall: 1 })
    assert.deepEqual(result.fields['entry.category'], { expected: 1, predicted: 2, correct: 0, precision: 0, recall: 0 })
    assert.deepEqual(result.fields['entry.direction'], { expected: 1, predicted: 2, correct: 0, precision: 0, recall: 0 })
    assert.deepEqual(result.fields['reserve.name'], { expected: 1, predicted: 0, correct: 0, precision: 1, recall: 0 })
    assert.equal(result.fields['entry.description'], undefined)
    assert.deepEqual(result.totals, { stated: 2, mismatched: ['A10: expense 2026-10 expected 9, found 1350'] })
    assert.deepEqual(result.usage, usage)
  })
})
