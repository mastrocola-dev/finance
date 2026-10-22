import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'

const entry = (id: string, description: string, dueOn: string, cents: number, category = 'Housing') => ({
  id,
  competence: '2026-10-01',
  dueOn,
  description,
  direction: 'expense',
  amount: { cents: String(cents), brl: '' },
  category,
  account: 'Joint checking',
  member: null,
  status: 'planned',
  state: 'pending',
  paidOn: null,
  installmentNumber: null,
  installmentsTotal: null,
  origin: 'manual',
})

let entries = [entry('1', 'Rent', '2026-10-10', 320000)]
const bodies: unknown[] = []

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  if (input.method === 'POST' && url.pathname === '/api/entries') {
    if (!input.headers.get('x-member')) return Response.json({ error: 'writes need the x-member header' }, { status: 401 })
    const body = await input.json()
    bodies.push(body)
    const created = { ...entry('9', body.description, body.due_on, body.amount_cents, body.category), account: 'Marcio card', ...(body.paid_on && { status: 'paid', state: 'paid', paidOn: body.paid_on }) }
    entries = [...entries, created]
    return Response.json(created, { status: 201 })
  }
  if (url.pathname === '/api/months/2026-10/entries') return Response.json(entries)
  if (url.pathname === '/api/members') return Response.json([{ id: '1', name: 'Marcio', sharePercent: 50 }])
  if (url.pathname === '/api/categories')
    return Response.json([
      { id: '1', name: 'Health', direction: 'expense' },
      { id: '2', name: 'Housing', direction: 'expense' },
      { id: '3', name: 'Salary', direction: 'income' },
    ])
  if (url.pathname === '/api/accounts') return Response.json([{ id: '4', nickname: 'Marcio card', lastFour: '8812', member: 'Marcio' }])
  if (url.pathname === '/api/decisions') return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  localStorage.clear()
  entries = [entry('1', 'Rent', '2026-10-10', 320000)]
  bodies.length = 0
})

const start = () => render(<App history={createMemoryHistory({ initialEntries: ['/lancamentos?month=2026-10'] })} fetch={fetch} />)

const form = async () => screen.findByRole('form', { name: 'Lançamento rápido' })

test('records an entry with Enter, highlights it and keeps the form ready for the next one', async () => {
  localStorage.setItem('finance.member', 'Marcio')
  const user = userEvent.setup()
  start()
  const quick = within(await form())
  await waitFor(() => expect(quick.getAllByRole('option', { name: 'Marcio card •• 8812' })).toHaveLength(1))
  expect(quick.queryByRole('option', { name: 'Salary' })).toBeNull()
  await user.selectOptions(quick.getByRole('combobox', { name: 'Categoria' }), 'Health')
  await user.selectOptions(quick.getByRole('combobox', { name: 'Conta' }), 'Marcio card')
  await user.type(quick.getByRole('textbox', { name: 'Descrição' }), 'Farmácia')
  await user.type(quick.getByRole('textbox', { name: 'Valor' }), '84,90{Enter}')
  await screen.findByText('Lançado: Farmácia')
  expect(bodies).toEqual([{ month: '2026-10', due_on: expect.stringMatching(/^2026-10-/), description: 'Farmácia', direction: 'expense', amount_cents: 8490, category: 'Health', account: 'Marcio card', member: 'joint', paid_on: expect.stringMatching(/^2026-10-/) }])
  const row = await within(screen.getByRole('table')).findByText('Farmácia')
  expect(row.closest('tr')?.className).toContain('bg-accent-soft')
  expect(quick.getByRole('textbox', { name: 'Descrição' })).toHaveProperty('value', '')
  expect(document.activeElement).toBe(quick.getByRole('textbox', { name: 'Descrição' }))
  expect(quick.getByRole('combobox', { name: 'Categoria' })).toHaveProperty('value', 'Health')
})

test('explains what is missing before sending anything', async () => {
  const user = userEvent.setup()
  start()
  const quick = within(await form())
  await user.type(quick.getByRole('textbox', { name: 'Valor' }), 'abc')
  await user.click(quick.getByRole('button', { name: 'Lançar' }))
  expect((await quick.findByRole('alert')).textContent).toBe('Informe a descrição. Informe um valor maior que zero, como 84,90. Escolha a categoria.')
  expect(quick.getByRole('textbox', { name: 'Valor' }).getAttribute('aria-invalid')).toBe('true')
  expect(bodies).toEqual([])
})

test('asks to choose the member when the API refuses an anonymous write', async () => {
  const user = userEvent.setup()
  start()
  const quick = within(await form())
  await waitFor(() => expect(quick.getAllByRole('option', { name: 'Health' })).toHaveLength(1))
  await user.selectOptions(quick.getByRole('combobox', { name: 'Tipo' }), 'income')
  expect(quick.getByRole('combobox', { name: 'Categoria' })).toHaveProperty('value', '')
  await user.selectOptions(quick.getByRole('combobox', { name: 'Categoria' }), 'Salary')
  await user.type(quick.getByRole('textbox', { name: 'Descrição' }), 'Bonus')
  await user.type(quick.getByRole('textbox', { name: 'Valor' }), '1.000{Enter}')
  expect(await screen.findByText('Escolha quem você é para lançar.')).toBeTruthy()
  expect(quick.getByRole('textbox', { name: 'Descrição' })).toHaveProperty('value', 'Bonus')
})

test('takes today as paid and a later date as still to pay or receive', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-18T12:00:00-03:00'))
  localStorage.setItem('finance.member', 'Marcio')
  const user = userEvent.setup()
  start()
  const quick = within(await form())
  await waitFor(() => expect(quick.getAllByRole('option', { name: 'Health' })).toHaveLength(1))
  const date = quick.getByLabelText('Data')
  const paid = quick.getByRole('checkbox', { name: 'Já pago' })
  expect(date).toHaveProperty('value', '2026-10-18')
  expect(paid).toHaveProperty('checked', true)
  await user.clear(date)
  await user.type(date, '2026-10-25')
  expect(paid).toHaveProperty('checked', false)
  await user.click(paid)
  await user.selectOptions(quick.getByRole('combobox', { name: 'Categoria' }), 'Health')
  await user.type(quick.getByRole('textbox', { name: 'Descrição' }), 'Dentista')
  await user.type(quick.getByRole('textbox', { name: 'Valor' }), '250{Enter}')
  expect((await quick.findByRole('alert')).textContent).toBe('Uma data futura ainda não pode estar paga.')
  await user.click(paid)
  await user.click(quick.getByRole('button', { name: 'Lançar' }))
  await screen.findByText('Lançado: Dentista')
  await user.selectOptions(quick.getByRole('combobox', { name: 'Tipo' }), 'income')
  expect(quick.getByRole('checkbox', { name: 'Já recebido' })).toBeTruthy()
  expect(bodies).toEqual([expect.objectContaining({ description: 'Dentista', due_on: '2026-10-25' })])
  expect(bodies[0]).not.toHaveProperty('paid_on')
})
