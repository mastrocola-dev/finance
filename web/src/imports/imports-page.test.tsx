import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'
import type { Batch } from './model.ts'

const batch = (id: string, fileName: string, changes: Partial<Batch> = {}): Batch => ({
  id,
  fileName,
  format: fileName.split('.').pop() ?? '',
  status: 'verified',
  createdAt: '2026-10-20T13:30:00.000Z',
  closedAt: null,
  inputTokens: 12000,
  outputTokens: 3000,
  costUsd: '0.0810',
  checks: [],
  failures: [],
  totals: [],
  candidates: 14,
  flagged: 2,
  openQuestions: 1,
  committed: 0,
  progress: null,
  ...changes,
})

const seed = () => [
  batch('3', 'extrato-outubro.ofx', { status: 'draft', candidates: 0, flagged: 0, openQuestions: 0, progress: { state: 'extracting', done: 1, total: 4, error: null } }),
  batch('2', 'planilha-casa.xlsx', { failures: [{ source: 'Setembro!A1:G40', offset: 0, reason: 'model refused' }] }),
  batch('1', 'notas.txt', { status: 'closed', closedAt: '2026-10-19T12:00:00.000Z', candidates: 0, flagged: 0, openQuestions: 0, committed: 6 }),
]

let batches = seed()
let uploads: { name: string | null; consent: string | null; type: string | null; size: number; member: string | null }[] = []
let closes: string[] = []
let failing: { status: number; error: string } | undefined

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  if (url.pathname === '/api/members')
    return Response.json([
      { id: '1', name: 'Marcio', sharePercent: 50 },
      { id: '2', name: 'Gabriela', sharePercent: 50 },
    ])
  if (url.pathname === '/api/decisions') return Response.json([])
  if (input.method === 'POST' && url.pathname === '/api/imports') {
    const bytes = await input.arrayBuffer()
    uploads.push({ name: input.headers.get('x-file-name'), consent: url.searchParams.get('consent'), type: input.headers.get('content-type'), size: bytes.byteLength, member: input.headers.get('x-member') })
    if (failing) return Response.json({ error: failing.error }, { status: failing.status })
    const created = batch('4', decodeURIComponent(input.headers.get('x-file-name') ?? ''), { status: 'draft', candidates: 0, flagged: 0, openQuestions: 0, inputTokens: 0, outputTokens: 0, costUsd: '0.0000', progress: { state: 'extracting', done: 0, total: 0, error: null } })
    batches = [created, ...batches]
    return Response.json(created, { status: 202 })
  }
  const [, id] = url.pathname.match(/^\/api\/imports\/(\d+)\/close$/) ?? []
  if (input.method === 'POST' && id) {
    closes.push(id)
    batches = batches.map((current) => (current.id === id ? { ...current, status: 'closed' as const, closedAt: '2026-10-21T12:00:00.000Z' } : current))
    return Response.json(batches.find((current) => current.id === id))
  }
  if (url.pathname === '/api/imports') return Response.json(batches)
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

beforeEach(() => localStorage.setItem('finance.member', 'Marcio'))

afterEach(() => {
  cleanup()
  localStorage.clear()
  batches = seed()
  uploads = []
  closes = []
  failing = undefined
})

const start = () => render(<App history={createMemoryHistory({ initialEntries: ['/importar'] })} fetch={fetch} />)

const history = () => screen.findByRole('region', { name: 'Histórico' })

const item = async (name: string) => (await within(await history()).findByText(name)).closest('li') as HTMLElement

const csv = (name = 'banco.csv', content = 'data,descricao,valor\n2026-10-03,Padaria,12.50\n') => new File([content], name, { type: 'text/csv' })

test('lists batches with status, counts, cost and failures', async () => {
  start()
  await screen.findByRole('heading', { level: 1, name: 'Importar' })
  const sheet = await item('planilha-casa.xlsx')
  expect(within(sheet).getByText('Para revisar')).toBeTruthy()
  expect(within(sheet).getByText('14 itens · 1 pergunta · 2 com alerta')).toBeTruthy()
  expect(within(sheet).getByText('15.000 tokens')).toBeTruthy()
  expect(within(sheet).getByText('US$ 0,0810')).toBeTruthy()
  expect(within(sheet).getByText('XLSX · 20/10, 10:30')).toBeTruthy()
  expect(within(sheet).getByText('1 trecho não lido')).toBeTruthy()
  expect(within(sheet).getByText('Setembro!A1:G40')).toBeTruthy()
  const statement = await item('extrato-outubro.ofx')
  expect(within(statement).getByText('Extraindo')).toBeTruthy()
  expect(within(statement).getByRole('progressbar', { name: 'Leitura de extrato-outubro.ofx' }).getAttribute('aria-valuetext')).toBe('Lendo trecho 2 de 4')
  expect(within(statement).queryByRole('button')).toBeNull()
  const notes = await item('notas.txt')
  expect(within(notes).getByText('Encerrado')).toBeTruthy()
  expect(within(notes).getByText('6 itens gravados')).toBeTruthy()
  expect(within(notes).queryByRole('button')).toBeNull()
})

