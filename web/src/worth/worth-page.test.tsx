import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'

const money = (cents: number) => ({ cents: String(cents), brl: '' })

const debts = [
  {
    id: '1',
    creditor: 'Financeira Exemplo',
    description: 'Financiamento do carro',
    member: null,
    account: 'Conjunta',
    principal: money(4800000),
    balance: money(3120000),
    monthlyRatePercent: '1.2900',
    installment: money(130000),
    installmentsTotal: 48,
    installmentsPaid: 24,
    installmentsRemaining: 24,
    startsOn: '2024-11-01',
    nextDueOn: '2026-11-12',
  },
  {
    id: '2',
    creditor: 'Banco Horizonte',
    description: 'Crédito pessoal',
    member: 'Gabriela',
    account: 'Gabriela',
    principal: money(1200000),
    balance: money(560000),
    monthlyRatePercent: '2.1000',
    installment: money(112000),
    installmentsTotal: 12,
    installmentsPaid: 7,
    installmentsRemaining: 5,
    startsOn: '2026-03-01',
    nextDueOn: '2026-10-25',
  },
]

const reserves = [{ id: '1', name: 'Reserva de emergência', account: 'Poupança', balance: money(1800000), target: money(3000000), missing: money(1200000), progressPercent: '60.0' }]

const goals = [{ id: '1', name: 'Viagem a Lisboa', reserve: null, target: money(1200000), saved: money(450000), missing: money(750000), progressPercent: '37.5', dueOn: '2027-07-01' }]

let data: Record<string, unknown> = {}
let failing = new Set<string>()

