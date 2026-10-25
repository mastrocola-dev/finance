import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'
import type { Batch } from './model.ts'
import type { Candidate, Question } from './review-model.ts'

const batch = (changes: Partial<Batch> = {}): Batch => ({
  id: '7',
  fileName: 'planilha-casa.xlsx',
  format: 'xlsx',
  status: 'verified',
  createdAt: '2026-10-20T13:30:00.000Z',
  closedAt: null,
  inputTokens: 12000,
  outputTokens: 3000,
  costUsd: '0.0810',
  checks: [{ code: 'total_mismatch', detail: 'Outubro!G40: expense 2026-10 expected 158990, found 150000' }],
  failures: [],
  totals: [],
  candidates: 3,
  flagged: 1,
  openQuestions: 1,
  committed: 0,
  progress: null,
  ...changes,
})

const candidate = (id: string, payload: Record<string, unknown>, changes: Partial<Candidate> = {}): Candidate => ({ id, kind: 'entry', source: `Outubro!A${id}:G${id}`, chunk: 'Outubro@0', confidence: '0.95', status: 'pending', payload, checks: [], recordId: null, ...changes })

const seedCandidates = () => [
  candidate('1', { date: '2026-10-10', description: 'Aluguel', direction: 'expense', amountCents: 150000, category: 'Moradia', member: 'joint', paid: true }),
  candidate(
    '2',
    { date: '2026-10-15', description: 'Farmácia', direction: 'expense', amountCents: 8990, category: 'Saúde', member: 'GMA', paid: false },
    {
      confidence: '0.60',
      checks: [
        { code: 'low_confidence', detail: '0.60' },
        { code: 'unknown_member', detail: 'GMA' },
      ],
    },
  ),
  candidate('3', { date: '2026-10-20', description: 'Mercado', direction: 'expense', amountCents: 42000, category: 'Alimentação', paid: true }),
]

const seedQuestions = (): Question[] => [{ id: '9', candidateId: '2', question: 'GMA é a Gabriela?', options: ['Gabriela', 'Marcio'], source: 'Outubro!E4', chunk: 'Outubro@0', answer: null }]

let current = batch()
let candidates = seedCandidates()
let questions = seedQuestions()
let calls: { path: string; body: unknown; member: string | null }[] = []

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  if (url.pathname === '/api/members')
    return Response.json([
      { id: '1', name: 'Marcio', sharePercent: 50 },
      { id: '2', name: 'Gabriela', sharePercent: 50 },
    ])
  if (url.pathname === '/api/decisions') return Response.json([])
  if (url.pathname === '/api/categories') return Response.json([{ id: '1', name: 'Saúde', direction: 'expense' }])
  if (['/api/accounts', '/api/reserves', '/api/goals'].includes(url.pathname)) return Response.json([])
  if (input.method === 'PATCH') {
    const body = await input.json()
    calls.push({ path: url.pathname, body, member: input.headers.get('x-member') })
    if (body.payload.description === 'Recusar') return Response.json({ error: 'invalid entry payload: description: Too long' }, { status: 422 })
    const id = url.pathname.split('/').at(-1)
    candidates = candidates.map((item) => (item.id === id ? { ...item, payload: body.payload, status: 'edited', checks: [] } : item))
    return Response.json(candidates.find((item) => item.id === id))
  }
  if (input.method === 'POST') {
    const body = await input.json()
    calls.push({ path: url.pathname, body, member: input.headers.get('x-member') })
    if (url.pathname.endsWith('/answer')) {
      questions = questions.map((question) => ({ ...question, answer: body.answer }))
      candidates = candidates.map((item) => (item.id === '2' ? { ...item, payload: { ...item.payload, member: 'Gabriela' }, checks: [{ code: 'low_confidence', detail: '0.60' }] } : item))
      return Response.json(questions[0])
    }
    const status = url.pathname.endsWith('/accept') ? 'accepted' : 'rejected'
    candidates = candidates.map((item) => (body.ids.includes(item.id) ? { ...item, status } : item))
    return Response.json(candidates.filter((item) => body.ids.includes(item.id)))
  }
  if (url.pathname === '/api/imports/7') return Response.json(current)
  if (url.pathname === '/api/imports/7/candidates') return Response.json(candidates)
  if (url.pathname === '/api/imports/7/questions') return Response.json(questions)
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

beforeEach(() => localStorage.setItem('finance.member', 'Marcio'))

afterEach(() => {
  cleanup()
  localStorage.clear()
  current = batch()
  candidates = seedCandidates()
  questions = seedQuestions()
  calls = []
})

const start = () => render(<App history={createMemoryHistory({ initialEntries: ['/importar/7'] })} fetch={fetch} />)

const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement

