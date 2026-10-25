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
  retryable: 0,
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
let refusal: string | undefined

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
  if (input.method === 'POST' && url.pathname.endsWith('/retry')) {
    calls.push({ path: url.pathname, body: null, member: input.headers.get('x-member') })
    if (refusal) return Response.json({ error: refusal }, { status: 422 })
    current = { ...current, progress: { state: 'extracting', done: 0, total: 1, error: null } }
    return Response.json(current, { status: 202 })
  }
  if (input.method === 'POST' && /\/(commit|close)$/.test(url.pathname)) {
    calls.push({ path: url.pathname, body: null, member: input.headers.get('x-member') })
    if (refusal) return Response.json({ error: refusal }, { status: 422 })
    const committed = candidates.filter((item) => item.status === 'accepted' || item.status === 'edited').length
    current = url.pathname.endsWith('/commit') ? { ...current, status: 'committed', committed } : { ...current, status: 'closed', closedAt: '2026-10-20T14:00:00.000Z' }
    return Response.json(current)
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
  refusal = undefined
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
  current = batch({ status: 'closed', committed: 3, closedAt: '2026-10-20T14:00:00.000Z' })
  start()
  expect(await screen.findByText('Esta importação foi encerrada.')).toBeTruthy()
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

test('reads low-confidence chunks again, waits for the extraction and shows the new candidates', async () => {
  current = batch({ retryable: 1 })
  start()
  const retry = await screen.findByRole('region', { name: 'Ler de novo' })
  expect(within(retry).getByText('1 trecho pode ser lido de novo: falhou ou tem baixa confiança.')).toBeTruthy()
  await screen.findByText('Farmácia')
  await userEvent.click(within(retry).getByRole('button', { name: 'Ler de novo' }))
  expect(await screen.findByText('Lendo de novo: planilha-casa.xlsx')).toBeTruthy()
  expect(await screen.findByText('O Claude está lendo o arquivo')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Ler de novo' })).toBeNull()
  expect(calls).toEqual([{ path: '/api/imports/7/retry', body: null, member: 'Marcio' }])
  candidates = [candidate('4', { date: '2026-10-15', description: 'Drogaria', direction: 'expense', amountCents: 8990, category: 'Saúde', member: 'Gabriela', paid: false })]
  questions = []
  current = batch({ retryable: 0, progress: { state: 'done', done: 1, total: 1, error: null } })
  expect(await screen.findByText('Drogaria', {}, { timeout: 3000 })).toBeTruthy()
  expect(screen.queryByText('Farmácia')).toBeNull()
  expect(screen.queryByRole('region', { name: 'Ler de novo' })).toBeNull()
})

test('explains a retry the API refuses', async () => {
  current = batch({ retryable: 2 })
  refusal = 'the file of import batch 7 is no longer kept; close the batch and upload the file again'
  start()
  const retry = await screen.findByRole('region', { name: 'Ler de novo' })
  expect(within(retry).getByText('2 trechos podem ser lidos de novo: falharam ou têm baixa confiança.')).toBeTruthy()
  await userEvent.click(within(retry).getByRole('button', { name: 'Ler de novo' }))
  expect(await screen.findByText('O arquivo não está mais guardado. Descarte a importação e envie o arquivo de novo.')).toBeTruthy()
  expect(screen.getByText('Farmácia')).toBeTruthy()
})

test('commit explains the blocking checks of accepted items and stays disabled', async () => {
  candidates = candidates.map((item) => ({ ...item, status: item.id === '3' ? 'rejected' : 'accepted' }))
  start()
  const commit = await screen.findByRole('region', { name: 'Gravar no livro' })
  expect(within(commit).getByText('1 item aceito vai para o livro. 1 item pendente ou rejeitado fica de fora. 1 pergunta segue aberta.')).toBeTruthy()
  expect(within(commit).getByText('Um item aceito tem bloqueio. Edite, responda ou rejeite antes de gravar:')).toBeTruthy()
  expect(within(within(commit).getByRole('list', { name: 'Bloqueios' })).getByRole('listitem').textContent).toBe('Farmácia · Pessoa desconhecida: GMA')
  expect((within(commit).getByRole('button', { name: 'Gravar 1 item' }) as HTMLButtonElement).disabled).toBe(true)
})

test('commits the accepted items after confirmation, then closes the batch', async () => {
  start()
  await userEvent.click(await screen.findByRole('button', { name: 'Aceitar 2 prontos' }))
  const commit = screen.getByRole('region', { name: 'Gravar no livro' })
  await waitFor(() => expect(within(commit).getByText('2 itens aceitos vão para o livro. 1 item pendente ou rejeitado fica de fora. 1 pergunta segue aberta.')).toBeTruthy())
  await userEvent.click(within(commit).getByRole('button', { name: 'Gravar 2 itens' }))
  await userEvent.click(within(commit).getByRole('button', { name: 'Confirmar gravação' }))
  expect(await screen.findByText('Gravado no livro: 2 itens')).toBeTruthy()
  const done = await screen.findByRole('region', { name: 'Gravada no livro' })
  expect(within(done).getByText(/^2 itens gravados\./)).toBeTruthy()
  expect(within(done).getByRole('link', { name: 'Ver lançamentos' }).getAttribute('href')).toContain('/lancamentos')
  expect(screen.queryByRole('region', { name: 'Gravar no livro' })).toBeNull()
  await userEvent.click(within(done).getByRole('button', { name: 'Encerrar' }))
  await userEvent.click(within(done).getByRole('button', { name: 'Confirmar encerramento' }))
  expect(await screen.findByText('Esta importação foi encerrada.')).toBeTruthy()
  expect(calls.slice(-2)).toEqual([
    { path: '/api/imports/7/commit', body: null, member: 'Marcio' },
    { path: '/api/imports/7/close', body: null, member: 'Marcio' },
  ])
})

test('commit lists accepted items naming what only a pending item creates', async () => {
  candidates = [
    candidate('1', { date: '2026-10-10', description: 'Aluguel', direction: 'expense', amountCents: 150000, category: 'Moradia', account: 'Conta nova', member: 'joint', paid: true }, { status: 'accepted' }),
    candidate('4', { nickname: 'Conta nova', institution: 'Banco Exemplo', kind: 'checking', member: 'joint' }, { kind: 'account', source: 'Outubro!A4:G4' }),
  ]
  start()
  const commit = await screen.findByRole('region', { name: 'Gravar no livro' })
  await waitFor(() => expect(within(commit).getByText('Um item aceito usa um nome que só existe num item não aceito. Aceite esse item ou edite o que usa o nome:')).toBeTruthy())
  expect(within(within(commit).getByRole('list', { name: 'Nomes não aceitos' })).getByRole('listitem').textContent).toBe('Aluguel · Conta Conta nova está num item pendente')
  expect((within(commit).getByRole('button', { name: 'Gravar 1 item' }) as HTMLButtonElement).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Aceitar Conta nova' }))
  await waitFor(() => expect(within(commit).queryByRole('list', { name: 'Nomes não aceitos' })).toBeNull())
  expect((within(commit).getByRole('button', { name: 'Gravar 2 itens' }) as HTMLButtonElement).disabled).toBe(false)
})

test('explains a commit the API refuses', async () => {
  candidates = candidates.map((item) => ({ ...item, status: item.id === '1' ? 'accepted' : item.status }))
  refusal = 'unknown account Conta antiga'
  start()
  const commit = await screen.findByRole('region', { name: 'Gravar no livro' })
  await userEvent.click(within(commit).getByRole('button', { name: 'Gravar 1 item' }))
  await userEvent.click(within(commit).getByRole('button', { name: 'Confirmar gravação' }))
  expect(await screen.findByText('Conta antiga não existe no livro nem entre os itens aceitos. Aceite o item que cria esse nome ou edite os itens que o usam.')).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Gravar no livro' })).toBeTruthy()
})
