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
  retryable: 0,
  progress: null,
  ...changes,
})

const seed = () => [
  batch('3', 'extrato-outubro.ofx', { status: 'draft', candidates: 0, flagged: 0, openQuestions: 0, progress: { state: 'extracting', done: 1, total: 4, error: null } }),
  batch('2', 'planilha-casa.xlsx', { failures: [{ source: 'Setembro!A1:G40', offset: 0, reason: 'model refused' }], retryable: 1 }),
  batch('1', 'notas.txt', { status: 'closed', closedAt: '2026-10-19T12:00:00.000Z', candidates: 0, flagged: 0, openQuestions: 0, committed: 6 }),
]

let batches = seed()
let uploads: { name: string | null; consent: string | null; type: string | null; size: number; member: string | null }[] = []
let closes: string[] = []
let retries: { id: string; member: string | null }[] = []
let failing: { status: number; error: string } | undefined
let runtime: { ready: boolean; cause: 'missing' | 'timeout' | 'failed' | null; warming: boolean } | undefined = { ready: true, cause: null, warming: false }

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  if (url.pathname === '/api/members')
    return Response.json([
      { id: '1', name: 'Marcio', sharePercent: 50 },
      { id: '2', name: 'Gabriela', sharePercent: 50 },
    ])
  if (url.pathname === '/api/decisions') return Response.json([])
  if (url.pathname === '/api/imports/runtime') return runtime ? Response.json(runtime) : Response.json({ error: 'internal error' }, { status: 500 })
  if (input.method === 'POST' && url.pathname === '/api/imports') {
    const bytes = await input.arrayBuffer()
    uploads.push({ name: input.headers.get('x-file-name'), consent: url.searchParams.get('consent'), type: input.headers.get('content-type'), size: bytes.byteLength, member: input.headers.get('x-member') })
    if (failing) return Response.json({ error: failing.error }, { status: failing.status })
    const created = batch('4', decodeURIComponent(input.headers.get('x-file-name') ?? ''), { status: 'draft', candidates: 0, flagged: 0, openQuestions: 0, inputTokens: 0, outputTokens: 0, costUsd: '0.0000', progress: { state: 'extracting', done: 0, total: 0, error: null } })
    batches = [created, ...batches]
    return Response.json(created, { status: 202 })
  }
  const [, again] = url.pathname.match(/^\/api\/imports\/(\d+)\/retry$/) ?? []
  if (input.method === 'POST' && again) {
    retries.push({ id: again, member: input.headers.get('x-member') })
    if (failing) return Response.json({ error: failing.error }, { status: failing.status })
    batches = batches.map((current) => (current.id === again ? { ...current, progress: { state: 'extracting' as const, done: 0, total: 1, error: null } } : current))
    return Response.json(
      batches.find((current) => current.id === again),
      { status: 202 },
    )
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
  retries = []
  failing = undefined
  runtime = { ready: true, cause: null, warming: false }
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

test('reads the failed chunks of a batch again from the history', async () => {
  start()
  const sheet = await item('planilha-casa.xlsx')
  expect(within(sheet).getByText('1 trecho pode ser lido de novo: falhou ou tem baixa confiança.')).toBeTruthy()
  expect(within(await item('notas.txt')).queryByRole('button', { name: /Ler de novo/ })).toBeNull()
  await userEvent.click(within(sheet).getByRole('button', { name: 'Ler de novo planilha-casa.xlsx' }))
  expect(await screen.findByText('Lendo de novo: planilha-casa.xlsx')).toBeTruthy()
  expect(retries).toEqual([{ id: '2', member: 'Marcio' }])
  const reading = await item('planilha-casa.xlsx')
  expect(within(reading).getByText('Extraindo')).toBeTruthy()
  expect(within(reading).queryByRole('button', { name: 'Ler de novo planilha-casa.xlsx' })).toBeNull()
})

test('explains a retry with nothing left to read', async () => {
  failing = { status: 422, error: 'nothing to retry in import batch 2' }
  start()
  const sheet = await item('planilha-casa.xlsx')
  await userEvent.click(within(sheet).getByRole('button', { name: 'Ler de novo planilha-casa.xlsx' }))
  expect(await screen.findByText('Não há trechos para ler de novo. A lista foi atualizada.')).toBeTruthy()
})

test('disables the upload and says why while the ingest runtime is not ready', async () => {
  runtime = { ready: false, cause: 'missing', warming: false }
  start()
  const form = await screen.findByRole('form', { name: 'Enviar arquivo' })
  const notice = await within(form).findByRole('status')
  expect(notice.textContent).toBe('Leitura indisponível. A leitura de arquivos não está instalada neste computador. Instale o uv; a API tenta de novo sozinha.')
  const button = within(form).getByRole('button', { name: 'Enviar para leitura' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  expect(button.getAttribute('aria-describedby')).toBe(notice.id)
  expect(notice.textContent).not.toMatch(/\/|uv --directory/)
})

test('disables Ler de novo with the runtime notice while the ingest runtime is not ready', async () => {
  runtime = { ready: false, cause: 'failed', warming: false }
  start()
  const form = await screen.findByRole('form', { name: 'Enviar arquivo' })
  const notice = await within(form).findByRole('status')
  const button = within(await item('planilha-casa.xlsx')).getByRole('button', { name: 'Ler de novo planilha-casa.xlsx' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  expect(button.getAttribute('aria-describedby')).toBe(notice.id)
  await userEvent.click(button)
  expect(retries).toEqual([])
})

test('says the reading is being prepared and opens the upload once the runtime is ready', async () => {
  runtime = { ready: false, cause: 'failed', warming: true }
  start()
  const form = await screen.findByRole('form', { name: 'Enviar arquivo' })
  expect((await within(form).findByRole('status')).textContent).toBe('Leitura indisponível. Preparando a leitura de arquivos. O envio volta assim que ela estiver pronta.')
  runtime = { ready: true, cause: null, warming: false }
  await waitFor(() => expect(within(form).queryByRole('status')).toBeNull(), { timeout: 8000 })
  await userEvent.upload(within(form).getByLabelText('Arquivo'), csv())
  await userEvent.click(within(form).getByRole('checkbox'))
  expect((within(form).getByRole('button', { name: 'Enviar para leitura' }) as HTMLButtonElement).disabled).toBe(false)
}, 10000)

test('keeps the upload open when the runtime check itself fails', async () => {
  runtime = undefined
  start()
  const form = await screen.findByRole('form', { name: 'Enviar arquivo' })
  await item('notas.txt')
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([request]) => new URL((request as Request).url).pathname === '/api/imports/runtime')).toBe(true))
  expect(within(form).queryByRole('status')).toBeNull()
  expect((within(form).getByRole('button', { name: 'Enviar para leitura' }) as HTMLButtonElement).disabled).toBe(false)
})

test('explains a 503 from the upload and shows the notice it refreshes', async () => {
  start()
  const form = await screen.findByRole('form', { name: 'Enviar arquivo' })
  await userEvent.upload(within(form).getByLabelText('Arquivo'), csv())
  await userEvent.click(within(form).getByRole('checkbox'))
  failing = { status: 503, error: 'the ingest runtime is not ready (failed)' }
  runtime = { ready: false, cause: 'failed', warming: false }
  await userEvent.click(within(form).getByRole('button', { name: 'Enviar para leitura' }))
  expect(await screen.findByText('A leitura de arquivos não está disponível agora. Veja o aviso acima.')).toBeTruthy()
  expect((await within(form).findByRole('status')).textContent).toContain('Veja o log da API; ela tenta de novo em instantes.')
  expect((within(form).getByRole('button', { name: 'Enviar para leitura' }) as HTMLButtonElement).disabled).toBe(true)
})
