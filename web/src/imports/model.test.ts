import { expect, test } from 'vitest'
import { ApiFailure } from '../query/client.ts'
import { type Batch, closeAction, fileIssue, formatUsd, phaseOf, uploadFailure } from './model.ts'

const batch = (changes: Partial<Batch>) => ({ status: 'draft', committed: 0, progress: null, ...changes }) as Batch

test('phase follows progress first, then status and outcome', () => {
  expect(phaseOf(batch({ status: 'verified', progress: { state: 'extracting', done: 0, total: 2, error: null } }))).toBe('extracting')
  expect(phaseOf(batch({ progress: { state: 'failed', done: 1, total: 2, error: 'budget' } }))).toBe('failed')
  expect(phaseOf(batch({ status: 'closed' }))).toBe('abandoned')
  expect(phaseOf(batch({ status: 'closed', committed: 3 }))).toBe('closed')
  expect(phaseOf(batch({ status: 'committed', committed: 3 }))).toBe('committed')
})

test('close is offered as close for committed batches and discard for open ones', () => {
  expect(closeAction(batch({ status: 'committed' }))?.label).toBe('Encerrar')
  expect(closeAction(batch({ status: 'verified' }))?.label).toBe('Descartar')
  expect(closeAction(batch({ status: 'closed' }))).toBeUndefined()
  expect(closeAction(batch({ progress: { state: 'extracting', done: 0, total: 0, error: null } }))).toBeUndefined()
})

test('files are checked for format, emptiness and size', () => {
  expect(fileIssue(new File(['a'], 'Extrato.OFX'))).toBeUndefined()
  expect(fileIssue(new File(['a'], 'sem-extensao'))).toMatch(/^Formato não aceito/)
  expect(fileIssue(new File([], 'vazio.csv'))).toBe('O arquivo está vazio.')
  expect(fileIssue(new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'grande.pdf'))).toBe('O arquivo passa de 20 MB.')
})

test('cost and refusals read in Portuguese', () => {
  expect(formatUsd('1.2345')).toBe('US$ 1,2345')
  expect(uploadFailure(new ApiFailure(413, 'Payload Too Large'))).toBe('O arquivo passa de 20 MB.')
  expect(uploadFailure(new ApiFailure(422, 'service-agent CLI not found at x, set SERVICE_AGENT_CLI'))).toBe('A leitura pelo Claude não está disponível neste ambiente.')
  expect(uploadFailure(new Error('network'))).toBe('Não foi possível enviar o arquivo. Tente de novo.')
})
