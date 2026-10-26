import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'

const rent = {
  id: '2',
  competence: '2026-10-01',
  dueOn: '2026-10-05',
  description: 'Aluguel',
  direction: 'expense',
  amount: { cents: '320000', brl: 'R$ 3.200,00' },
  category: 'Moradia',
  account: 'Conta conjunta',
  member: null,
  status: 'paid',
  state: 'paid',
  paidOn: '2026-10-04',
  installmentNumber: null,
  installmentsTotal: null,
  origin: 'forecast',
}

const calls: { method: string; path: string; body: unknown }[] = []
let entries = [rent]

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  if (input.method !== 'GET') {
    const text = await input.text()
    calls.push({ method: input.method, path: url.pathname, body: text ? JSON.parse(text) : undefined })
    if (url.pathname === '/api/entries/2' && input.method === 'PUT') {
      entries = [{ ...rent, id: '9', amount: { cents: '330000', brl: 'R$ 3.300,00' } }]
      return Response.json(entries[0])
    }
    if (url.pathname === '/api/entries/9/cancel') {
      entries = []
      return Response.json({ id: '9' })
    }
  }
  if (url.pathname === '/api/months/2026-10/entries') return Response.json(entries)
  if (url.pathname === '/api/members') return Response.json([{ id: '1', name: 'Marcio', sharePercent: 50 }])
  if (url.pathname === '/api/categories') return Response.json([{ id: '1', name: 'Moradia', direction: 'expense' }])
  if (url.pathname === '/api/accounts') return Response.json([{ id: '1', nickname: 'Conta conjunta', lastFour: '1234', member: null }])
  if (url.pathname === '/api/decisions') return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

afterEach(cleanup)

test('corrects an entry from its row, keeps the payment date, then cancels the replacement', async () => {
  localStorage.setItem('finance.member', 'Marcio')
  render(<App history={createMemoryHistory({ initialEntries: ['/lancamentos?month=2026-10'] })} fetch={fetch} />)
  const table = await screen.findByRole('table')
  await userEvent.click(within(table).getByRole('button', { name: 'Corrigir Aluguel' }))
  const form = await screen.findByRole('form', { name: 'Corrigir Aluguel' })
  expect((within(form).getByLabelText('Valor') as HTMLInputElement).value).toBe('3.200,00')
  expect((within(form).getByLabelText('Categoria') as HTMLSelectElement).value).toBe('Moradia')
  expect((within(form).getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  await userEvent.clear(within(form).getByLabelText('Valor'))
  await userEvent.type(within(form).getByLabelText('Valor'), '3.300,00')
  await userEvent.click(within(form).getByRole('button', { name: /Salvar correção/ }))
  await screen.findByText('Corrigido: Aluguel')
  expect(calls.at(-1)).toEqual({
    method: 'PUT',
    path: '/api/entries/2',
    body: { month: '2026-10', due_on: '2026-10-05', description: 'Aluguel', direction: 'expense', amount_cents: 330000, category: 'Moradia', account: 'Conta conjunta', member: 'joint', paid_on: '2026-10-04' },
  })
  expect(screen.queryByRole('form', { name: 'Corrigir Aluguel' })).toBeNull()
  vi.stubGlobal('confirm', () => true)
  await userEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Corrigir Aluguel' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Cancelar lançamento' }))
  await screen.findByText('Cancelado: Aluguel')
  expect(calls.at(-1)).toEqual({ method: 'POST', path: '/api/entries/9/cancel', body: undefined })
  await waitFor(() => expect(screen.queryByRole('table')).toBeNull())
  vi.unstubAllGlobals()
})
