import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'

const money = (cents: number) => ({ cents: String(cents), brl: '' })

const reserves = [{ id: '1', name: 'Reserva de emergência', account: 'Poupança', balance: money(1800000), target: money(3000000), missing: money(1200000), progressPercent: '60.0' }]

let goals: Record<string, unknown>[] = []
let posts: unknown[] = []
let refusal: { status: number; error: string } | undefined

const fetch = vi.fn(async (input: Request) => {
  const path = new URL(input.url).pathname
  if (input.method === 'POST' && path === '/api/goals') {
    const body = (await input.json()) as { name: string; target_cents: number; due_on: string; reserve?: string }
    posts.push(body)
    if (refusal) return Response.json({ error: refusal.error }, { status: refusal.status })
    const goal = { id: String(goals.length + 1), name: body.name, reserve: body.reserve ?? null, target: money(body.target_cents), saved: money(0), missing: money(body.target_cents), progressPercent: '0.0', dueOn: body.due_on }
    goals = [...goals, goal]
    return Response.json(goal, { status: 201 })
  }
  if (path === '/api/reserves') return Response.json(reserves)
  if (path === '/api/goals') return Response.json(goals)
  if (path === '/api/debts') return Response.json([])
  if (path === '/api/net-worth') return Response.json({ reserves: money(1800000), goals: money(0), debts: money(0), netWorth: money(1800000) })
  if (path === '/api/members') return Response.json([{ id: '1', name: 'Marcio', sharePercent: 50 }])
  if (path === '/api/decisions') return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-27T12:00:00-03:00'))
  localStorage.setItem('finance.member', 'Marcio')
  goals = []
  posts = []
  refusal = undefined
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

const open = async () => {
  render(<App history={createMemoryHistory({ initialEntries: ['/patrimonio'] })} fetch={fetch} />)
  await screen.findByRole('heading', { name: 'Reserva de emergência' })
  await userEvent.click(screen.getByRole('button', { name: '+ Nova meta' }))
  return screen.getByRole('form', { name: 'Nova meta' })
}

const fill = async (form: HTMLElement, name: string) => {
  await userEvent.type(within(form).getByLabelText('Nome'), name)
  await userEvent.type(within(form).getByLabelText('Alvo'), '12.000,00')
  fireEvent.change(within(form).getByLabelText('Prazo (mês)'), { target: { value: '2027-07' } })
}

test('opens the form with focus on the name and closes it on cancel', async () => {
  const form = await open()
  expect(document.activeElement).toBe(within(form).getByLabelText('Nome'))
  expect(within(form).getByRole('option', { name: 'Reserva de emergência' })).toBeTruthy()
  await userEvent.click(within(form).getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('form', { name: 'Nova meta' })).toBeNull()
  expect(screen.getByRole('button', { name: '+ Nova meta' })).toBeTruthy()
})

test('shows validation messages and posts nothing', async () => {
  const form = await open()
  await userEvent.type(within(form).getByLabelText('Alvo'), '0')
  await userEvent.click(within(form).getByRole('button', { name: 'Criar meta' }))
  const alert = await within(form).findByRole('alert')
  expect(alert.textContent).toContain('Informe o nome da meta.')
  expect(alert.textContent).toContain('Informe um alvo maior que zero')
  expect(alert.textContent).toContain('Informe o mês do prazo.')
  expect(within(form).getByLabelText('Nome').getAttribute('aria-invalid')).toBe('true')
  expect(posts).toEqual([])
})

test('creates the goal, closes the form and shows it in the list', async () => {
  const form = await open()
  await fill(form, 'Viagem a Lisboa')
  await userEvent.selectOptions(within(form).getByLabelText('Reserva (opcional)'), 'Reserva de emergência')
  await userEvent.click(within(form).getByRole('button', { name: 'Criar meta' }))
  expect(await screen.findByText('Meta criada: Viagem a Lisboa')).toBeTruthy()
  expect(posts).toEqual([{ name: 'Viagem a Lisboa', target_cents: 1200000, due_on: '2027-07-01', reserve: 'Reserva de emergência' }])
  expect(await screen.findByRole('heading', { name: 'Viagem a Lisboa' })).toBeTruthy()
  expect(screen.queryByRole('form', { name: 'Nova meta' })).toBeNull()
})

test('keeps the form open with the API refusal in Portuguese', async () => {
  refusal = { status: 422, error: 'goal Viagem already exists' }
  const form = await open()
  await fill(form, 'Viagem')
  await userEvent.click(within(form).getByRole('button', { name: 'Criar meta' }))
  expect((await within(form).findByRole('alert')).textContent).toBe('Já existe uma meta chamada Viagem.')
  expect(within(form).getByLabelText('Nome')).toHaveProperty('value', 'Viagem')
})
