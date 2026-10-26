import { execFileSync } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import * as z from 'zod'
import { defaultTokenCap, type Extractor, extract, plan, type Segment, usage } from '../import/agent.ts'
import { kinds } from '../import/candidate.ts'
import { ingestSegments } from '../import/ingest.ts'
import { type Recording, recordedExtractor } from '../import/recorded.ts'
import { serviceAgentExtractor } from '../import/service-agent.ts'
import { chunkKey } from '../import/staging.ts'
import { type Rates, rates, type Score, score } from './score.ts'

export const casesFolder = fileURLToPath(new URL('../../evals/cases', import.meta.url))
const biome = fileURLToPath(new URL('../../node_modules/.bin/biome', import.meta.url))

const expectedFile = z.strictObject({
  file: z.string(),
  candidates: z.array(z.strictObject({ kind: z.enum(kinds), payload: z.record(z.string(), z.unknown()) })),
})

const recordedFile = z.array(z.strictObject({ source: z.string(), offset: z.int().min(0).optional(), output: z.unknown(), usage }))

const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'))

export type Segments = (folder: string, file: string) => Promise<Segment[]>
export type Live = { extractorFor: (folder: string) => Extractor; record?: boolean; tokenCap?: number }

const recording = (extractor: Extractor, answers: Recording[]): Extractor => ({
  extract: async (task) => {
    const answer = await extractor.extract(task)
    answers.push({ source: task.segment.source, offset: task.offset, output: answer.output, usage: answer.usage })
    return answer
  },
})

const keyOf = ({ source, offset }: Recording) => chunkKey(source, offset)

const record = async (path: string, keys: string[], kept: Recording[], fresh: Recording[]) => {
  const answers = new Map([...kept, ...fresh].map((item) => [keyOf(item), item]))
  const merged = keys.flatMap((key) => answers.get(key) ?? [])
  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`)
  try {
    execFileSync(biome, ['format', '--write', path], { stdio: 'ignore' })
  } catch {
    console.warn(`could not format ${path}, run biome format --write`)
  }
}

const loadCase = async (folder: string, segments: Segments) => {
  const expected = expectedFile.parse(await json(join(folder, 'expected.json')))
  const recordings: Recording[] = recordedFile.parse(await json(join(folder, 'recorded.json')))
  const found = await segments(folder, expected.file)
  return { expected, recordings, found, keys: plan(expected.file, found).map((chunk) => chunkKey(chunk.segment.source, chunk.offset)) }
}

const recordedCost = (recordings: Recording[], keys: string[]) => recordings.filter((item) => keys.includes(keyOf(item))).reduce((total, item) => total + item.usage.costUsdMicros, 0)

export const runCase = async (folder: string, segments: Segments = ingestSegments, live?: Live) => {
  const { expected, recordings, found, keys } = await loadCase(folder, segments)
  const fresh: Recording[] = []
  const extractor = live ? recording(live.extractorFor(folder), fresh) : recordedExtractor(recordings)
  const run = await extract({ file: expected.file, segments: found, extractor, tokenCap: live ? (live.tokenCap ?? defaultTokenCap()) : Number.MAX_SAFE_INTEGER })
  if (live?.record) await record(join(folder, 'recorded.json'), keys, recordings, fresh)
  return {
    file: expected.file,
    score: score(expected.candidates, run.output, run.usage),
    recordedUsdMicros: recordedCost(recordings, keys),
    failures: [...run.failures.map(({ source, offset, reason }) => `${source}@${offset}: ${reason}`), ...(run.stopped ? [`stopped at ${run.done}/${run.total} chunks: ${run.stopped}`] : [])],
  }
}

export type CaseResult = Awaited<ReturnType<typeof runCase>> & { name: string }

const caseNames = async (folder: string, names: string[]) => {
  const found = (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const missing = names.filter((name) => !found.includes(name))
  if (missing.length) throw new Error(`unknown eval case ${missing.join(', ')}`)
  return names.length ? found.filter((name) => names.includes(name)) : found
}

export const runCases = async (folder = casesFolder, names: string[] = [], segments?: Segments, live?: Live): Promise<CaseResult[]> => {
  const results: CaseResult[] = []
  for (const name of await caseNames(folder, names)) results.push({ name, ...(await runCase(join(folder, name), segments, live)) })
  return results
}

export const preview = async (folder = casesFolder, names: string[] = [], segments: Segments = ingestSegments) => {
  const cases = []
  for (const name of await caseNames(folder, names)) {
    const { keys, recordings } = await loadCase(join(folder, name), segments)
    cases.push({ name, chunks: keys.length, recordedUsdMicros: recordedCost(recordings, keys) })
  }
  return cases
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

export const previewReport = (cases: Awaited<ReturnType<typeof preview>>, tokenCap: number) =>
  [
    ...cases.map(({ name, chunks, recordedUsdMicros }) => `${name}: ${chunks} chunks, recorded ${dollars(recordedUsdMicros)}`),
    `live run: ${cases.reduce((total, item) => total + item.chunks, 0)} model calls, recorded ${dollars(cases.reduce((total, item) => total + item.recordedUsdMicros, 0))}, cap ${tokenCap} tokens per case`,
  ].join('\n')

export const liveReport = (results: CaseResult[]) => `live cost ${dollars(results.reduce((total, item) => total + item.score.usage.costUsdMicros, 0))}, recorded ${dollars(results.reduce((total, item) => total + item.recordedUsdMicros, 0))}`

export const parseArguments = (args: string[]) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { live: { type: 'boolean', default: false }, record: { type: 'boolean', default: false } } })
  if (values.record && !values.live) throw new Error('--record needs --live')
  return { names: positionals, live: values.live, record: values.record }
}

export const liveExtractors = (environment = process.env) => {
  if (!environment.ANTHROPIC_API_KEY) throw new Error('--live needs ANTHROPIC_API_KEY in .env')
  const cli = environment.SERVICE_AGENT_CLI
  serviceAgentExtractor({ folder: casesFolder, cli })
  return (folder: string) => serviceAgentExtractor({ folder, cli })
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

const help = 'usage: npm run eval -- [--live [--record]] [case ...]'

const main = async () => {
  const { names, live, record: recordAnswers } = parseArguments(process.argv.slice(2))
  if (!live) return runCases(casesFolder, names)
  const extractorFor = liveExtractors()
  const tokenCap = defaultTokenCap()
  console.log(previewReport(await preview(casesFolder, names), tokenCap))
  const results = await runCases(casesFolder, names, undefined, { extractorFor, record: recordAnswers, tokenCap })
  console.log(liveReport(results))
  return results
}

if (import.meta.main) {
  try {
    const results = await main()
    console.log(report(results))
    if (results.some((item) => item.failures.length)) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error(help)
    process.exitCode = 1
  }
}
