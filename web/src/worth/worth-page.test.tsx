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

const filled = () => ({ '/api/debts': debts, '/api/reserves': reserves, '/api/goals': goals, '/api/net-worth': { reserves: money(1800000), goals: money(450000), debts: money(3680000), netWorth: money(-1430000) } })

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
