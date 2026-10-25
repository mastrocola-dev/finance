import { parseBrl } from '../entries/quick-add.ts'
import { formatBrl } from '../lib/format.ts'
import type { Candidate, Kind } from './review-model.ts'

export type Names = 'members' | 'accounts' | 'categories' | 'reserves'

type Type = 'text' | 'money' | 'balance' | 'date' | 'day' | 'count' | 'paid' | 'percent' | 'flag' | 'lastFour' | 'choice'

export type Field = { key: string; label: string; type: Type; optional?: boolean; options?: Record<string, string>; names?: Names }

export type Values = Record<string, string>

const directions = { expense: 'Despesa', income: 'Receita' }
const accountKinds = { checking: 'Conta corrente', savings: 'Poupança', credit_card: 'Cartão', investment: 'Investimento', cash: 'Dinheiro' }

const member: Field = { key: 'member', label: 'Quem', type: 'text', optional: true, names: 'members' }
const account: Field = { key: 'account', label: 'Conta', type: 'text', optional: true, names: 'accounts' }
const category: Field = { key: 'category', label: 'Categoria', type: 'text', names: 'categories' }
const startsOn: Field = { key: 'startsOn', label: 'Início', type: 'date' }
const endsOn: Field = { key: 'endsOn', label: 'Fim', type: 'date', optional: true }
const dayOfMonth: Field = { key: 'dayOfMonth', label: 'Dia do mês', type: 'day' }

export const fieldsOf: Record<Kind, Field[]> = {
  entry: [
    { key: 'description', label: 'Descrição', type: 'text' },
    { key: 'direction', label: 'Tipo', type: 'choice', options: directions },
    { key: 'amountCents', label: 'Valor', type: 'money' },
    { key: 'date', label: 'Data', type: 'date' },
    category,
    account,
    member,
    { key: 'installmentNumber', label: 'Parcela', type: 'count', optional: true },
    { key: 'installmentTotal', label: 'De quantas', type: 'count', optional: true },
    { key: 'paid', label: 'Já pago', type: 'flag' },
  ],
  income: [{ key: 'description', label: 'Descrição', type: 'text' }, { key: 'amountCents', label: 'Valor mensal', type: 'money' }, dayOfMonth, startsOn, endsOn, { ...category, optional: true }, account, member],
  recurring_expense: [{ key: 'description', label: 'Descrição', type: 'text' }, { key: 'amountCents', label: 'Valor mensal', type: 'money' }, dayOfMonth, startsOn, endsOn, { key: 'installmentsTotal', label: 'Parcelas', type: 'count', optional: true }, category, account, member],
  debt: [
    { key: 'creditor', label: 'Credor', type: 'text' },
    { key: 'description', label: 'Descrição', type: 'text' },
    { key: 'principalCents', label: 'Valor original', type: 'money' },
    { key: 'balanceCents', label: 'Saldo devedor', type: 'balance' },
    { key: 'monthlyRatePercent', label: 'Juros ao mês (%)', type: 'percent', optional: true },
    { key: 'installmentCents', label: 'Parcela', type: 'money', optional: true },
    { key: 'installmentsTotal', label: 'Parcelas', type: 'count', optional: true },
    { key: 'installmentsPaid', label: 'Parcelas pagas', type: 'paid', optional: true },
    startsOn,
    account,
    member,
  ],
  account: [{ key: 'nickname', label: 'Apelido', type: 'text' }, { key: 'institution', label: 'Instituição', type: 'text' }, { key: 'lastFour', label: 'Últimos 4 dígitos', type: 'lastFour' }, { key: 'kind', label: 'Tipo', type: 'choice', options: accountKinds }, member],
  category: [
    { key: 'name', label: 'Nome', type: 'text' },
    { key: 'kind', label: 'Tipo', type: 'choice', options: directions },
  ],
  reserve: [{ key: 'name', label: 'Nome', type: 'text' }, { key: 'balanceCents', label: 'Saldo', type: 'balance' }, { key: 'targetCents', label: 'Meta', type: 'money', optional: true }, account],
  goal: [
    { key: 'name', label: 'Nome', type: 'text' },
    { key: 'targetCents', label: 'Meta', type: 'money' },
    { key: 'savedCents', label: 'Guardado', type: 'balance' },
    { key: 'dueOn', label: 'Prazo', type: 'date', optional: true },
    { key: 'reserve', label: 'Reserva', type: 'text', optional: true, names: 'reserves' },
  ],
}

const money = new Set<Type>(['money', 'balance'])

const shown = (field: Field, value: unknown) => {
  if (field.options) return typeof value === 'string' && Object.hasOwn(field.options, value) ? value : (Object.keys(field.options)[0] ?? '')
  if (value === undefined || value === null) return field.type === 'flag' ? 'false' : ''
  if (money.has(field.type) && typeof value === 'number') return formatBrl(String(value)).replace('R$', '').trim()
  if (field.key === 'member' && value === 'joint') return 'Conjunto'
  return String(value)
}

export const toValues = ({ kind, payload }: Candidate): Values => {
  const installment = (payload.installment ?? {}) as Record<string, unknown>
  const flat: Record<string, unknown> = { ...payload, installmentNumber: installment.number, installmentTotal: installment.total }
  return Object.fromEntries(fieldsOf[kind].map((field) => [field.key, shown(field, flat[field.key])]))
}

const digitRun = /\d{5,}/
const integer = /^\d+$/
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const limit = 100_000_000_000n

