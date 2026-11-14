import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'
import { changesOf } from './edit-model.ts'
import { describeRecord, type SetupRecord } from './model.ts'

const market: SetupRecord = { kind: 'variable_expense', id: '5', name: 'Supermercado', detail: null, amount: { cents: '150000', brl: '' }, day: null, member: null, category: 'Supermercado', account: null }

const calls: { method: string; path: string; body?: unknown }[] = []

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  const body = ['POST', 'PATCH'].includes(input.method) ? await input.json().catch(() => undefined) : undefined
  if (input.method !== 'GET') calls.push({ method: input.method, path: url.pathname, body })
  if (url.pathname === '/api/setup' && input.method === 'POST') return Response.json({ ...market, id: '6', name: body.payload.description, member: 'Gabriela' }, { status: 201 })
  if (url.pathname.startsWith('/api/setup/variable_expense/') && input.method === 'PATCH') return Response.json({ ...market, ...body })
  if (url.pathname.endsWith('/close')) return Response.json({ id: '5' })
  if (url.pathname === '/api/setup') return Response.json([market])
  if (url.pathname === '/api/members')
    return Response.json([
      { id: '1', name: 'Marcio', sharePercent: 50 },
      { id: '2', name: 'Gabriela', sharePercent: 50 },
    ])
  if (url.pathname === '/api/categories') return Response.json([{ id: '3', name: 'Supermercado', direction: 'expense' }])
  if (['/api/accounts', '/api/decisions', '/api/reserves', '/api/goals'].includes(url.pathname)) return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

beforeEach(() => {
  calls.length = 0
  localStorage.setItem('finance.member', 'Marcio')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T12:00:00-03:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

const section = async () => {
  render(<App history={createMemoryHistory({ initialEntries: ['/cadastros'] })} fetch={fetch} />)
  return screen.findByRole('region', { name: /Despesas variáveis/ })
}

test('describes a variable expense as a monthly estimate', () => {
  expect(describeRecord(market)).toBe('R$ 1.500,00 por mês · Supermercado · Conjunto')
  expect(describeRecord({ ...market, member: 'Gabriela' })).toBe('R$ 1.500,00 por mês · Supermercado · Gabriela')
})

test('sits right after Despesas fixas and registers one from this month, joint by default', async () => {
  const variables = await section()
  const order = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.firstChild?.textContent)
  expect(order.slice(3, 5)).toEqual(['Despesas fixas', 'Despesas variáveis'])
  expect(within(variables).getByText('R$ 1.500,00 por mês · Supermercado · Conjunto')).toBeTruthy()
  await userEvent.click(within(variables).getByRole('button', { name: 'Novo cadastro em Despesas variáveis' }))
  const form = within(within(variables).getByRole('form', { name: 'Cadastrar despesa variável' }))
  expect(form.getByLabelText(/^Quem/)).toHaveProperty('value', 'Conjunto')
  expect(form.queryByLabelText('Dia do mês')).toBeNull()
  await userEvent.click(form.getByRole('button', { name: 'Cadastrar' }))
  expect(form.getAllByText('Preencha este campo.')).toHaveLength(3)
  await userEvent.type(form.getByLabelText('Descrição'), 'Farmácia')
  await userEvent.type(form.getByLabelText('Valor estimado por mês'), '250,00')
  await userEvent.type(form.getByLabelText('Categoria'), 'Supermercado')
  await userEvent.click(form.getByRole('button', { name: 'Cadastrar' }))
  await screen.findByText('Cadastrado: Farmácia')
  expect(calls.at(-1)).toEqual({ method: 'POST', path: '/api/setup', body: { kind: 'variable_expense', payload: { description: 'Farmácia', amountCents: 25000, category: 'Supermercado', member: 'joint', startsOn: '2026-11-01' } } })
})

test('registers one for a member and offers the category help', async () => {
  const variables = await section()
  await userEvent.click(within(variables).getByRole('button', { name: 'Novo cadastro em Despesas variáveis' }))
  const form = within(within(variables).getByRole('form', { name: 'Cadastrar despesa variável' }))
  await userEvent.type(form.getByLabelText('Descrição'), 'Combustível')
  await userEvent.type(form.getByLabelText('Valor estimado por mês'), '400')
  await userEvent.type(form.getByLabelText('Categoria'), 'Transporte')
  expect(await form.findByRole('button', { name: 'Criar categoria Transporte' })).toBeTruthy()
  await userEvent.clear(form.getByLabelText(/^Quem/))
  await userEvent.type(form.getByLabelText(/^Quem/), 'Gabriela')
  await userEvent.click(form.getByRole('button', { name: 'Cadastrar' }))
  await screen.findByText('Cadastrado: Combustível')
  expect(calls.at(-1)?.body).toEqual({ kind: 'variable_expense', payload: { description: 'Combustível', amountCents: 40000, category: 'Transporte', member: 'Gabriela', startsOn: '2026-11-01' } })
})

test('edits the estimate in place and sends only what changed', async () => {
  expect(changesOf(market, { name: 'Supermercado', amountCents: 150000, category: 'Supermercado' })).toEqual({})
  const variables = await section()
  await userEvent.click(within(variables).getByRole('button', { name: 'Editar Supermercado' }))
  const form = within(within(variables).getByRole('form', { name: 'Editar Supermercado' }))
  expect(form.getByLabelText('Valor estimado por mês')).toHaveProperty('value', '1.500,00')
  await userEvent.clear(form.getByLabelText('Valor estimado por mês'))
  await userEvent.type(form.getByLabelText('Valor estimado por mês'), '1.800,00')
  await userEvent.click(form.getByRole('button', { name: 'Salvar' }))
  await screen.findByText('Alterado: Supermercado')
  expect(calls.at(-1)).toEqual({ method: 'PATCH', path: '/api/setup/variable_expense/5', body: { amountCents: 180000 } })
})

test('closes one after confirming', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  const variables = await section()
  await userEvent.click(within(variables).getByRole('button', { name: 'Encerrar Supermercado' }))
  expect(calls).toEqual([])
  await userEvent.click(within(variables).getByRole('button', { name: 'Encerrar Supermercado' }))
  await screen.findByText('Encerrado: Supermercado')
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(calls).toEqual([{ method: 'POST', path: '/api/setup/variable_expense/5/close', body: undefined }])
})
