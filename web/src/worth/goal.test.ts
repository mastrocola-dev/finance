import { expect, test } from 'vitest'
import { goalFailure, goalForm, toNewGoal } from './goal.ts'

const parse = (values: Record<string, string>) => goalForm('2026-10').safeParse({ name: 'Viagem', target: '12.000,00', due: '2027-07', reserve: '', ...values })

const messages = (values: Record<string, string>) => {
  const result = parse(values)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

test('accepts a goal and converts it to the API body', () => {
  expect(parse({}).success).toBe(true)
  expect(toNewGoal({ name: ' Viagem ', target: 'R$ 12.000,50', due: '2027-07', reserve: '' })).toEqual({ name: 'Viagem', target_cents: 1200050, due_on: '2027-07-01', reserve: undefined })
  expect(toNewGoal({ name: 'Carro', target: '5000', due: '2026-10', reserve: 'Reserva de emergência' }).reserve).toBe('Reserva de emergência')
})

test('refuses a blank name, a target that is not positive and a missing or past month', () => {
  expect(messages({ name: '  ' })).toEqual(['Informe o nome da meta.'])
  expect(messages({ target: '0' })).toEqual(['Informe um alvo maior que zero, como 12.000,00.'])
  expect(messages({ target: 'muito' })).toEqual(['Informe um alvo maior que zero, como 12.000,00.'])
  expect(messages({ due: '' })).toContain('Informe o mês do prazo.')
  expect(messages({ due: '2026-09' })).toEqual(['O prazo não pode estar no passado.'])
})

test('explains API failures in Portuguese', () => {
  expect(goalFailure(422, 'goal Viagem already exists', 'Viagem')).toBe('Já existe uma meta chamada Viagem.')
  expect(goalFailure(422, 'unknown reserve Caixa', 'Viagem')).toBe('A reserva escolhida não existe mais. Escolha outra.')
  expect(goalFailure(422, 'invalid goal payload', 'Viagem')).toBe('A meta não foi aceita. Confira os campos.')
  expect(goalFailure(401, 'who', 'Viagem')).toBe('Escolha quem você é para criar uma meta.')
  expect(goalFailure(500, 'boom', 'Viagem')).toBe('Não foi possível criar a meta. Tente de novo.')
})
