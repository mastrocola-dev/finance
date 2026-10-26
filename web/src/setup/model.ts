import type { components } from '../api/schema.ts'
import { formatBrl } from '../lib/format.ts'
import { ApiFailure } from '../query/client.ts'

export type SetupRecord = components['schemas']['SetupRecord']
export type SetupKind = SetupRecord['kind']

export const setupOrder: SetupKind[] = ['income', 'recurring_expense', 'debt', 'account', 'category', 'reserve', 'goal']

export const setupLabels: Record<SetupKind, { one: string; many: string }> = {
  income: { one: 'Receita fixa', many: 'Receitas fixas' },
  recurring_expense: { one: 'Despesa fixa', many: 'Despesas fixas' },
  debt: { one: 'Dívida', many: 'Dívidas' },
  account: { one: 'Conta', many: 'Contas' },
  category: { one: 'Categoria', many: 'Categorias' },
  reserve: { one: 'Reserva', many: 'Reservas' },
  goal: { one: 'Meta', many: 'Metas' },
}

const accountKinds: Record<string, string> = { checking: 'Conta corrente', savings: 'Poupança', credit_card: 'Cartão', investment: 'Investimento', cash: 'Dinheiro' }

const money = (record: SetupRecord) => (record.amount ? formatBrl(record.amount.cents) : undefined)

const who = (record: SetupRecord) => record.member ?? 'Conjunto'

const parts = (record: SetupRecord): (string | null | undefined)[] => {
  if (record.kind === 'category') return [record.detail === 'income' ? 'Receita' : 'Despesa']
  if (record.kind === 'account') {
    const tokens = (record.detail ?? '').split(' · ')
    const lastFour = tokens.pop()
    const kind = tokens.pop() ?? ''
    return [tokens.join(' · '), accountKinds[kind] ?? kind, `final ${lastFour}`, who(record)]
  }
  if (record.kind === 'reserve') return [`Saldo ${money(record)}`, record.account]
  if (record.kind === 'income') return [`${money(record)} por mês`, `dia ${record.day}`, record.member, record.category]
  if (record.kind === 'recurring_expense') return [`${money(record)} por mês`, `dia ${record.day}`, record.category, who(record), record.detail && `${record.detail} parcelas`]
  if (record.kind === 'debt') return [record.detail, `saldo ${money(record)}`, who(record)]
  return [`Meta ${money(record)}`, record.detail && `reserva ${record.detail}`]
}

export const describeRecord = (record: SetupRecord) => parts(record).filter(Boolean).join(' · ')

export const groupRecords = (records: SetupRecord[]) => setupOrder.map((kind) => ({ kind, records: records.filter((record) => record.kind === kind) }))

const refusals: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/already exists/, () => 'Já existe um cadastro com esse nome.'],
  [/unknown (?:income |expense )?category (.+)/, (match) => `A categoria ${match[1]} não existe ou é do outro tipo.`],
  [/unknown account (.+)/, (match) => `A conta ${match[1]} não existe.`],
  [/unknown member (.+)/, (match) => `${match[1]} não é membro da casa.`],
  [/unknown reserve (.+)/, (match) => `A reserva ${match[1]} não existe.`],
  [/needs a member/, () => 'Escolha quem recebe esta receita.'],
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
