import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
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
  '/api/audit': {
    items: [{ id: '3', at: '2026-10-20T12:14:00.000Z', author: 'claude', member: 'Marcio', entity: 'entry', entityId: '9', action: 'update', before: { description: 'Energia', status: 'planned' }, after: { description: 'Energia', status: 'paid' } }],
    counts: { member: 0, claude: 1, import: 0, system: 0 },
    next: null,
  },
}

const calls: URL[] = []

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  calls.push(url)
  const month = url.pathname.match(/^\/api\/months\/(\d{4}-\d{2})\/entries$/)?.[1]
  if (month) return Response.json(months[month] ?? [])
  const body = responses[url.pathname]
  return body ? Response.json(body) : Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

afterEach(() => {
  cleanup()
  calls.length = 0
})

const start = (url: string) => render(<App history={createMemoryHistory({ initialEntries: [url] })} fetch={fetch} />)

test('shows the month KPIs, open bills, categories, settlement, decisions and activity', async () => {
  start('/?month=2026-10')
  const kpis = await screen.findByRole('region', { name: 'Indicadores' })
  expect(within(kpis).getByText('R$ 8.250,00')).toBeTruthy()
  expect(within(kpis).getByText('R$ 750,00 em atraso')).toBeTruthy()
  const due = screen.getByRole('region', { name: 'Para pagar' })
  expect(within(due).getByText('Plano de saúde')).toBeTruthy()
  expect(within(due).getByText('Atrasada')).toBeTruthy()
  expect(within(due).getByText('1 de 2 pagas')).toBeTruthy()
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

test('filters entries by the chosen member and shows an empty month', async () => {
  start('/?month=2026-08&member=Marcio')
  expect(await screen.findByText('Nenhum lançamento em agosto de 2026')).toBeTruthy()
  const entryCalls = calls.filter(({ pathname }) => pathname.endsWith('/entries'))
  expect(entryCalls.some(({ pathname, searchParams }) => pathname === '/api/months/2026-08/entries' && searchParams.get('member') === 'Marcio')).toBe(true)
  expect(entryCalls.some(({ pathname }) => pathname === '/api/months/2026-07/entries')).toBe(true)
  expect(entryCalls.every(({ searchParams }) => searchParams.get('member') === 'Marcio')).toBe(true)
})
