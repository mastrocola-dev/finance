import type { components } from '../api/schema.ts'
import { currentMonth, formatBrl, formatMonthShort } from '../lib/format.ts'
import { ApiFailure } from '../query/client.ts'

export type ApiRecord = components['schemas']['SetupRecord']
export type SetupKind = ApiRecord['kind']
export type SetupRecord = ApiRecord

export const setupOrder: Exclude<SetupKind, 'card_installment'>[] = ['account', 'category', 'income', 'recurring_expense', 'variable_expense', 'debt', 'reserve', 'goal']

export const setupLabels: Record<SetupKind, { one: string; many: string }> = {
  income: { one: 'Receita fixa', many: 'Receitas fixas' },
  recurring_expense: { one: 'Despesa fixa', many: 'Despesas fixas' },
  variable_expense: { one: 'Despesa variável', many: 'Despesas variáveis' },
  card_installment: { one: 'Parcelamento', many: 'Parcelamentos' },
  debt: { one: 'Dívida', many: 'Dívidas' },
  account: { one: 'Conta', many: 'Contas' },
  category: { one: 'Categoria', many: 'Categorias' },
  reserve: { one: 'Reserva', many: 'Reservas' },
  goal: { one: 'Meta', many: 'Metas' },
}

const accountKinds: Record<string, string> = { checking: 'Conta corrente', savings: 'Poupança', credit_card: 'Cartão', investment: 'Investimento', cash: 'Dinheiro' }

const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7))

const addMonths = (date: string, count: number) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + count, 1)).toISOString().slice(0, 10)

const monthYear = (date: string) => `${formatMonthShort(date)}/${date.slice(0, 4)}`

export const installmentOf = (record: SetupRecord, month = currentMonth()) => {
  const [, total = '0', firstBill = month] = record.detail?.match(/^(\d+) installments from (\d{4}-\d{2}-\d{2})$/) ?? []
  const count = Number(total)
  return { total: count, current: monthsBetween(firstBill, month) + 1, firstBill, lastBill: addMonths(firstBill, count - 1) }
}

const installmentParts = (record: SetupRecord) => {
  const { total, current, firstBill, lastBill } = installmentOf(record)
  const position = current < 1 ? `primeira parcela em ${monthYear(firstBill)}` : current > total ? `${total} parcelas, terminou` : `parcela ${current} de ${total}`
  return [`${money(record)} · ${position}`, `termina ${monthYear(lastBill)}`, record.category, who(record)]
}

export const isCard = (record: SetupRecord) => record.kind === 'account' && (record.detail ?? '').split(' · ').at(-2) === 'credit_card'

const money = (record: SetupRecord) => (record.amount ? formatBrl(record.amount.cents) : undefined)

const who = (record: SetupRecord) => record.member ?? 'Conjunto'

const parts = (record: SetupRecord): (string | null | undefined)[] => {
  if (record.kind === 'category') return [record.detail === 'income' ? 'Receita' : 'Despesa']
  if (record.kind === 'account') {
    const tokens = (record.detail ?? '').split(' · ')
    const lastFour = tokens.pop()
    const kind = tokens.pop() ?? ''
    return [tokens.join(' · '), accountKinds[kind] ?? kind, `final ${lastFour}`, record.amount && `limite ${money(record)}`, who(record)]
  }
  if (record.kind === 'reserve') return [`Saldo ${money(record)}`, record.account]
  if (record.kind === 'income') return [`${money(record)} por mês`, `dia ${record.day}`, record.member, record.category]
  if (record.kind === 'recurring_expense') return [`${money(record)} por mês`, `dia ${record.day}`, record.category, who(record), record.detail && `${record.detail} parcelas`]
  if (record.kind === 'variable_expense') return [`${money(record)} por mês`, record.category, who(record)]
  if (record.kind === 'card_installment') return installmentParts(record)
  if (record.kind === 'debt') return [record.detail, `saldo ${money(record)}`, who(record)]
  return [`Meta ${money(record)}`, record.detail && `reserva ${record.detail}`]
}

export const describeRecord = (record: SetupRecord) => parts(record).filter(Boolean).join(' · ')

export const groupRecords = (records: ApiRecord[]) => setupOrder.map((kind) => ({ kind, records: records.filter((record) => record.kind === kind) }))

export const cardGroups = (records: ApiRecord[]) => records.filter(isCard).map((card) => ({ card, records: records.filter((record) => record.kind === 'card_installment' && record.account === card.name) }))

const refusals: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/already exists/, () => 'Já existe um cadastro com esse nome.'],
  [/unknown (?:income |expense )?category (.+)/, (match) => `A categoria ${match[1]} não existe ou é do outro tipo.`],
  [/unknown account (.+)/, (match) => `A conta ${match[1]} não existe.`],
  [/unknown member (.+)/, (match) => `${match[1]} não é membro da casa.`],
  [/unknown reserve (.+)/, (match) => `A reserva ${match[1]} não existe.`],
  [/needs a member/, () => 'Escolha quem recebe esta receita.'],
  [/is not a credit card/, () => 'Escolha um cartão de crédito cadastrado.'],
]

export const registerFailure = (error: Error) => {
  if (!(error instanceof ApiFailure)) return 'Não foi possível salvar. Tente de novo.'
  if (error.status === 401) return 'Escolha quem você é para cadastrar.'
  for (const [pattern, text] of refusals) {
    const match = error.message.match(pattern)
    if (match) return text(match)
  }
  return 'Não foi possível salvar. Tente de novo.'
}

export const closeFailure = (error: Error, name: string) => {
  if (error instanceof ApiFailure && error.status === 401) return 'Escolha quem você é para encerrar.'
  if (error instanceof ApiFailure && error.status === 422) return `${name} já estava encerrado. A lista foi atualizada.`
  return `Não foi possível encerrar ${name}. Tente de novo.`
}

type Named = { name: string; direction: string }

const folded = (name: string) => name.trim().toLocaleLowerCase('pt-BR')

export const findCategory = (categories: Named[], name: string, direction: string) => categories.find((category) => category.direction === direction && folded(category.name) === folded(name))
