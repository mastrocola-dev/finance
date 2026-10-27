import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'
import { changesOf } from './edit-model.ts'
import { describeRecord, type SetupRecord } from './model.ts'

const record = (kind: SetupRecord['kind'], name: string, extra: Partial<SetupRecord> = {}): SetupRecord => ({ kind, id: '1', name, detail: null, amount: null, day: null, member: null, category: null, account: null, ...extra })

test('describes each kind in Portuguese', () => {
  expect(describeRecord(record('account', 'Cartão Marcio', { detail: 'Banco Fictício · credit_card · 4321', member: 'Marcio' }))).toBe('Banco Fictício · Cartão · final 4321 · Marcio')
  expect(describeRecord(record('category', 'Pets', { detail: 'expense' }))).toBe('Despesa')
  expect(describeRecord(record('recurring_expense', 'Sofá', { amount: { cents: '45000', brl: '' }, day: 12, category: 'Casa', detail: '12' }))).toBe('R$ 450,00 por mês · dia 12 · Casa · Conjunto · 12 parcelas')
  expect(describeRecord(record('goal', 'Japão', { amount: { cents: '2000000', brl: '' }, detail: 'Viagem' }))).toBe('Meta R$ 20.000,00 · reserva Viagem')
})

const posts: unknown[] = []
const patches: { path: string; body: unknown }[] = []
let refuse = false

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  if (url.pathname === '/api/setup' && input.method === 'POST') {
    const body = await input.json()
    posts.push(body)
    if (refuse) return Response.json({ error: 'category Pets already exists' }, { status: 422 })
    return Response.json(record('category', 'Pets', { detail: 'expense', id: '9' }), { status: 201 })
  }
  if (url.pathname.startsWith('/api/setup/') && input.method === 'PATCH') {
    const body = await input.json()
    patches.push({ path: url.pathname, body })
    if (body.name === 'Saúde') return Response.json({ error: 'category Saúde already exists' }, { status: 422 })
    return Response.json(record('recurring_expense', body.name ?? 'Internet', { id: '7' }))
  }
  if (url.pathname === '/api/setup')
    return Response.json([record('category', 'Moradia', { detail: 'expense' }), record('account', 'Conta conjunta', { detail: 'Banco · checking · 1234' }), record('recurring_expense', 'Internet', { id: '7', amount: { cents: '12000', brl: '' }, day: 20, category: 'Contas da casa', account: 'Conta conjunta' })])
  if (url.pathname === '/api/members') return Response.json([{ id: '1', name: 'Marcio', sharePercent: 50 }])
  if (['/api/categories', '/api/accounts', '/api/decisions'].includes(url.pathname)) return Response.json([])
  if (url.pathname === '/api/reserves') return Response.json([])
  if (url.pathname === '/api/goals') return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

afterEach(cleanup)

test('lists records by kind and registers a category, explaining a duplicate', async () => {
  localStorage.setItem('finance.member', 'Marcio')
  render(<App history={createMemoryHistory({ initialEntries: ['/cadastros'] })} fetch={fetch} />)
  const categories = await screen.findByRole('region', { name: /Categorias/ })
  expect(within(categories).getByText('Moradia')).toBeTruthy()
  expect(within(screen.getByRole('region', { name: /Contas/ })).getByText('Banco · Conta corrente · final 1234 · Conjunto')).toBeTruthy()
  await userEvent.selectOptions(screen.getByLabelText('O que cadastrar'), 'category')
  const form = screen.getByRole('form', { name: 'Cadastrar categoria' })
  await userEvent.click(within(form).getByRole('button', { name: 'Cadastrar' }))
  expect(within(form).getByText('Preencha este campo.')).toBeTruthy()
  await userEvent.type(within(form).getByLabelText('Nome'), 'Pets')
  await userEvent.click(within(form).getByRole('button', { name: 'Cadastrar' }))
  await screen.findByText('Cadastrado: Pets')
  expect(posts.at(-1)).toEqual({ kind: 'category', payload: { name: 'Pets', kind: 'expense' } })
  refuse = true
  const again = screen.getByRole('form', { name: 'Cadastrar categoria' })
  await userEvent.type(within(again).getByLabelText('Nome'), 'Pets')
  await userEvent.click(within(again).getByRole('button', { name: 'Cadastrar' }))
  expect((await within(screen.getByRole('form', { name: 'Cadastrar categoria' })).findByRole('alert')).textContent).toBe('Já existe um cadastro com esse nome.')
})

test('sends only the changed fields, and null when the account is cleared', () => {
  const internet = record('recurring_expense', 'Internet', { amount: { cents: '12000', brl: '' }, day: 20, category: 'Contas da casa', account: 'Conta conjunta' })
  expect(changesOf(internet, { name: 'Internet', amountCents: 12000, dayOfMonth: 20, account: 'Conta conjunta', category: 'Contas da casa' })).toEqual({})
  expect(changesOf(internet, { name: 'Internet fibra', amountCents: 13500, dayOfMonth: 20, category: 'Contas da casa' })).toEqual({ name: 'Internet fibra', amountCents: 13500, account: null })
})

test('edits a record in place and explains a refused name', async () => {
  localStorage.setItem('finance.member', 'Marcio')
  render(<App history={createMemoryHistory({ initialEntries: ['/cadastros'] })} fetch={fetch} />)
  const expenses = await screen.findByRole('region', { name: /Despesas fixas/ })
  await userEvent.click(within(expenses).getByRole('button', { name: 'Editar Internet' }))
  const form = within(expenses).getByRole('form', { name: 'Editar Internet' })
  expect((within(form).getByLabelText('Valor mensal') as HTMLInputElement).value).toBe('120,00')
  await userEvent.clear(within(form).getByLabelText('Valor mensal'))
  await userEvent.type(within(form).getByLabelText('Valor mensal'), '135,00')
  await userEvent.clear(within(form).getByLabelText('Dia do mês'))
  await userEvent.type(within(form).getByLabelText('Dia do mês'), '21')
  await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
  await screen.findByText('Alterado: Internet')
  expect(patches.at(-1)).toEqual({ path: '/api/setup/recurring_expense/7', body: { amountCents: 13500, dayOfMonth: 21 } })
  expect(within(expenses).queryByRole('form')).toBeNull()
  const categories = screen.getByRole('region', { name: /Categorias/ })
  await userEvent.click(within(categories).getByRole('button', { name: 'Editar Moradia' }))
  const rename = within(categories).getByRole('form', { name: 'Editar Moradia' })
  await userEvent.clear(within(rename).getByLabelText('Nome'))
  await userEvent.type(within(rename).getByLabelText('Nome'), 'Saúde')
  await userEvent.click(within(rename).getByRole('button', { name: 'Salvar' }))
  expect((await within(rename).findByRole('alert')).textContent).toBe('Já existe um cadastro com esse nome.')
})
