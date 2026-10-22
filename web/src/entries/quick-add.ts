import * as z from 'zod'

const brl = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/
const plain = /^\d+(\.\d{1,2})?$/
const isoDate = /^\d{4}-\d{2}-\d{2}$/

export const parseBrl = (text: string) => {
  const value = text.replace(/R\$|\s/g, '')
  const [whole, fraction = ''] = brl.test(value) ? value.replaceAll('.', '').split(',') : plain.test(value) ? value.split('.') : []
  if (whole === undefined) return undefined
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export const lastDayOf = (month: string) => {
  const [year, number] = month.split('-')
  return `${month}-${String(new Date(Date.UTC(Number(year), Number(number), 0)).getUTCDate()).padStart(2, '0')}`
}

export const quickEntry = (month: string, today: string) =>
  z
    .object({
      direction: z.enum(['income', 'expense']),
      description: z.string().trim().min(1, 'Informe a descrição.'),
      amount: z.string().refine((text) => (parseBrl(text) ?? 0n) > 0n, 'Informe um valor maior que zero, como 84,90.'),
      category: z.string().min(1, 'Escolha a categoria.'),
      account: z.string(),
      member: z.string(),
      date: z.string().refine((date) => isoDate.test(date) && date >= `${month}-01` && date <= lastDayOf(month), 'Escolha uma data deste mês.'),
      paid: z.boolean(),
    })
    .refine(({ paid, date }) => !paid || date <= today, { path: ['paid'], message: 'Uma data futura ainda não pode estar paga.' })

export type QuickEntry = z.input<ReturnType<typeof quickEntry>>

export const dueOnFor = (month: string, today: string) => (today.startsWith(month) ? today : `${month}-01`)

export const paidByDefault = (date: string, today: string) => date <= today

export const toNewEntry = (values: QuickEntry, month: string) => ({
  month,
  due_on: values.date,
  description: values.description.trim(),
  direction: values.direction,
  amount_cents: Number(parseBrl(values.amount)),
  category: values.category,
  account: values.account || undefined,
  member: values.member,
  paid_on: values.paid ? values.date : undefined,
})
