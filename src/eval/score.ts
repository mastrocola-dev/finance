import type { Usage } from '../import/agent.ts'
import type { CandidateKind, ImportOutput } from '../import/candidate.ts'
import { normalize, reconcile, type Staged } from '../import/verify.ts'

export type Expected = { kind: CandidateKind; payload: Record<string, unknown> }
export type Tally = { expected: number; predicted: number; correct: number }
export type Rates = Tally & { precision: number; recall: number }
export type Score = { candidates: Rates; fields: Record<string, Rates>; totals: { stated: number; mismatched: string[] }; usage: Usage }

const rate = (correct: number, of: number) => (of === 0 ? 1 : correct / of)

export const rates = ({ expected, predicted, correct }: Tally): Rates => ({ expected, predicted, correct, precision: rate(correct, predicted), recall: rate(correct, expected) })

export const sameValue = (expected: unknown, predicted: unknown) => {
  if (typeof expected === 'string' && typeof predicted === 'string') {
    const [want, got] = [normalize(expected), normalize(predicted)]
    return want === got || (want.length >= 3 && got.includes(want))
  }
  return JSON.stringify(expected) === JSON.stringify(predicted)
}

const identities: Record<CandidateKind, string[]> = {
  entry: ['date', 'description', 'amountCents'],
  account: ['institution', 'nickname', 'lastFour'],
  category: ['name'],
  income: ['description', 'amountCents'],
  recurring_expense: ['description', 'amountCents'],
  debt: ['creditor', 'description', 'principalCents'],
  reserve: ['name'],
  goal: ['name'],
}

const agreement = (expected: Expected, predicted: Expected) => {
  const agreed = expected.kind === predicted.kind ? Object.keys(expected.payload).filter((key) => sameValue(expected.payload[key], predicted.payload[key])) : []
  return { agree: agreed.length, identified: agreed.some((key) => identities[expected.kind].includes(key)) }
}

export const match = (expected: Expected[], predicted: Expected[]) => {
  const pairs = expected
    .flatMap((want, wanted) => predicted.map((got, found) => ({ wanted, found, ...agreement(want, got), size: Object.keys(want.payload).length })))
    .filter(({ agree, identified, size }) => identified && agree * 2 >= size)
    .sort((a, b) => b.agree - a.agree || a.wanted - b.wanted || a.found - b.found)
  const [taken, used] = [new Set<number>(), new Set<number>()]
  return pairs.filter(({ wanted, found }) => {
    if (taken.has(wanted) || used.has(found)) return false
    taken.add(wanted)
    used.add(found)
    return true
  })
}

const add = (tallies: Record<string, Tally>, key: string, part: Partial<Tally>) => {
  const tally = tallies[key] ?? { expected: 0, predicted: 0, correct: 0 }
  tallies[key] = { expected: tally.expected + (part.expected ?? 0), predicted: tally.predicted + (part.predicted ?? 0), correct: tally.correct + (part.correct ?? 0) }
}

export const fieldTallies = (expected: Expected[], predicted: Expected[]) => {
  const pairs = match(expected, predicted)
  const tallies: Record<string, Tally> = {}
  for (const want of expected) for (const key of Object.keys(want.payload)) add(tallies, `${want.kind}.${key}`, { expected: 1 })
  for (const { wanted, found } of pairs) {
    const [want, got] = [expected[wanted], predicted[found]]
    if (!want || !got) continue
    for (const [key, value] of Object.entries(want.payload)) {
      if (got.payload[key] === undefined) continue
      add(tallies, `${want.kind}.${key}`, { predicted: 1, correct: sameValue(value, got.payload[key]) ? 1 : 0 })
    }
  }
  const matched = new Set(pairs.map(({ found }) => found))
  const judged = new Map<CandidateKind, Set<string>>()
  for (const want of expected) for (const key of Object.keys(want.payload)) judged.set(want.kind, (judged.get(want.kind) ?? new Set()).add(key))
  predicted.forEach((got, found) => {
    if (matched.has(found)) return
    for (const key of judged.get(got.kind) ?? []) if (got.payload[key] !== undefined) add(tallies, `${got.kind}.${key}`, { predicted: 1 })
  })
  return { tallies, matched: pairs.length }
}

const staged = (output: ImportOutput): Staged[] => output.candidates.map((item, index) => ({ id: BigInt(index), kind: item.kind, source: item.source, confidence: item.confidence, payload: item.payload, checks: [] }))

export const score = (expected: Expected[], output: ImportOutput, usage: Usage): Score => {
  const { tallies, matched } = fieldTallies(expected, output.candidates)
  const fields = Object.fromEntries(
    Object.entries(tallies)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, tally]) => [key, rates(tally)]),
  )
  const mismatched = reconcile(staged(output), output.totals).map((check) => check.detail ?? check.code)
  return { candidates: rates({ expected: expected.length, predicted: output.candidates.length, correct: matched }), fields, totals: { stated: output.totals.length, mismatched }, usage }
}
