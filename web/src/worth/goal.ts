import * as z from 'zod'
import type { components } from '../api/schema.ts'
import { parseBrl } from '../entries/quick-add.ts'

export type NewGoal = components['schemas']['CreateGoalBody']

export const goalForm = (thisMonth: string) =>
  z.object({
    name: z.string().trim().min(1, 'Informe o nome da meta.').max(120, 'Use um nome com até 120 caracteres.'),
    target: z.string().refine((text) => (parseBrl(text) ?? 0n) > 0n, 'Informe um alvo maior que zero, como 12.000,00.'),
    due: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Informe o mês do prazo.')
      .refine((month) => month >= thisMonth, 'O prazo não pode estar no passado.'),
    reserve: z.string(),
  })

export type GoalForm = z.input<ReturnType<typeof goalForm>>

export const toNewGoal = (values: GoalForm): NewGoal => ({ name: values.name.trim(), target_cents: Number(parseBrl(values.target)), due_on: `${values.due}-01`, reserve: values.reserve || undefined })

export const goalFailure = (status: number | undefined, message: string, name: string) => {
  if (status === 401) return 'Escolha quem você é para criar uma meta.'
  if (status === 422 && /already exists/.test(message)) return `Já existe uma meta chamada ${name}.`
  if (status === 422 && /reserve/.test(message)) return 'A reserva escolhida não existe mais. Escolha outra.'
  if (status === 422) return 'A meta não foi aceita. Confira os campos.'
  return 'Não foi possível criar a meta. Tente de novo.'
}
