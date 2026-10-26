import { expect, test } from 'vitest'
import { serverErrors, toPayload, toValues } from './edit-model.ts'
import type { Candidate } from './review-model.ts'

const candidate = (kind: Candidate['kind'], payload: Record<string, unknown>): Candidate => ({ id: '1', kind, source: 'A1', chunk: null, confidence: '0.9', status: 'pending', payload, checks: [], recordId: null })

test('entry values round trip into the same payload', () => {
  const payload = { date: '2026-10-10', description: 'Aluguel', direction: 'expense', amountCents: 150000, category: 'Moradia', member: 'joint', paid: true, installment: { number: 2, total: 10 } }
  const values = toValues(candidate('entry', payload))
  expect(values).toMatchObject({ amountCents: '1.500,00', member: 'Conjunto', paid: 'true', installmentNumber: '2', installmentTotal: '10', account: '' })
  expect(toPayload('entry', values)).toEqual({ payload })
})

test('optional fields left empty are omitted and money accepts plain decimals', () => {
  const values = toValues(candidate('reserve', { name: 'Reserva', balanceCents: 0 }))
  expect(values).toEqual({ name: 'Reserva', balanceCents: '0,00', targetCents: '', account: '' })
  expect(toValues(candidate('category', { name: 'Pets', kind: 'other' })).kind).toBe('expense')
  expect(toPayload('reserve', { ...values, targetCents: '2500.5' })).toEqual({ payload: { name: 'Reserva', balanceCents: 0, targetCents: 250050 } })
})

test('client checks explain each field in Portuguese', () => {
  const values = toValues(candidate('entry', { description: 'Conta 123456', direction: 'expense', amountCents: 0, date: '2026-13-40', category: '', paid: false, installment: { number: 3, total: 2 } }))
  expect(toPayload('entry', { ...values, amountCents: '0' }).errors).toEqual({
    description: 'Sem sequências de 5 ou mais dígitos.',
    amountCents: 'Informe um valor maior que zero.',
    date: 'Informe uma data válida.',
    category: 'Preencha este campo.',
    installmentNumber: 'A parcela passa do total.',
  })
  expect(toPayload('entry', { ...values, description: 'Luz', amountCents: '10', date: '2026-10-01', category: 'Casa', installmentNumber: '', installmentTotal: '2' }).errors).toEqual({ installmentNumber: 'Preencha a parcela e o total juntos.' })
})

test('cross checks of recurring items and debts', () => {
  const income = toValues(candidate('income', { description: 'Salário', amountCents: 900000, dayOfMonth: 5, startsOn: '2026-10-01', endsOn: '2026-01-01' }))
  expect(toPayload('income', income).errors).toEqual({ endsOn: 'O fim vem antes do início.' })
  const debt = toValues(candidate('debt', { creditor: 'Banco', description: 'Carro', principalCents: 100, balanceCents: 50, installmentsTotal: 2, installmentsPaid: 3, startsOn: '2026-01-01', monthlyRatePercent: 1.5 }))
  expect(toPayload('debt', debt).errors).toEqual({ installmentsPaid: 'Mais parcelas pagas do que o total.' })
  expect(toPayload('debt', { ...debt, installmentsPaid: '1', monthlyRatePercent: '1,2' }).payload).toMatchObject({ monthlyRatePercent: 1.2, installmentsPaid: 1 })
  expect(toPayload('account', { nickname: 'Cartão', institution: 'Banco', lastFour: '12345', kind: 'toString', member: '' }).errors).toEqual({ lastFour: 'Informe só os últimos 4 dígitos.', kind: 'Preencha este campo.' })
})

test('server issues map to fields', () => {
  expect(serverErrors('entry', 'invalid entry payload: description: runs of five or more digits are not allowed; installment: installment number exceeds the total')).toEqual({ description: 'Sem sequências de 5 ou mais dígitos.', installmentNumber: 'A parcela passa do total.' })
  expect(serverErrors('income', 'invalid income payload: payload: endsOn is before startsOn')).toEqual({ endsOn: 'O fim vem antes do início.' })
  expect(serverErrors('goal', 'invalid goal payload: owner: Unrecognized key')).toEqual({ form: 'Valor recusado: Unrecognized key' })
  expect(serverErrors('goal', 'boom')).toEqual({ form: 'Não foi possível salvar. Tente de novo.' })
})
