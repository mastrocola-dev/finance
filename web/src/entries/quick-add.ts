import * as z from 'zod'

const brl = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/
const plain = /^\d+(\.\d{1,2})?$/

export const parseBrl = (text: string) => {
  const value = text.replace(/R\$|\s/g, '')
  const [whole, fraction = ''] = brl.test(value) ? value.replaceAll('.', '').split(',') : plain.test(value) ? value.split('.') : []
  if (whole === undefined) return undefined
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export const quickEntry = z.object({
  direction: z.enum(['income', 'expense']),
  description: z.string().trim().min(1, 'Informe a descrição.'),
  amount: z.string().refine((text) => (parseBrl(text) ?? 0n) > 0n, 'Informe um valor maior que zero, como 84,90.'),
  category: z.string().min(1, 'Escolha a categoria.'),
  account: z.string(),
  member: z.string(),
})

export type QuickEntry = z.input<typeof quickEntry>

export const dueOnFor = (month: string, today: string) => (today.startsWith(month) ? today : `${month}-01`)

export const toNewEntry = (values: QuickEntry, month: string, today: string) => ({
  month,
  due_on: dueOnFor(month, today),
  description: values.description.trim(),
  direction: values.direction,
  amount_cents: Number(parseBrl(values.amount)),
  category: values.category,
  account: values.account || undefined,
  member: values.member,
})