test('polls while a batch is extracting and stops when it is done', async () => {
  start()
  await item('extrato-outubro.ofx')
  const reads = () => vi.mocked(fetch).mock.calls.filter(([request]) => new URL((request as Request).url).pathname === '/api/imports').length
  const before = reads()
  batches = batches.map((current) => (current.id === '3' ? { ...current, status: 'verified' as const, candidates: 9, progress: { state: 'done' as const, done: 4, total: 4, error: null } } : current))
  await waitFor(() => expect(reads()).toBeGreaterThan(before), { timeout: 3000 })
  const statement = await item('extrato-outubro.ofx')
  await waitFor(() => expect(within(statement).getByText('Para revisar')).toBeTruthy())
  const settled = reads()
  await new Promise((done) => setTimeout(done, 1500))
  expect(reads()).toBe(settled)
})

test('uploads a file only with consent and shows it in the history', async () => {
  start()
  const form = await screen.findByRole('form', { name: 'Enviar arquivo' })
  await userEvent.click(within(form).getByRole('button', { name: 'Enviar para leitura' }))
  expect(within(form).getByRole('alert').textContent).toBe('Escolha um arquivo.')
  await userEvent.upload(within(form).getByLabelText('Arquivo'), csv('extrato março.csv'))
  await userEvent.click(within(form).getByRole('button', { name: 'Enviar para leitura' }))
  expect(within(form).getByRole('alert').textContent).toBe('Marque a autorização para enviar o arquivo.')
  expect(uploads).toEqual([])
  await userEvent.click(within(form).getByRole('checkbox'))
  await userEvent.click(within(form).getByRole('button', { name: 'Enviar para leitura' }))
  expect(await screen.findByText('Arquivo enviado: extrato março.csv. O Claude está lendo.')).toBeTruthy()
  expect(uploads).toEqual([{ name: 'extrato%20mar%C3%A7o.csv', consent: 'true', type: 'application/octet-stream', size: 46, member: 'Marcio' }])
  const created = await item('extrato março.csv')
  expect(within(created).getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Preparando o arquivo')
  expect((within(form).getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
})

test('refuses an unsupported file before sending it', async () => {
  start()
  const form = await screen.findByRole('form', { name: 'Enviar arquivo' })
  await userEvent.upload(within(form).getByLabelText('Arquivo'), new File(['x'], 'foto.png', { type: 'image/png' }), { applyAccept: false })
  await userEvent.click(within(form).getByRole('checkbox'))
  await userEvent.click(within(form).getByRole('button', { name: 'Enviar para leitura' }))
  expect(within(form).getByRole('alert').textContent).toBe('Formato não aceito. Use xlsx, csv, json, xml, txt, ofx, pdf.')
  expect(uploads).toEqual([])
})

test('explains a file that was already sent', async () => {
  failing = { status: 422, error: 'this file is already in import batch 2' }
  start()
  const form = await screen.findByRole('form', { name: 'Enviar arquivo' })
  await userEvent.upload(within(form).getByLabelText('Arquivo'), csv())
  await userEvent.click(within(form).getByRole('checkbox'))
  await userEvent.click(within(form).getByRole('button', { name: 'Enviar para leitura' }))
  expect(await screen.findByText('Este arquivo já foi enviado. Veja o histórico.')).toBeTruthy()
  expect((within(form).getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
})

test('discards a batch after a confirmation', async () => {
  start()
  const sheet = await item('planilha-casa.xlsx')
  await userEvent.click(within(sheet).getByRole('button', { name: 'Descartar planilha-casa.xlsx' }))
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }))
  expect(closes).toEqual([])
  await userEvent.click(within(sheet).getByRole('button', { name: 'Descartar planilha-casa.xlsx' }))
  await userEvent.click(within(sheet).getByRole('button', { name: 'Confirmar descarte de planilha-casa.xlsx' }))
  expect(await screen.findByText('Importação descartada: planilha-casa.xlsx')).toBeTruthy()
  expect(closes).toEqual(['2'])
  const discarded = await item('planilha-casa.xlsx')
  await waitFor(() => expect(within(discarded).getByText('Descartado')).toBeTruthy())
  expect(within(discarded).getByText('Nada foi gravado')).toBeTruthy()
})

test('asks who you are before uploading', async () => {
  localStorage.clear()
  start()
  const form = await screen.findByRole('form', { name: 'Enviar arquivo' })
  expect((within(form).getByRole('button', { name: 'Enviar para leitura' }) as HTMLButtonElement).disabled).toBe(true)
  expect(within(form).getByText('Escolha quem você é para importar.')).toBeTruthy()
})

test('shows an empty history', async () => {
  batches = []
  start()
  expect(await screen.findByText('Nenhuma importação ainda')).toBeTruthy()
})