const fetch = vi.fn(async (input: Request) => {
  const path = new URL(input.url).pathname
  if (failing.has(path)) return Response.json({ error: 'boom' }, { status: 500 })
  if (path in data) return Response.json(data[path])
  if (path === '/api/members') return Response.json([{ id: '1', name: 'Marcio', sharePercent: 50 }])
  if (path === '/api/decisions') return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

const filled = () => ({ '/api/cards': [], '/api/debts': debts, '/api/reserves': reserves, '/api/goals': goals, '/api/net-worth': { reserves: money(1800000), goals: money(450000), debts: money(3680000), netWorth: money(-1430000) } })

afterEach(() => {
  cleanup()
  failing = new Set()
})

const start = () => render(<App history={createMemoryHistory({ initialEntries: ['/patrimonio'] })} fetch={fetch} />)

test('shows net worth, debts with installment strips and savings with progress rings', async () => {
  data = filled()
  start()
  expect(await screen.findByText('− R$ 14.300,00')).toBeTruthy()
  const debtList = screen.getByRole('region', { name: 'Dívidas' })
  expect(await within(debtList).findByRole('img', { name: '24 de 48 parcelas pagas' })).toBeTruthy()
  expect(within(debtList).getByText('R$ 2.420,00/mês')).toBeTruthy()
  expect(within(debtList).getByText('7 de 12 pagas · próxima 25/10')).toBeTruthy()
  const savingList = screen.getByRole('region', { name: 'Reservas e metas' })
  expect(within(savingList).getByRole('img', { name: '60% da meta' })).toBeTruthy()
  expect(within(savingList).getByRole('img', { name: '37% da meta' })).toBeTruthy()
  expect(within(savingList).getByText('R$ 4.500,00 de R$ 12.000,00')).toBeTruthy()
})

test('tells when there are no debts, reserves or goals', async () => {
  data = { ...filled(), '/api/debts': [], '/api/reserves': [], '/api/goals': [] }
  start()
  expect(await screen.findByText('Nenhuma dívida ativa')).toBeTruthy()
  expect(await screen.findByText('Nenhuma reserva ou meta')).toBeTruthy()
})

test('retries a section that failed without hiding the others', async () => {
  data = filled()
  failing = new Set(['/api/goals', '/api/net-worth'])
  start()
  const savingList = await screen.findByRole('region', { name: 'Reservas e metas' })
  const retry = await within(savingList).findByRole('button', { name: 'Tentar novamente' }, { timeout: 3000 })
  expect(await screen.findByText(/indisponível/, {}, { timeout: 3000 })).toBeTruthy()
  expect(await screen.findByRole('img', { name: '24 de 48 parcelas pagas' })).toBeTruthy()
  failing = new Set()
  await userEvent.click(retry)
  expect(await within(savingList).findByRole('img', { name: '37% da meta' })).toBeTruthy()
})

test('marks the debt, reserve or goal named in the link', async () => {
  data = filled()
  render(<App history={createMemoryHistory({ initialEntries: ['/patrimonio#goal-1'] })} fetch={fetch} />)
  const goal = await screen.findByRole('heading', { name: 'Viagem a Lisboa' })
  expect(goal.closest('article')?.getAttribute('aria-current')).toBe('true')
  expect(screen.getByRole('heading', { name: 'Reserva de emergência' }).closest('article')?.hasAttribute('aria-current')).toBe(false)
  expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1)
})

const installment = { id: '1', description: 'Geladeira', member: null, category: 'Casa', installment: money(25000), installmentsTotal: 10, current: 4, remaining: 7, firstBill: '2026-08-01', lastBill: '2027-05-01', committed: money(175000) }

const card = (overrides: Record<string, unknown> = {}) => ({
  id: '3',
  nickname: 'Cartão Marcio',
  institution: 'Banco Exemplo',
  lastFour: '4242',
  member: 'Marcio',
  limit: money(800000),
  committed: money(335000),
  available: money(465000),
  installments: [installment],
  releases: [
    { month: '2026-11-01', amount: money(65000) },
    { month: '2027-02-01', amount: money(65000) },
  ],
  ...overrides,
})

test('shows each card with the limit in use, what is available and when it frees', async () => {
  data = { ...filled(), '/api/cards': [card(), card({ id: '4', nickname: 'Cartão Gabriela', member: 'Gabriela', limit: null, available: null, committed: money(0), installments: [], releases: [] })] }
  render(<App history={createMemoryHistory({ initialEntries: ['/patrimonio?month=2026-11'] })} fetch={fetch} />)
  const cards = await screen.findByRole('region', { name: 'Cartões' })
  expect(within(cards).getByText(/já estão na fatura do cartão/)).toBeTruthy()
  const marcio = await within(cards).findByRole('article', { name: 'Cartão Marcio' })
  expect(within(marcio).getByRole('img', { name: 'R$ 3.350,00 de R$ 8.000,00 do limite em uso' })).toBeTruthy()
  expect(marcio.textContent).toContain('Parcelado: R$ 3.350,00')
  expect(marcio.textContent).toContain('Disponível R$ 4.650,00')
  expect(within(marcio).getByText('Libera R$ 650,00 em novembro')).toBeTruthy()
  expect(within(marcio).getByRole('img', { name: 'Liberações nos próximos 12 meses: R$ 650,00 em novembro, R$ 650,00 em fevereiro de 2027' })).toBeTruthy()
  const gabriela = within(cards).getByRole('article', { name: 'Cartão Gabriela' })
  expect(gabriela.textContent).toContain('Parcelado: R$ 0,00')
  expect(within(gabriela).getByRole('link', { name: 'Informar o limite em Cadastros' }).getAttribute('href')).toMatch(/^\/cadastros/)
  expect(within(gabriela).queryByRole('img')).toBeNull()
  const fetched = vi
    .mocked(fetch)
    .mock.calls.map(([request]) => new URL((request as Request).url))
    .find((url) => url.pathname === '/api/cards')
  expect(fetched?.searchParams.get('month')).toBe('2026-11')
})

test('says in words when the installments go over the limit', async () => {
  data = { ...filled(), '/api/cards': [card({ limit: money(300000), available: money(-35000) })] }
  start()
  const marcio = await screen.findByRole('article', { name: 'Cartão Marcio' })
  expect(within(marcio).getByRole('img', { name: 'R$ 3.350,00 de R$ 3.000,00 do limite em uso, acima do limite' })).toBeTruthy()
  expect(marcio.textContent).toContain('Disponível − R$ 350,00 · acima do limite')
})

test('leaves the cards region out when the household has no card', async () => {
  data = filled()
  start()
  await screen.findByRole('region', { name: 'Dívidas' })
  await screen.findByRole('img', { name: '24 de 48 parcelas pagas' })
  expect(screen.queryByRole('region', { name: 'Cartões' })).toBeNull()
})
