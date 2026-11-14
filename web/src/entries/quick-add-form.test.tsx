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

const seeded = [
  { id: '1', name: 'Health', direction: 'expense' },
  { id: '2', name: 'Housing', direction: 'expense' },
  { id: '3', name: 'Salary', direction: 'income' },
]

let entries = [entry('1', 'Rent', '2026-10-10', 320000)]
let categories = [...seeded]
const bodies: unknown[] = []
const setups: unknown[] = []
let starters = 0

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
  if (input.method === 'POST' && url.pathname === '/api/setup') {
    const body = await input.json()
    setups.push(body)
    categories = [...categories, { id: '8', name: body.payload.name, direction: body.payload.kind }]
    return Response.json({ kind: 'category', id: '8', name: body.payload.name, detail: body.payload.kind, amount: null, day: null, member: null, category: null, account: null }, { status: 201 })
  }
  if (input.method === 'POST' && url.pathname === '/api/setup/starter-categories') {
    starters += 1
    categories = [{ id: '5', name: 'Mercado', direction: 'expense' }]
    return Response.json([{ kind: 'category', id: '5', name: 'Mercado', detail: 'expense', amount: null, day: null, member: null, category: null, account: null }], { status: 201 })
  }
  if (url.pathname === '/api/setup') return Response.json([])
  if (url.pathname === '/api/categories') return Response.json(categories)
  if (url.pathname === '/api/accounts') return Response.json([{ id: '4', nickname: 'Marcio card', lastFour: '8812', member: 'Marcio' }])
  if (url.pathname === '/api/decisions') return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  localStorage.clear()
  entries = [entry('1', 'Rent', '2026-10-10', 320000)]
  categories = [...seeded]
  bodies.length = 0
  setups.length = 0
  starters = 0
})

const start = () => render(<App history={createMemoryHistory({ initialEntries: ['/lancamentos?month=2026-10'] })} fetch={fetch} />)

const form = async () => screen.findByRole('form', { name: 'Lançamento rápido' })

const suggested = () => [...document.querySelectorAll('#quick-category-names option')].map((option) => option.getAttribute('value'))

const loaded = () => waitFor(() => expect(suggested().length).toBeGreaterThan(0))

test('records an entry with Enter, highlights it and keeps the form ready for the next one', async () => {
  localStorage.setItem('finance.member', 'Marcio')
  const user = userEvent.setup()
  start()
  const quick = within(await form())
  await waitFor(() => expect(quick.getAllByRole('option', { name: 'Marcio card •• 8812' })).toHaveLength(1))
  await loaded()
  expect(suggested()).toEqual(['Health', 'Housing'])
  await user.type(quick.getByRole('combobox', { name: 'Categoria' }), 'health')
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
  await loaded()
  await user.type(quick.getByRole('combobox', { name: 'Categoria' }), 'Health')
  await user.selectOptions(quick.getByRole('combobox', { name: 'Tipo' }), 'income')
  expect(quick.getByRole('combobox', { name: 'Categoria' })).toHaveProperty('value', '')
  expect(suggested()).toEqual(['Salary'])
  await user.type(quick.getByRole('combobox', { name: 'Categoria' }), 'Salary')
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
  await loaded()
  const date = quick.getByLabelText('Data')
  const paid = quick.getByRole('checkbox', { name: 'Já pago' })
  expect(date).toHaveProperty('value', '2026-10-18')
  expect(paid).toHaveProperty('checked', true)
  await user.clear(date)
  await user.type(date, '2026-10-25')
  expect(paid).toHaveProperty('checked', false)
  await user.click(paid)
  await user.type(quick.getByRole('combobox', { name: 'Categoria' }), 'Health')
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

test('creates a missing category inline, selects it and records the entry with it', async () => {
  localStorage.setItem('finance.member', 'Marcio')
  const user = userEvent.setup()
  start()
  const quick = within(await form())
  await loaded()
  const field = quick.getByRole('combobox', { name: 'Categoria' })
  await user.type(field, 'Heal')
  expect(quick.getByRole('button', { name: 'Criar categoria Heal' })).toBeTruthy()
  await user.type(field, 'th')
  expect(quick.queryByRole('button', { name: /Criar categoria/ })).toBeNull()
  await user.clear(field)
  await user.type(field, ' Pets ')
  await user.type(quick.getByRole('textbox', { name: 'Descrição' }), 'Ração')
  await user.type(quick.getByRole('textbox', { name: 'Valor' }), '120{Enter}')
  expect((await quick.findByRole('alert')).textContent).toBe('Crie a categoria Pets ou escolha uma da lista.')
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(bodies).toEqual([])
  await user.click(quick.getByRole('button', { name: 'Criar categoria Pets' }))
  await screen.findByText('Categoria criada: Pets')
  expect(setups).toEqual([{ kind: 'category', payload: { name: 'Pets', kind: 'expense' } }])
  expect(field).toHaveProperty('value', 'Pets')
  await waitFor(() => expect(quick.queryByRole('alert')).toBeNull())
  expect(quick.queryByRole('button', { name: /Criar categoria/ })).toBeNull()
  await user.click(quick.getByRole('button', { name: 'Lançar' }))
  await screen.findByText('Lançado: Ração')
  expect(bodies).toEqual([expect.objectContaining({ description: 'Ração', category: 'Pets' })])
})

test('offers the suggested categories next to the field when the ledger has none', async () => {
  categories = []
  localStorage.setItem('finance.member', 'Marcio')
  const user = userEvent.setup()
  start()
  const quick = within(await form())
  await user.click(await quick.findByRole('button', { name: 'Criar categorias sugeridas' }))
  await screen.findByText('Criada 1 categoria')
  expect(starters).toBe(1)
  await waitFor(() => expect(suggested()).toEqual(['Mercado']))
  expect(quick.queryByRole('button', { name: 'Criar categorias sugeridas' })).toBeNull()
})
