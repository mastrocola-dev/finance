import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { casesFolder, liveExtractors, liveReport, parseArguments, preview, previewReport, report, runCases } from '../../src/eval/run.ts'
import type { Extractor, Segment } from '../../src/import/agent.ts'
import { ingestSegments } from '../../src/import/ingest.ts'
import { serviceAgentExtractor } from '../../src/import/service-agent.ts'
import { sample } from '../import/sample.ts'

const hasUv = (() => {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const text = (source: string, lines: number): Segment => ({ id: source, kind: 'text', source, shape: { lines } })
const notes = async () => [text('L1', 1), text('L3-L9', 7), text('L11', 1)]
const fakeCli = 'test/import/fake-agent.ts'

const copyOfNotes = async () => {
  const folder = await mkdtemp(join(tmpdir(), 'finance-eval-'))
  await cp(join(casesFolder, 'notes'), join(folder, 'notes'), { recursive: true })
  return folder
}

const failingOn = (source: string, extractor: Extractor): Extractor => ({
  extract: async (task) => {
    if (task.segment.source === source) throw new Error('model unavailable')
    return extractor.extract(task)
  },
})

describe('evaluations', () => {
  test('scores a case from its recordings and reports cost', async () => {
    const [result] = await runCases(casesFolder, ['notes'], notes)
    assert.ok(result)
    assert.equal(result.file, 'gastos-outubro.txt')
    assert.deepEqual(result.failures, [])
    assert.deepEqual(result.score.candidates, { expected: 7, predicted: 8, correct: 6, precision: 0.75, recall: 6 / 7 })
    assert.equal(result.score.usage.costUsdMicros, 44_700)
    const printed = report([result])
    assert.match(printed, /^notes \(gastos-outubro\.txt\): candidates P 75\.0% R 85\.7% \(6\/8 of 7\)/)
    assert.match(printed, /recurring_expense\.installmentsTotal +P 100\.0% R 0\.0% \(0\/0 of 1\)/)
  })

  test('reports a chunk without a recording as a failure', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'finance-eval-'))
    try {
      await cp(join(casesFolder, 'notes'), join(folder, 'notes'), { recursive: true })
      await writeFile(join(folder, 'notes', 'recorded.json'), '[]')
      const [result] = await runCases(folder, [], notes)
      assert.deepEqual(result?.failures, ['L1@0: no recording for L1@0', 'L3-L9@0: no recording for L3-L9@0', 'L11@0: no recording for L11@0'])
      assert.match(report(result ? [result] : []), /failed L1@0: no recording for L1@0/)
      await assert.rejects(runCases(folder, ['missing'], notes), /unknown eval case missing/)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test('runs every case through the real ingest without failures', { skip: !hasUv && 'uv is not installed' }, async () => {
    const results = await runCases()
    assert.deepEqual(
      results.map(({ name, failures }) => [name, failures]),
      [
        ['app-json', []],
        ['bank-csv', []],
        ['card-ofx', []],
        ['household-xlsx', []],
        ['loan-xml', []],
        ['notes', []],
        ['planning-xlsx', []],
        ['statement-pdf', []],
      ],
    )
    assert.deepEqual(
      results.map(({ score }) => [score.candidates.correct, score.candidates.predicted, score.candidates.expected]),
      [
        [12, 13, 12],
        [10, 10, 10],
        [8, 9, 8],
        [18, 19, 19],
        [4, 4, 4],
        [6, 8, 7],
        [9, 10, 10],
        [7, 7, 7],
      ],
    )
    const household = results.find(({ name }) => name === 'household-xlsx')
    assert.deepEqual(household?.score.totals, {
      stated: 4,
      mismatched: ['Set-26!A23:C23: net 2026-09 expected 747520, found 620040', 'Out-26!A26:C26: net 2026-10 expected 798960, found 810960'],
    })
    const planning = results.find(({ name }) => name === 'planning-xlsx')
    assert.deepEqual(planning?.score.totals, { stated: 2, mismatched: ['Nov-26!A12:C12: net 2026-11 expected 747000, found 768000'] })
    const statement = results.find(({ name }) => name === 'statement-pdf')
    assert.deepEqual(statement?.score.totals, { stated: 2, mismatched: ['p2:L8: expense 2026-10 expected 104580, found 105030'] })
    assert.deepEqual(statement?.score.fields['entry.amountCents'], { expected: 7, predicted: 7, correct: 6, precision: 6 / 7, recall: 6 / 7 })
    const loan = results.find(({ name }) => name === 'loan-xml')
    assert.deepEqual(loan?.score.fields['debt.principalCents'], { expected: 1, predicted: 1, correct: 0, precision: 0, recall: 0 })
  })

  test('cuts side-by-side blocks by columns and addresses PDF text by page', { skip: !hasUv && 'uv is not installed' }, async () => {
    const sources = async (name: string, file: string) => (await ingestSegments(join(casesFolder, name), file)).map(({ source }) => source)
    assert.deepEqual(await sources('planning-xlsx', 'planejamento-lado-a-lado.xlsx'), ['Nov-26!A1:A1', 'Nov-26!A3:C7', 'Nov-26!E3:G9', 'Nov-26!I3:K9', 'Nov-26!A12:C12'])
    assert.deepEqual(await sources('statement-pdf', 'extrato-gabriela.pdf'), ['p1:L1-L9', 'p2:L1-L9'])
  })

  test('parses the live and record flags', () => {
    assert.deepEqual(parseArguments(['notes']), { names: ['notes'], live: false, record: false })
    assert.deepEqual(parseArguments(['--live', '--record', 'notes', 'bank-csv']), { names: ['notes', 'bank-csv'], live: true, record: true })
    assert.throws(() => parseArguments(['--record']), /--record needs --live/)
    assert.throws(() => parseArguments(['--fast']), /Unknown option '--fast'/)
  })

  test('refuses a live run without the key or the service-agent CLI', () => {
    assert.throws(() => liveExtractors({ SERVICE_AGENT_CLI: fakeCli }), /--live needs ANTHROPIC_API_KEY/)
    assert.throws(() => liveExtractors({ ANTHROPIC_API_KEY: 'test', SERVICE_AGENT_CLI: 'missing/cli.ts' }), /service-agent CLI not found at missing\/cli\.ts/)
    assert.equal(typeof liveExtractors({ ANTHROPIC_API_KEY: 'test', SERVICE_AGENT_CLI: fakeCli }), 'function')
  })

  test('previews chunks and recorded cost before a live run', async () => {
    const cases = await preview(casesFolder, ['notes'], notes)
    assert.deepEqual(cases, [{ name: 'notes', chunks: 3, recordedUsdMicros: 44_700 }])
    assert.equal(previewReport(cases, 400_000), 'notes: 3 chunks, recorded US$ 0.0447\nlive run: 3 model calls, recorded US$ 0.0447, cap 400000 tokens per case')
  })

  test('runs live through service-agent without touching the recordings', async () => {
    const folder = await copyOfNotes()
    try {
      const before = await readFile(join(folder, 'notes', 'recorded.json'), 'utf8')
      const results = await runCases(folder, [], notes, { extractorFor: (path) => serviceAgentExtractor({ folder: path, cli: fakeCli }) })
      assert.deepEqual(results[0]?.failures, [])
      assert.equal(results[0]?.score.usage.costUsdMicros, 3 * 8100)
      assert.equal(liveReport(results), 'live cost US$ 0.0243, recorded US$ 0.0447')
      assert.equal(await readFile(join(folder, 'notes', 'recorded.json'), 'utf8'), before)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test('records live answers over the recordings and keeps old ones for failed chunks', async () => {
    const folder = await copyOfNotes()
    try {
      const path = join(folder, 'notes', 'recorded.json')
      const old = JSON.parse(await readFile(path, 'utf8'))
      const extractorFor = (case_: string) => failingOn('L11', serviceAgentExtractor({ folder: case_, cli: fakeCli }))
      const [live] = await runCases(folder, [], notes, { extractorFor, record: true, tokenCap: 100_000 })
      assert.deepEqual(live?.failures, ['L11@0: model unavailable'])
      const recorded = JSON.parse(await readFile(path, 'utf8'))
      assert.deepEqual(
        recorded.map(({ source, offset }: { source: string; offset: number }) => `${source}@${offset}`),
        ['L1@0', 'L3-L9@0', 'L11@0'],
      )
      assert.deepEqual(recorded[0], { source: 'L1', offset: 0, output: sample, usage: { inputTokens: 1200, outputTokens: 300, costUsdMicros: 8100 } })
      assert.deepEqual(recorded[2], old[2])
      const [replayed] = await runCases(folder, [], notes)
      assert.deepEqual(replayed?.failures, [])
      assert.equal(replayed?.score.usage.costUsdMicros, 2 * 8100 + old[2].usage.costUsdMicros)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test('reports a run stopped by the token cap', async () => {
    const folder = await copyOfNotes()
    try {
      const [result] = await runCases(folder, [], notes, { extractorFor: (path) => serviceAgentExtractor({ folder: path, cli: fakeCli }), tokenCap: 1000 })
      assert.deepEqual(result?.failures, ['stopped at 1/3 chunks: token cap'])
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})
