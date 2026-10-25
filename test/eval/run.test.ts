import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { casesFolder, report, runCases } from '../../src/eval/run.ts'
import type { Segment } from '../../src/import/agent.ts'

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
      ],
    )
    const household = results.find(({ name }) => name === 'household-xlsx')
    assert.deepEqual(household?.score.totals, {
      stated: 4,
      mismatched: ['Set-26!A23:C23: net 2026-09 expected 747520, found 620040', 'Out-26!A26:C26: net 2026-10 expected 798960, found 810960'],
    })
    const loan = results.find(({ name }) => name === 'loan-xml')
    assert.deepEqual(loan?.score.fields['debt.principalCents'], { expected: 1, predicted: 1, correct: 0, precision: 0, recall: 0 })
  })
})
