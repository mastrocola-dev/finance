import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'

const money = (cents: number, brl: string) => ({ cents: String(cents), brl })

const entry = (id: string, description: string, direction: 'income' | 'expense', category: string, cents: number, state: 'paid' | 'pending' | 'late', dueOn: string) => ({
  id,
  competence: `${dueOn.slice(0, 7)}-01`,
  dueOn,
  description,
  direction,
  amount: money(cents, ''),
  category,
  account: null,
  member: 'Marcio',
  status: state === 'paid' ? 'paid' : 'planned',
  state,
  paidOn: null,
  installmentNumber: null,
  installmentsTotal: null,
  origin: 'manual',
})

const months: Record<string, unknown[]> = {
  '2026-10': [entry('1', 'Salário Marcio', 'income', 'Salário', 1_200_000, 'paid', '2026-10-05'), entry('2', 'Aluguel', 'expense', 'Moradia', 300_000, 'paid', '2026-10-05'), entry('3', 'Plano de saúde', 'expense', 'Saúde', 75_000, 'late', '2026-10-15')],
  '2026-09': [entry('4', 'Aluguel', 'expense', 'Moradia', 300_000, 'paid', '2026-09-05')],
}

const responses: Record<string, unknown> = {
  '/api/members': [
    { id: '1', name: 'Marcio', sharePercent: 50 },
    { id: '2', name: 'Gabriela', sharePercent: 50 },
  ],
  '/api/decisions': [{ id: '7', title: 'Trocar plano de internet', description: '', amount: money(4000, 'R$ 40,00'), status: 'proposed', proposedBy: 'Gabriela', origin: 'claude', confirmedBy: ['Gabriela'], awaiting: ['Marcio'], createdAt: '2026-10-19T12:00:00.000Z', closedAt: null }],
  '/api/months/2026-10/split': { month: '2026-10-01', total: money(42860, ''), members: [], transfers: [{ from: 'Marcio', to: 'Gabriela', amount: money(21430, 'R$ 214,30') }] },
  '/api/months/2026-10/variables': {
    month: '2026-10-01',
    estimate: money(160_000, ''),
    spent: money(155_000, ''),
    unspent: money(15_000, ''),
    items: [
      { id: '1', description: 'Supermercado', category: 'Alimentação', member: null, estimate: money(120_000, ''), spent: money(105_000, '') },
      { id: '2', description: 'Combustível', category: 'Transporte', member: 'Marcio', estimate: money(40_000, ''), spent: money(50_000, '') },
    ],
  },
  '/api/audit': {
    items: [{ id: '3', at: '2026-10-20T12:14:00.000Z', author: 'claude', member: 'Marcio', entity: 'entry', entityId: '9', action: 'update', subject: 'Energia', before: { description: 'Energia', status: 'planned' }, after: { description: 'Energia', status: 'paid' } }],
    counts: { member: 0, claude: 1, import: 0, system: 0 },
    memberCounts: [],
    next: null,
  },
}

const calls: URL[] = []

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  calls.push(url)
  const month = url.pathname.match(/^\/api\/months\/(\d{4}-\d{2})\/entries$/)?.[1]
  if (month) return Response.json(months[month] ?? [])
  const empty = url.pathname.match(/^\/api\/months\/(\d{4}-\d{2})\/variables$/) && { month: '', estimate: money(0, ''), spent: money(0, ''), unspent: money(0, ''), items: [] }
  const body = responses[url.pathname] ?? empty
  return body ? Response.json(body) : Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

beforeEach(() => localStorage.setItem('finance.member', 'Marcio'))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  calls.length = 0
})

const start = (url: string) => render(<App history={createMemoryHistory({ initialEntries: [url] })} fetch={fetch} />)

