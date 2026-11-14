import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'
import { changesOf } from './edit-model.ts'
import { describeRecord, installmentOf, type SetupRecord } from './model.ts'

const blank = { day: null, member: null, category: null, account: null }
const card: SetupRecord = { ...blank, kind: 'account', id: '4', name: 'Cartão Marcio', detail: 'Banco Horizonte · credit_card · 8812', amount: { cents: '800000', brl: '' }, member: 'Marcio' }
const checking: SetupRecord = { ...blank, kind: 'account', id: '1', name: 'Conta conjunta', detail: 'Banco Aurora · checking · 0427', amount: null }
const fridge: SetupRecord = { ...blank, kind: 'card_installment', id: '7', name: 'Geladeira', detail: '10 installments from 2026-08-01', amount: { cents: '25000', brl: '' }, category: 'Casa', account: 'Cartão Marcio' }

const calls: { method: string; path: string; body?: unknown }[] = []

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  const body = ['POST', 'PATCH'].includes(input.method) ? await input.json().catch(() => undefined) : undefined
  if (input.method !== 'GET') calls.push({ method: input.method, path: url.pathname, body })
  if (url.pathname === '/api/setup' && input.method === 'POST') return Response.json({ ...fridge, id: '8', name: body.payload.description }, { status: 201 })
  if (url.pathname.startsWith('/api/setup/') && input.method === 'PATCH') return Response.json(url.pathname.includes('account') ? card : fridge)
  if (url.pathname.endsWith('/close')) return Response.json({ id: '7' })
  if (url.pathname === '/api/setup') return Response.json([checking, card, fridge])
  if (url.pathname === '/api/members') return Response.json([{ id: '1', name: 'Marcio', sharePercent: 100 }])
  if (url.pathname === '/api/categories') return Response.json([{ id: '3', name: 'Casa', direction: 'expense' }])
  if (url.pathname === '/api/accounts') return Response.json([])
  if (['/api/decisions', '/api/reserves', '/api/goals'].includes(url.pathname)) return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

beforeEach(() => {
  calls.length = 0
  localStorage.setItem('finance.member', 'Marcio')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-18T12:00:00-03:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

const section = async () => {
  render(<App history={createMemoryHistory({ initialEntries: ['/cadastros'] })} fetch={fetch} />)
  return screen.findByRole('region', { name: /Parcelamentos · Cartão Marcio/ })
}

test('describes an installment by its place on this month bill and its last bill', () => {
  expect(describeRecord(fridge)).toBe('R$ 250,00 · parcela 3 de 10 · termina mai/2027 · Casa · Conjunto')
  expect(installmentOf(fridge, '2026-07-01')).toEqual({ total: 10, current: 0, firstBill: '2026-08-01', lastBill: '2027-05-01' })
  expect(describeRecord({ ...fridge, detail: '10 installments from 2026-12-01', member: 'Marcio' })).toBe('R$ 250,00 · primeira parcela em dez/2026 · termina set/2027 · Casa · Marcio')
  expect(describeRecord(card)).toBe('Banco Horizonte · Cartão · final 8812 · limite R$ 8.000,00 · Marcio')
})

test('shows one region per credit card, right after Contas, with its limit', async () => {
  const installments = await section()
  const order = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.firstChild?.textContent)
  expect(order.slice(0, 3)).toEqual(['Contas', 'Parcelamentos · Cartão Marcio', 'Categorias'])
  expect(within(installments).getByText(/^Limite R\$ 8\.000,00\. As parcelas já estão na fatura/)).toBeTruthy()
  expect(within(installments).getByText('R$ 250,00 · parcela 3 de 10 · termina mai/2027 · Casa · Conjunto')).toBeTruthy()
})

test('registers an installment on that card from this month bill', async () => {
  const installments = await section()
  await userEvent.click(within(installments).getByRole('button', { name: 'Novo cadastro em Parcelamentos · Cartão Marcio' }))
  const form = within(within(installments).getByRole('form', { name: 'Cadastrar parcelamento' }))
  expect(form.getByLabelText('Cartão')).toHaveProperty('value', 'Cartão Marcio')
  await userEvent.type(form.getByLabelText('Descrição'), 'Notebook')
  await userEvent.type(form.getByLabelText('Valor da parcela'), '400,00')
  await userEvent.type(form.getByLabelText('Parcelas'), '6')
  await userEvent.type(form.getByLabelText('Parcela na fatura deste mês'), '7')
  await userEvent.click(form.getByRole('button', { name: 'Cadastrar' }))
  expect(form.getByText('A parcela passa do total.')).toBeTruthy()
  expect(calls).toEqual([])
  await userEvent.clear(form.getByLabelText('Parcela na fatura deste mês'))
  await userEvent.type(form.getByLabelText('Parcela na fatura deste mês'), '2')
  await userEvent.click(form.getByRole('button', { name: 'Cadastrar' }))
  await screen.findByText('Cadastrado: Notebook')
  expect(calls.at(-1)).toEqual({ method: 'POST', path: '/api/setup', body: { kind: 'card_installment', payload: { description: 'Notebook', amountCents: 40000, installmentsTotal: 6, currentInstallment: 2, account: 'Cartão Marcio', billMonth: '2026-10-01' } } })
})

test('edits an installment without its count and closes it after confirming', async () => {
  expect(changesOf(fridge, { name: 'Geladeira', amountCents: 25000, account: 'Cartão Marcio', category: 'Casa' })).toEqual({})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const installments = await section()
  await userEvent.click(within(installments).getByRole('button', { name: 'Editar Geladeira' }))
  const form = within(within(installments).getByRole('form', { name: 'Editar Geladeira' }))
  expect(form.queryByLabelText('Parcelas')).toBeNull()
  await userEvent.clear(form.getByLabelText('Descrição'))
  await userEvent.type(form.getByLabelText('Descrição'), 'Geladeira nova')
  await userEvent.click(form.getByRole('button', { name: 'Salvar' }))
  await screen.findByText('Alterado: Geladeira')
  expect(calls.at(-1)).toEqual({ method: 'PATCH', path: '/api/setup/card_installment/7', body: { name: 'Geladeira nova' } })
  await userEvent.click(within(installments).getByRole('button', { name: 'Encerrar Geladeira' }))
  await screen.findByText('Encerrado: Geladeira')
  expect(calls.at(-1)).toEqual({ method: 'POST', path: '/api/setup/card_installment/7/close', body: undefined })
})

test('edits the limit on credit cards only', async () => {
  await section()
  const accounts = screen.getByRole('region', { name: /^Contas/ })
  await userEvent.click(within(accounts).getByRole('button', { name: 'Editar Conta conjunta' }))
  expect(within(accounts).queryByLabelText(/^Limite/)).toBeNull()
  await userEvent.click(within(accounts).getByRole('button', { name: 'Editar Cartão Marcio' }))
  const form = within(within(accounts).getByRole('form', { name: 'Editar Cartão Marcio' }))
  expect(form.getByLabelText(/^Limite/)).toHaveProperty('value', '8.000,00')
  await userEvent.clear(form.getByLabelText(/^Limite/))
  await userEvent.type(form.getByLabelText(/^Limite/), '9.500,00')
  await userEvent.click(form.getByRole('button', { name: 'Salvar' }))
  await screen.findByText('Alterado: Cartão Marcio')
  expect(calls.at(-1)).toEqual({ method: 'PATCH', path: '/api/setup/account/4', body: { amountCents: 950000 } })
})
