import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'
import type { Decision } from './model.ts'

const decision = (id: string, title: string, changes: Partial<Decision> = {}): Decision => ({
  id,
  title,
  description: '',
  amount: null,
  status: 'proposed',
  proposedBy: 'Gabriela',
  origin: 'manual',
  confirmedBy: [],
  awaiting: ['Marcio', 'Gabriela'],
  createdAt: '2026-10-18T00:02:00.000Z',
  closedAt: null,
  ...changes,
})

const seed = () => [
  decision('4', 'Prepay six installments', { origin: 'claude', proposedBy: 'Marcio', amount: { cents: '840000', brl: '' }, description: 'Use the reserve above target.' }),
  decision('3', 'Upgrade internet', { confirmedBy: ['Gabriela'], awaiting: ['Marcio'] }),
  decision('2', 'Raise the reserve', { status: 'confirmed', confirmedBy: ['Gabriela', 'Marcio'], awaiting: [], closedAt: '2026-10-12T15:00:00.000Z' }),
  decision('1', 'Another streaming', { status: 'rejected', awaiting: [], closedAt: '2026-10-03T15:00:00.000Z' }),
]

let decisions = seed()
let posts: { path: string; body: unknown }[] = []
let failing: number | undefined

const answer = (id: string | undefined, action: string | undefined) =>
  decisions.map((current) => {
    if (current.id !== id) return current
    if (action === 'confirm') {
      const awaiting = current.awaiting.filter((name) => name !== 'Marcio')
      return { ...current, confirmedBy: [...current.confirmedBy, 'Marcio'], awaiting, ...(awaiting.length === 0 && { status: 'confirmed' as const, closedAt: '2026-10-21T12:00:00.000Z' }) }
    }
    return { ...current, status: action === 'reject' ? ('rejected' as const) : ('withdrawn' as const), awaiting: [], closedAt: '2026-10-21T12:00:00.000Z' }
  })

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  if (input.method === 'POST') {
    const body = input.headers.get('content-type')?.includes('json') ? await input.json() : undefined
    posts.push({ path: url.pathname, body })
    if (failing) return Response.json({ error: 'decision 3 not found or no longer proposed' }, { status: failing })
    if (url.pathname === '/api/decisions') {
      const created = decision('5', (body as { title: string }).title, { proposedBy: 'Marcio' })
      decisions = [created, ...decisions]
      return Response.json(created, { status: 201 })
    }
    const [, id, action] = url.pathname.match(/^\/api\/decisions\/(\d+)\/(confirm|reject|withdraw)$/) ?? []
    decisions = answer(id, action)
    return Response.json(decisions.find((current) => current.id === id))
  }
  if (url.pathname === '/api/members')
    return Response.json([
      { id: '1', name: 'Marcio', sharePercent: 50 },
      { id: '2', name: 'Gabriela', sharePercent: 50 },
    ])
  if (url.pathname === '/api/decisions') {
    const status = url.searchParams.get('status')
    return Response.json(status === 'all' ? decisions : decisions.filter((current) => current.status === status))
  }
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

beforeEach(() => localStorage.setItem('finance.member', 'Marcio'))

afterEach(() => {
  cleanup()
  localStorage.clear()
  decisions = seed()
  posts = []
  failing = undefined
})

const start = () => render(<App history={createMemoryHistory({ initialEntries: ['/decisoes'] })} fetch={fetch} />)

const card = async (name: string) => screen.findByRole('article', { name })