test('shows the month KPIs, open bills, categories, settlement, decisions and activity', async () => {
  start('/?month=2026-10')
  const kpis = await screen.findByRole('region', { name: 'Indicadores' })
  expect(within(kpis).getByText('R$ 8.100,00')).toBeTruthy()
  expect(within(kpis).getByText('Inclui R$ 150,00 ainda previstos em variáveis')).toBeTruthy()
  expect(within(kpis).getByText('R$ 750,00 em atraso')).toBeTruthy()
  const due = screen.getByRole('region', { name: 'Para pagar' })
  expect(within(due).getByText('Plano de saúde')).toBeTruthy()
  expect(within(due).getByText('Atrasada')).toBeTruthy()
  expect(within(due).getByText('1 de 2 pagas')).toBeTruthy()
  const flow = await screen.findByRole('region', { name: 'Receitas × despesas' })
  expect(within(flow).getByRole('img').getAttribute('aria-label')).toBe('Receitas entre R$ 0,0 mil e R$ 12,0 mil; despesas entre R$ 0,0 mil e R$ 3,8 mil')
  expect(within(flow).getByText('+8,3k')).toBeTruthy()
  expect(within(flow).getByText('−3,0k')).toBeTruthy()
  expect(within(flow).getByText('out').className).toContain('font-semibold')
  const flowMonths = calls.filter(({ pathname }) => pathname.endsWith('/entries')).map(({ pathname }) => pathname.slice(12, 19))
  expect([...new Set(flowMonths)].sort()).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
  const spend = screen.getByRole('region', { name: /Gastos por categoria/ })
  expect(within(spend).getByText('vs. setembro')).toBeTruthy()
  expect(within(spend).getByText('novo')).toBeTruthy()
  expect(within(spend).getByText('0,0%')).toBeTruthy()
  expect((await screen.findByRole('region', { name: 'Acerto do casal' })).textContent).toContain('Marcio deve R$ 214,30 a Gabriela')
  expect(screen.getByText('R$ 40,00 · proposta via Claude · aguarda Marcio')).toBeTruthy()
  expect(await screen.findByText('Marcou Energia como paga')).toBeTruthy()
  expect(screen.getByText('Claude, a pedido de Marcio')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Histórico' }).getAttribute('href')).toContain('/atividade')
})

test('compares each variable expense with what was spent and flags the ones above the estimate', async () => {
  start('/?month=2026-10')
  const card = await screen.findByRole('region', { name: 'Variáveis do mês' })
  expect(within(card).getByText('R$ 150,00 ainda previstos')).toBeTruthy()
  expect(within(card).getByRole('img', { name: 'Supermercado: 88% do previsto' })).toBeTruthy()
  expect(within(card).getByRole('img', { name: 'Combustível: 125% do previsto' }).firstElementChild?.className).toContain('bg-late')
  expect(
    within(card)
      .getAllByText(/acima do previsto/)
      .map((node) => node.textContent),
  ).toEqual(['acima do previsto em R$ 100,00'])
  expect(within(card).getByText('· Marcio')).toBeTruthy()
  expect(within(card).getByText('Total do mês').nextElementSibling?.textContent).toBe('R$ 1.550,00 de R$ 1.600,00')
})

test('hides the variable card in a month without variable expenses and keeps the balance', async () => {
  start('/?month=2026-09')
  expect(await screen.findByRole('region', { name: 'Indicadores' })).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'Indicadores' })).getByText('Receitas menos despesas do mês')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Variáveis do mês' })).toBeNull()
})

test('filters entries by the chosen member and shows an empty month', async () => {
  start('/?month=2026-08&member=Marcio')
  expect(await screen.findByText('Nenhum lançamento em agosto de 2026')).toBeTruthy()
  const entryCalls = calls.filter(({ pathname }) => pathname.endsWith('/entries'))
  expect(entryCalls.some(({ pathname, searchParams }) => pathname === '/api/months/2026-08/entries' && searchParams.get('member') === 'Marcio')).toBe(true)
  expect(entryCalls.some(({ pathname }) => pathname === '/api/months/2026-07/entries')).toBe(true)
  expect(entryCalls.every(({ searchParams }) => searchParams.get('member') === 'Marcio')).toBe(true)
})

test('skips the flow chart and its six months of reads on a phone', async () => {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }))
  start('/?month=2026-10')
  expect(await screen.findByRole('region', { name: 'Indicadores' })).toBeTruthy()
  expect(await screen.findByText('Marcou Energia como paga')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Receitas × despesas' })).toBeNull()
  const months = calls.filter(({ pathname }) => pathname.endsWith('/entries')).map(({ pathname }) => pathname.slice(12, 19))
  expect([...new Set(months)].sort()).toEqual(['2026-09', '2026-10'])
})

test('the recent activity card asks who you are without an identity', async () => {
  localStorage.clear()
  start('/?month=2026-10')
  expect(await screen.findByText(/Escolha quem você é em “Você é”/)).toBeTruthy()
  expect(calls.some(({ pathname }) => pathname === '/api/audit')).toBe(false)
})