test('review shows questions and file checks first, then candidates grouped by month with source and checks', async () => {
  start()
  const attention = await screen.findByRole('region', { name: 'Precisa de vocês' })
  expect(within(attention).getByText('Total de Outubro!G40 não confere: impresso R$ 1.589,90, lido R$ 1.500,00')).toBeTruthy()
  expect(within(attention).getByText('GMA é a Gabriela?')).toBeTruthy()
  expect(within(attention).getByText('Farmácia · Origem Outubro!E4')).toBeTruthy()
  const group = screen.getByRole('region', { name: 'Lançamentos · outubro de 2026' })
  const titles = within(group)
    .getAllByRole('listitem')
    .filter((item) => item.getAttribute('aria-labelledby'))
    .map((item) => item.querySelector('[id^="candidate-title"]')?.textContent)
  expect(titles).toEqual(['Farmácia', 'Aluguel', 'Mercado'])
  expect(within(row('Farmácia')).getByText('Pessoa desconhecida: GMA')).toBeTruthy()
  expect(within(row('Farmácia')).getByText('Outubro!A2:G2')).toBeTruthy()
  expect((within(row('Farmácia')).getByRole('button', { name: 'Aceitar Farmácia' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText('3 pendentes · 0 aceitos · 0 rejeitados · 1 com bloqueio · 1 pergunta aberta')).toBeTruthy()
  expect(document.title).toBe('Revisar planilha-casa.xlsx · Caixa')
})

test('answering a question resolves the blocked candidate', async () => {
  start()
  await userEvent.click(await screen.findByRole('button', { name: 'Gabriela' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Resposta registrada: Gabriela'))
  expect(calls).toEqual([{ path: '/api/imports/7/questions/9/answer', body: { answer: 'Gabriela' }, member: 'Marcio' }])
  await waitFor(() => expect(screen.queryByText('GMA é a Gabriela?')).toBeNull())
  expect((within(row('Farmácia')).getByRole('button', { name: 'Aceitar Farmácia' }) as HTMLButtonElement).disabled).toBe(false)
})

test('free text answers go through the form', async () => {
  start()
  await userEvent.type(await screen.findByLabelText('Outra resposta para GMA é a Gabriela?'), 'Conjunto{Enter}')
  await waitFor(() => expect(calls.at(0)?.body).toEqual({ answer: 'Conjunto' }))
})

test('accepts the ready items of a group at once, rejects and accepts one by one', async () => {
  start()
  await userEvent.click(await screen.findByRole('button', { name: 'Aceitar 2 prontos' }))
  await waitFor(() => expect(calls.at(-1)).toEqual({ path: '/api/imports/7/candidates/accept', body: { ids: ['1', '3'] }, member: 'Marcio' }))
  await waitFor(() => expect(within(row('Aluguel')).getByText('Aceito')).toBeTruthy())
  await userEvent.click(within(row('Farmácia')).getByRole('button', { name: 'Rejeitar Farmácia' }))
  await waitFor(() => expect(within(row('Farmácia')).getByText('Rejeitado')).toBeTruthy())
  expect(calls.at(-1)).toEqual({ path: '/api/imports/7/candidates/reject', body: { ids: ['2'] }, member: 'Marcio' })
  expect(screen.getByRole('status').textContent).toContain('Rejeitado: Farmácia')
  expect((within(row('Farmácia')).getByRole('button', { name: 'Aceitar Farmácia' }) as HTMLButtonElement).disabled).toBe(true)
  await userEvent.click(within(row('Mercado')).getByRole('button', { name: 'Rejeitar Mercado' }))
  await waitFor(() => expect(within(row('Mercado')).getByText('Rejeitado')).toBeTruthy())
  await userEvent.click(within(row('Mercado')).getByRole('button', { name: 'Aceitar Mercado' }))
  await waitFor(() => expect(within(row('Mercado')).getByText('Aceito')).toBeTruthy())
})

test('a batch that is not verified shows why there is nothing to review', async () => {
  current = batch({ status: 'committed', committed: 3 })
  start()
  expect(await screen.findByText('Esta importação já foi gravada no livro.')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Precisa de vocês' })).toBeNull()
  expect(calls).toEqual([])
})

test('an extracting batch says the review opens when reading ends', async () => {
  current = batch({ status: 'draft', progress: { state: 'extracting', done: 1, total: 3, error: null } })
  start()
  expect(await screen.findByText('O Claude está lendo o arquivo')).toBeTruthy()
  expect(screen.getByText(/Lendo trecho 2 de 3/)).toBeTruthy()
})

test('editing a candidate sends the whole payload and shows server refusals beside the field', async () => {
  start()
  await userEvent.click(await screen.findByRole('button', { name: 'Editar Farmácia' }))
  const form = screen.getByRole('form', { name: 'Editar Farmácia' })
  const member = within(form).getByLabelText('Quem (opcional)')
  expect((member as HTMLInputElement).value).toBe('GMA')
  await userEvent.clear(within(form).getByLabelText('Descrição'))
  await userEvent.type(within(form).getByLabelText('Descrição'), 'Recusar')
  await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
  expect(await within(form).findByText('Valor recusado: Too long')).toBeTruthy()
  expect(within(form).getByLabelText('Descrição').getAttribute('aria-invalid')).toBe('true')
  await userEvent.clear(within(form).getByLabelText('Descrição'))
  await userEvent.type(within(form).getByLabelText('Descrição'), 'Farmácia')
  await userEvent.clear(within(form).getByLabelText('Valor'))
  await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
  expect(within(form).getByText('Preencha este campo.')).toBeTruthy()
  await userEvent.type(within(form).getByLabelText('Valor'), '91,50')
  await userEvent.clear(member)
  await userEvent.type(member, 'Gabriela')
  await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Editado: Farmácia'))
  expect(calls.at(-1)).toEqual({ path: '/api/imports/7/candidates/2', body: { payload: { date: '2026-10-15', description: 'Farmácia', direction: 'expense', amountCents: 9150, category: 'Saúde', member: 'Gabriela', paid: false } }, member: 'Marcio' })
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Editar Farmácia' })).toBeNull())
  expect(within(row('Farmácia')).getByText('Editado')).toBeTruthy()
  expect(within(row('Farmácia')).getByText('R$ 91,50')).toBeTruthy()
})

test('cancel closes the edit form without saving', async () => {
  start()
  await userEvent.click(await screen.findByRole('button', { name: 'Editar Aluguel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('form', { name: 'Editar Aluguel' })).toBeNull()
  expect(calls).toEqual([])
})
