import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'
import { App } from '../app.tsx'

const entry = (id: string, description: string, direction: 'income' | 'expense', state: 'paid' | 'pending' | 'late', dueOn: string, cents: number, extra: Record<string, unknown> = {}) => ({
  id,
  competence: '2026-10-01',
  dueOn,
  description,
  direction,
  amount: { cents: String(cents), brl: '' },
  category: direction === 'income' ? 'Salary' : 'Housing',
  account: 'Joint checking',
  member: null,
  status: state === 'paid' ? 'paid' : 'planned',
  state,
  paidOn: state === 'paid' ? dueOn : null,
  installmentNumber: null,
  installmentsTotal: null,
  origin: 'forecast',
  ...extra,
})

const october = [
  entry('1', 'Salary', 'income', 'paid', '2026-10-05', 1240000, { member: 'Marcio' }),
  entry('2', 'Rent', 'expense', 'paid', '2026-10-05', 380000),
  entry('3', 'Car financing', 'expense', 'pending', '2026-10-28', 130000, { category: 'Debt', installmentNumber: 24, installmentsTotal: 48 }),
  entry('4', 'Health plan', 'expense', 'late', '2026-10-15', 75000, { category: 'Health', origin: 'claude' }),
]

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  if (url.pathname === '/api/months/2026-10/entries') return Response.json(url.searchParams.get('member') === 'Marcio' ? october.slice(0, 1) : october)
  if (url.pathname === '/api/months/2026-11/entries') return Response.json([])
  if (url.pathname === '/api/members') return Response.json([{ id: '1', name: 'Marcio', sharePercent: 50 }])
  if (url.pathname === '/api/decisions') return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

afterEach(cleanup)

const start = (url: string) => render(<App history={createMemoryHistory({ initialEntries: [url] })} fetch={fetch} />)

const descriptions = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent)

const footer = () => screen.getByText(/lançamentos|Mostrando/)

test('lists the month entries newest first with origin, state and totals', async () => {
  start('/lancamentos?month=2026-10')
  await screen.findByRole('table')
  expect(descriptions()).toEqual(['Car financing24/48', 'Health plan', 'Rent', 'Salary'])
  const health = within(screen.getByRole('table')).getByText('Health plan').closest('tr')
  expect(health && within(health).getByText('Claude')).toBeTruthy()
  expect(health && within(health).getByText('Atrasada')).toBeTruthy()
  expect(health?.textContent).toContain('− R$ 750,00')
  expect(footer().textContent).toBe('4 lançamentos')
  expect(screen.getByText('R$ 12.400,00')).toBeTruthy()
  expect(screen.getByText('R$ 5.850,00')).toBeTruthy()
})

test('focuses search with the slash key and filters by text and chips', async () => {
  const user = userEvent.setup()
  start('/lancamentos?month=2026-10')
  await screen.findByRole('table')
  await user.keyboard('/')
  const search = screen.getByRole('searchbox', { name: 'Buscar' })
  expect(document.activeElement).toBe(search)
  await user.keyboard('rent')
  expect(descriptions()).toEqual(['Rent'])
  expect(footer().textContent).toBe('Mostrando 1 de 4')
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: 'Despesas' }))
  await user.click(screen.getByRole('button', { name: 'Pendentes e atrasadas' }))
  expect(descriptions()).toEqual(['Car financing24/48', 'Health plan'])
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por categoria' }), 'Health')
  expect(descriptions()).toEqual(['Health plan'])
  expect(screen.getByText('R$ 750,00')).toBeTruthy()
})

test('offers to clear filters when nothing matches', async () => {
  const user = userEvent.setup()
  start('/lancamentos?month=2026-10')
  await user.type(await screen.findByRole('searchbox', { name: 'Buscar' }), 'nothing like this')
  expect(screen.queryByRole('table')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  expect(descriptions()).toHaveLength(4)
  expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveProperty('value', '')
})

test('reads the chosen member entries and shows an empty month', async () => {
  const { unmount } = render(<App history={createMemoryHistory({ initialEntries: ['/lancamentos?month=2026-10&member=Marcio'] })} fetch={fetch} />)
  await screen.findByRole('table')
  expect(descriptions()).toEqual(['Salary'])
  expect(within(screen.getByRole('table')).getByText('Recebida')).toBeTruthy()
  unmount()
  start('/lancamentos?month=2026-11')
  expect(await screen.findByText('Nenhum lançamento em novembro de 2026')).toBeTruthy()
})

test('words open income as receivable in rows and the open filter', async () => {
  const user = userEvent.setup()
  october.push(entry('5', 'Freelance', 'income', 'late', '2026-10-10', 90000), entry('6', 'Bonus', 'income', 'pending', '2026-10-30', 50000))
  onTestFinished(() => void october.splice(4))
  start('/lancamentos?month=2026-10')
  await screen.findByRole('table')
  await user.click(screen.getByRole('button', { name: 'Receitas' }))
  await user.click(screen.getByRole('button', { name: 'A receber e atrasadas' }))
  const table = within(screen.getByRole('table'))
  expect(descriptions()).toEqual(['Bonus', 'Freelance'])
  expect([table.getByText('A receber'), table.getByText('Recebimento atrasado')]).toHaveLength(2)
  expect(table.queryByText(/^(Pendente|Atrasada)$/)).toBeNull()
})
