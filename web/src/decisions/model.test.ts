import { expect, test } from 'vitest'
import { answersFor, closedDay, type Decision, peopleOf, proposal, proposalMeta, toNewDecision } from './model.ts'

const decision = (changes: Partial<Decision> = {}): Decision => ({
  id: '1',
  title: 'Upgrade home internet',
  description: '',
  amount: null,
  status: 'proposed',
  proposedBy: 'Gabriela',
  origin: 'manual',
  confirmedBy: ['Gabriela'],
  awaiting: ['Marcio'],
  createdAt: '2026-10-18T00:02:00.000Z',
  closedAt: null,
  ...changes,
})

test('lists people in member order with their confirmation', () => {
  expect(peopleOf(decision(), ['Marcio', 'Gabriela'])).toEqual([
    { name: 'Marcio', confirmed: false },
    { name: 'Gabriela', confirmed: true },
  ])
  expect(peopleOf(decision(), []).map(({ name }) => name)).toEqual(['Gabriela', 'Marcio'])
})

test('offers confirm while awaited, withdraw to the proposer and reject to the others', () => {
  expect(answersFor(decision(), 'Marcio')).toEqual(['confirm', 'reject'])
  expect(answersFor(decision(), 'Gabriela')).toEqual(['withdraw'])
  expect(answersFor(decision({ confirmedBy: [], awaiting: ['Marcio', 'Gabriela'] }), 'Gabriela')).toEqual(['confirm', 'withdraw'])
  expect(answersFor(decision(), undefined)).toEqual([])
  expect(answersFor(decision({ status: 'confirmed', awaiting: [] }), 'Marcio')).toEqual([])
})

test('describes who proposed and when, in Sao Paulo time', () => {
  expect(proposalMeta(decision())).toBe('Proposta por Gabriela · 17/10, 21:02')
  expect(proposalMeta(decision({ origin: 'claude', proposedBy: 'Marcio' }))).toBe('Proposta por Marcio via Claude · 17/10, 21:02')
  expect(closedDay(decision({ closedAt: '2026-10-12T15:00:00.000Z' }))).toBe('12/10')
})

test('validates a proposal and builds the request body', () => {
  expect(proposal.safeParse({ title: ' ', amount: '', description: '' }).success).toBe(false)
  expect(proposal.safeParse({ title: 'Sofa', amount: 'abc', description: '' }).success).toBe(false)
  expect(toNewDecision({ title: ' Sofa ', amount: '', description: ' ' })).toEqual({ title: 'Sofa', description: undefined, amount_cents: undefined })
  expect(toNewDecision({ title: 'Sofa', amount: '1.250,50', description: 'Gray' })).toEqual({ title: 'Sofa', description: 'Gray', amount_cents: 125050 })
})