const messages = {
  required: 'Preencha este campo.',
  digits: 'Sem sequências de 5 ou mais dígitos.',
  money: 'Informe um valor como 84,90.',
  positive: 'Informe um valor maior que zero.',
  date: 'Informe uma data válida.',
  day: 'Informe um dia de 1 a 31.',
  count: 'Informe um número inteiro de 1 a 600.',
  paid: 'Informe um número inteiro de 0 a 600.',
  percent: 'Informe um percentual de 0 a 100.',
  lastFour: 'Informe só os últimos 4 dígitos.',
  long: 'Use até 200 caracteres.',
  high: 'Valor alto demais.',
}

type Parsed = { value?: unknown; error?: string }

const between = (text: string, low: number, high: number, error: string): Parsed => {
  const value = Number(text)
  return integer.test(text) && value >= low && value <= high ? { value } : { error }
}

const parse = (field: Field, raw: string): Parsed => {
  const text = raw.trim()
  if (field.type === 'flag') return { value: raw === 'true' }
  if (!text) return field.optional ? {} : { error: messages.required }
  if (field.type === 'text') {
    if (field.key === 'member' && text.toLowerCase() === 'conjunto') return { value: 'joint' }
    if (digitRun.test(text)) return { error: messages.digits }
    return text.length > 200 ? { error: messages.long } : { value: text }
  }
  if (money.has(field.type)) {
    const cents = parseBrl(text)
    if (cents === undefined) return { error: messages.money }
    if (field.type === 'money' && cents === 0n) return { error: messages.positive }
    if (cents > limit) return { error: messages.high }
    return { value: Number(cents) }
  }
  if (field.type === 'date') return isoDate.test(text) && !Number.isNaN(Date.parse(text)) ? { value: text } : { error: messages.date }
  if (field.type === 'day') return between(text, 1, 31, messages.day)
  if (field.type === 'count') return between(text, 1, 600, messages.count)
  if (field.type === 'paid') return between(text, 0, 600, messages.paid)
  if (field.type === 'lastFour') return /^\d{4}$/.test(text) ? { value: text } : { error: messages.lastFour }
  if (field.type === 'percent') {
    const value = Number(text.replace(',', '.'))
    return Number.isFinite(value) && value >= 0 && value <= 100 ? { value } : { error: messages.percent }
  }
  return field.options && Object.hasOwn(field.options, text) ? { value: text } : { error: messages.required }
}

export type Errors = Record<string, string>

const crossChecks = (kind: Kind, payload: Record<string, unknown>, parts: Record<string, unknown>): Errors => {
  const errors: Errors = {}
  if (typeof payload.startsOn === 'string' && typeof payload.endsOn === 'string' && payload.endsOn < payload.startsOn) errors.endsOn = 'O fim vem antes do início.'
  if (kind === 'debt' && typeof payload.installmentsPaid === 'number' && typeof payload.installmentsTotal === 'number' && payload.installmentsPaid > payload.installmentsTotal) errors.installmentsPaid = 'Mais parcelas pagas do que o total.'
  const { installmentNumber: number, installmentTotal: total } = parts
  if ((number === undefined) !== (total === undefined)) errors[number === undefined ? 'installmentNumber' : 'installmentTotal'] = 'Preencha a parcela e o total juntos.'
  else if (typeof number === 'number' && typeof total === 'number' && number > total) errors.installmentNumber = 'A parcela passa do total.'
  return errors
}

export const toPayload = (kind: Kind, values: Values) => {
  const payload: Record<string, unknown> = {}
  const parts: Record<string, unknown> = {}
  const errors: Errors = {}
  for (const field of fieldsOf[kind]) {
    const { value, error } = parse(field, values[field.key] ?? '')
    if (error) errors[field.key] = error
    else if (field.key.startsWith('installment') && kind === 'entry') parts[field.key] = value
    else if (value !== undefined) payload[field.key] = value
  }
  if (typeof parts.installmentNumber === 'number' && typeof parts.installmentTotal === 'number') payload.installment = { number: parts.installmentNumber, total: parts.installmentTotal }
  const all = { ...crossChecks(kind, payload, parts), ...errors }
  return Object.keys(all).length > 0 ? { errors: all } : { payload }
}

const serverMessages: [RegExp, string][] = [
  [/five or more digits/, messages.digits],
  [/endsOn is before startsOn/, 'O fim vem antes do início.'],
  [/installmentsPaid exceeds/, 'Mais parcelas pagas do que o total.'],
  [/installment number exceeds/, 'A parcela passa do total.'],
]

const fieldOf = (kind: Kind, path: string, message: string) => {
  if (path === 'installment.total') return 'installmentTotal'
  if (path.startsWith('installment')) return 'installmentNumber'
  if (/endsOn is before/.test(message)) return 'endsOn'
  if (/installmentsPaid exceeds/.test(message)) return 'installmentsPaid'
  return fieldsOf[kind].some((field) => field.key === path) ? path : 'form'
}

export const serverErrors = (kind: Kind, message: string): Errors => {
  const list = message.replace(/^invalid \w+ payload: /, '')
  if (list === message) return { form: 'Não foi possível salvar. Tente de novo.' }
  const errors: Errors = {}
  for (const issue of list.split('; ')) {
    const [path = '', ...rest] = issue.split(': ')
    const text = rest.join(': ')
    const key = fieldOf(kind, path, text)
    errors[key] ??= serverMessages.find(([pattern]) => pattern.test(text))?.[1] ?? `Valor recusado: ${text}`
  }
  return errors
}