test('shows pending decisions with who confirmed and the history', async () => {
  start()
  const prepay = await card('Prepay six installments')
  expect(within(prepay).getByText('via Claude')).toBeTruthy()
  expect(within(prepay).getByText('R$ 8.400,00')).toBeTruthy()
  expect(within(prepay).getByText('Proposta por Marcio via Claude · 17/10, 21:02')).toBeTruthy()
  expect(within(prepay).getByRole('button', { name: 'Retirar proposta' })).toBeTruthy()
  const internet = await card('Upgrade internet')
  const people = within(within(internet).getByRole('list', { name: 'Confirmações' })).getAllByRole('listitem')
  expect(people.map((person) => person.textContent)).toEqual(['MMarcioAguardando', 'GGabrielaConfirmou'])
  expect(within(internet).getByRole('button', { name: 'Rejeitar' })).toBeTruthy()
  const history = screen.getByRole('region', { name: 'Histórico' })
  expect(await within(history).findByText('Raise the reserve')).toBeTruthy()
  expect(within(history).getByText('Confirmada')).toBeTruthy()
  expect(within(history).getByText('03/10')).toBeTruthy()
})

test('confirming the last awaited member moves the decision to the history', async () => {
  start()
  await userEvent.click(within(await card('Upgrade internet')).getByRole('button', { name: 'Confirmar' }))
  expect(posts.map(({ path }) => path)).toEqual(['/api/decisions/3/confirm'])
  expect(await screen.findByText('Upgrade internet confirmada pelos dois')).toBeTruthy()
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Upgrade internet' })).toBeNull())
  expect(await within(screen.getByRole('region', { name: 'Histórico' })).findByText('Upgrade internet')).toBeTruthy()
})

test('confirming while others are awaited keeps the decision pending', async () => {
  start()
  const prepay = await card('Prepay six installments')
  await userEvent.click(within(prepay).getByRole('button', { name: 'Confirmar' }))
  expect(await screen.findByText('Confirmação registrada: Prepay six installments')).toBeTruthy()
  await waitFor(() => expect(within(prepay).queryByRole('button', { name: 'Confirmar' })).toBeNull())
  expect(within(prepay).getByRole('button', { name: 'Retirar proposta' })).toBeTruthy()
})

test('rejects and withdraws as the right member', async () => {
  decisions = decisions.map((current) => (current.id === '3' ? { ...current, status: 'confirmed' as const } : current))
  start()
  await userEvent.click(within(await card('Prepay six installments')).getByRole('button', { name: 'Retirar proposta' }))
  expect(await screen.findByText('Proposta retirada: Prepay six installments')).toBeTruthy()
  const history = screen.getByRole('region', { name: 'Histórico' })
  expect(await within(history).findByText('Retirada')).toBeTruthy()
  expect(await screen.findByText('Nenhuma decisão pendente')).toBeTruthy()
})

test('explains a refused answer and refreshes the list', async () => {
  start()
  failing = 422
  await userEvent.click(within(await card('Upgrade internet')).getByRole('button', { name: 'Rejeitar' }))
  expect(await screen.findByText('Não foi possível rejeitar: a decisão mudou. A lista foi atualizada.')).toBeTruthy()
})

test('proposes a decision with an optional amount', async () => {
  start()
  const form = await screen.findByRole('form', { name: 'Propor decisão' })
  await userEvent.click(within(form).getByRole('button', { name: 'Propor' }))
  expect(within(form).getByRole('alert').textContent).toContain('Informe o que vocês vão decidir.')
  await userEvent.type(within(form).getByLabelText('O que decidir'), 'New sofa')
  await userEvent.type(within(form).getByLabelText('Valor (opcional)'), '2.500')
  await userEvent.click(within(form).getByRole('button', { name: 'Propor' }))
  expect(posts).toEqual([{ path: '/api/decisions', body: { title: 'New sofa', amount_cents: 250000 } }])
  expect(await card('New sofa')).toBeTruthy()
  expect((within(form).getByLabelText('O que decidir') as HTMLInputElement).value).toBe('')
})

test('asks who you are before answering or proposing', async () => {
  localStorage.clear()
  start()
  const internet = await card('Upgrade internet')
  expect(within(internet).queryByRole('button')).toBeNull()
  expect(within(internet).getByText('Escolha quem você é para responder.')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Propor' }) as HTMLButtonElement).disabled).toBe(true)
})
