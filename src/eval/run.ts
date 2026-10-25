import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as z from 'zod'
import { extract, type Segment, usage } from '../import/agent.ts'
import { kinds } from '../import/candidate.ts'
import { ingestSegments } from '../import/ingest.ts'
import { recordedExtractor } from '../import/recorded.ts'
import { type Rates, rates, type Score, score } from './score.ts'

export const casesFolder = fileURLToPath(new URL('../../evals/cases', import.meta.url))

const expectedFile = z.strictObject({
  file: z.string(),
  candidates: z.array(z.strictObject({ kind: z.enum(kinds), payload: z.record(z.string(), z.unknown()) })),
})

const recordedFile = z.array(z.strictObject({ source: z.string(), offset: z.int().min(0).optional(), output: z.unknown(), usage }))

const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'))

export type Segments = (folder: string, file: string) => Promise<Segment[]>

export const runCase = async (folder: string, segments: Segments = ingestSegments) => {
  const expected = expectedFile.parse(await json(join(folder, 'expected.json')))
  const recordings = recordedFile.parse(await json(join(folder, 'recorded.json')))
  const found = await segments(folder, expected.file)
  const run = await extract({ file: expected.file, segments: found, extractor: recordedExtractor(recordings), tokenCap: Number.MAX_SAFE_INTEGER })
  return { file: expected.file, score: score(expected.candidates, run.output, run.usage), failures: run.failures.map(({ source, offset, reason }) => `${source}@${offset}: ${reason}`) }
}

export type CaseResult = Awaited<ReturnType<typeof runCase>> & { name: string }

export const runCases = async (folder = casesFolder, names: string[] = [], segments?: Segments): Promise<CaseResult[]> => {
  const found = (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const missing = names.filter((name) => !found.includes(name))
  if (missing.length) throw new Error(`unknown eval case ${missing.join(', ')}`)
  const chosen = names.length ? found.filter((name) => names.includes(name)) : found
  const results: CaseResult[] = []
  for (const name of chosen) results.push({ name, ...(await runCase(join(folder, name), segments)) })
  return results
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`
const rated = ({ precision, recall, correct, expected, predicted }: Rates) => `P ${percent(precision)} R ${percent(recall)} (${correct}/${predicted} of ${expected})`
const dollars = (micros: number) => `US$ ${(micros / 1_000_000).toFixed(4)}`

export const overall = (scores: Score[]) => {
  const sum = (pick: (score: Score) => Rates) => rates(scores.map(pick).reduce((total, item) => ({ expected: total.expected + item.expected, predicted: total.predicted + item.predicted, correct: total.correct + item.correct }), { expected: 0, predicted: 0, correct: 0 }))
  const keys = [...new Set(scores.flatMap((item) => Object.keys(item.fields)))].sort()
  const fields = Object.fromEntries(keys.map((key) => [key, sum((item) => item.fields[key] ?? rates({ expected: 0, predicted: 0, correct: 0 }))]))
  const costUsdMicros = scores.reduce((total, item) => total + item.usage.costUsdMicros, 0)
  return { candidates: sum((item) => item.candidates), fields, costUsdMicros }
}

export const report = (results: CaseResult[]) => {
  const total = overall(results.map((item) => item.score))
  return [
    ...results.flatMap(({ name, file, score: { candidates, totals, usage: spent }, failures }) => [
      `${name} (${file}): candidates ${rated(candidates)}, totals ${totals.stated - totals.mismatched.length}/${totals.stated} reconciled, ${spent.inputTokens} in, ${spent.outputTokens} out, ${dollars(spent.costUsdMicros)}`,
      ...totals.mismatched.map((detail) => `  mismatch ${detail}`),
      ...failures.map((failure) => `  failed ${failure}`),
    ]),
    `overall: candidates ${rated(total.candidates)}, ${dollars(total.costUsdMicros)}`,
    ...Object.entries(total.fields).map(([key, value]) => `  ${key.padEnd(36)} ${rated(value)}`),
  ].join('\n')
}

if (import.meta.main) {
  const names = process.argv.slice(2)
  if (names.some((name) => name.startsWith('-'))) {
    console.error('usage: npm run eval -- [case ...]')
    process.exit(1)
  }
  const results = await runCases(casesFolder, names)
  console.log(report(results))
  if (results.some((item) => item.failures.length)) process.exitCode = 1
}
