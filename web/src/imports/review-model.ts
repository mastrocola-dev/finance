import type { components } from '../api/schema.ts'
import { formatBrl, formatMonth } from '../lib/format.ts'
import { ApiFailure } from '../query/client.ts'

export type Candidate = components['schemas']['ImportCandidate']
export type Question = components['schemas']['ImportQuestion']
export type Kind = Candidate['kind']
export type Check = Candidate['checks'][number]
export type Decision = 'accept' | 'reject'

export const kindOrder: Kind[] = ['entry', 'income', 'recurring_expense', 'debt', 'account', 'category', 'reserve', 'goal']

export const kindLabels: Record<Kind, string> = {
  entry: 'Lançamentos',
  income: 'Receitas fixas',
  recurring_expense: 'Despesas fixas',
  debt: 'Dívidas',
  account: 'Contas',
  category: 'Categorias',
  reserve: 'Reservas',
  goal: 'Metas',
}

export const statusLabels: Record<Candidate['status'], string> = { pending: 'Pendente', accepted: 'Aceito', rejected: 'Rejeitado', edited: 'Editado' }

export const statusTones: Record<Candidate['status'], string> = {
  pending: 'bg-pending-soft text-pending',
  accepted: 'bg-ok-soft text-ok',
  rejected: 'bg-late-soft text-late',
  edited: 'bg-accent-soft text-accent',
}

const unique: Kind[] = ['account', 'category', 'reserve', 'goal']

export const isBlocking = (kind: Kind, check: Check) => check.code === 'invalid' || check.code.startsWith('unknown_') || (unique.includes(kind) && check.code.startsWith('duplicate_'))

export const hasBlocking = (candidate: Candidate) => candidate.checks.some((check) => isBlocking(candidate.kind, check))

export const blocked = (candidate: Candidate) => candidate.status !== 'rejected' && hasBlocking(candidate)

const unknownLabels: Record<string, string> = { member: 'Pessoa desconhecida', account: 'Conta desconhecida', category: 'Categoria desconhecida', reserve: 'Reserva desconhecida' }

const cents = /expected (-?\d+), found (-?\d+)$/

export const checkText = ({ code, detail }: Check) => {
  if (code === 'invalid') return `Dados incompletos${detail ? `: ${detail}` : ''}`
  if (code === 'low_confidence') return `Leitura incerta (${Math.round(Number(detail ?? 0) * 100)}%)`
  if (code === 'duplicate_in_file') return `Repetido no arquivo${detail ? ` (${detail})` : ''}`
  if (code === 'duplicate_in_ledger') return 'Já existe no livro'
  if (code.startsWith('unknown_')) return `${unknownLabels[code.slice(8)] ?? 'Nome desconhecido'}: ${detail ?? ''}`
  if (code === 'total_mismatch' && detail) {
    const [, expected = '0', found = '0'] = detail.match(cents) ?? []
    const source = detail.match(/^(.*): (?:income|expense|net)\b/)?.[1] ?? detail
    return `Total de ${source} não confere: impresso ${formatBrl(expected)}, lido ${formatBrl(found)}`
  }
  return detail ? `${code}: ${detail}` : code
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)

const integer = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : undefined)

export const monthOfCandidate = (candidate: Candidate) => {
  const { date, startsOn, dueOn } = candidate.payload
  const day = text(date) ?? text(startsOn) ?? text(dueOn)
  return day && /^\d{4}-\d{2}/.test(day) ? `${day.slice(0, 7)}-01` : undefined
}

export const titleOf = ({ kind, payload }: Candidate) => {
  if (kind === 'debt') return [text(payload.creditor), text(payload.description)].filter(Boolean).join(' · ') || 'Dívida sem nome'
  return text(payload.description) ?? text(payload.nickname) ?? text(payload.name) ?? 'Sem descrição'
}

export const amountOf = ({ kind, payload }: Candidate) => {
  const value = integer(payload.amountCents) ?? integer(payload.balanceCents) ?? integer(payload.targetCents) ?? integer(payload.principalCents)
  if (value === undefined) return undefined
  return { text: formatBrl(String(value)), income: kind === 'income' || payload.direction === 'income' }
}

const directions: Record<string, string> = { income: 'Receita', expense: 'Despesa' }

const accountKinds: Record<string, string> = { checking: 'Conta corrente', savings: 'Poupança', credit_card: 'Cartão', investment: 'Investimento', cash: 'Dinheiro' }

const day = (value: unknown) => {
  const date = text(value)
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : undefined
}

const memberText = (value: unknown) => (value === 'joint' ? 'Conjunto' : text(value))

export const detailsOf = ({ kind, payload }: Candidate) => {
  const installment = payload.installment as { number?: unknown; total?: unknown } | undefined
  const parts: unknown[] = {
    entry: [day(payload.date), directions[String(payload.direction)], text(payload.category), text(payload.account), memberText(payload.member), installment && `${integer(installment.number)}/${integer(installment.total)}`, payload.paid === true ? 'Pago' : undefined],
    income: [integer(payload.dayOfMonth) && `Dia ${payload.dayOfMonth}`, text(payload.category), text(payload.account), memberText(payload.member)],
    recurring_expense: [integer(payload.dayOfMonth) && `Dia ${payload.dayOfMonth}`, text(payload.category), text(payload.account), memberText(payload.member), integer(payload.installmentsTotal) && `${payload.installmentsTotal} parcelas`],
    debt: [integer(payload.installmentsTotal) && `${integer(payload.installmentsPaid) ?? 0}/${payload.installmentsTotal} parcelas`, memberText(payload.member)],
    account: [text(payload.institution), text(payload.lastFour) && `final ${payload.lastFour}`, accountKinds[String(payload.kind)], memberText(payload.member)],
    category: [directions[String(payload.kind)]],
    reserve: [integer(payload.targetCents) && `Meta ${formatBrl(String(payload.targetCents))}`],
    goal: [day(payload.dueOn) && `Até ${day(payload.dueOn)}`, integer(payload.savedCents) !== undefined ? `Guardado ${formatBrl(String(payload.savedCents))}` : undefined],
  }[kind]
  return parts.filter((part): part is string => typeof part === 'string' && part !== '')
}

export type Group = { key: string; kind: Kind; month?: string; title: string; candidates: Candidate[] }

const flaggedFirst = (left: Candidate, right: Candidate) => Number(blocked(right)) - Number(blocked(left)) || Number(right.checks.length > 0) - Number(left.checks.length > 0) || Number(left.id) - Number(right.id)

export const groupCandidates = (candidates: Candidate[]): Group[] => {
  const groups = new Map<string, Group>()
  for (const candidate of candidates) {
    const month = monthOfCandidate(candidate)
    const key = `${candidate.kind}-${month ?? 'none'}`
    const group = groups.get(key) ?? { key, kind: candidate.kind, month, title: month ? `${kindLabels[candidate.kind]} · ${formatMonth(month)}` : kindLabels[candidate.kind], candidates: [] }
    group.candidates.push(candidate)
    groups.set(key, group)
  }
  const needs = (group: Group) => Number(group.candidates.some(blocked))
  return [...groups.values()].map((group) => ({ ...group, candidates: group.candidates.sort(flaggedFirst) })).sort((left, right) => needs(right) - needs(left) || kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind) || (left.month ?? '').localeCompare(right.month ?? ''))
}

export const acceptable = (group: Group) => group.candidates.filter((candidate) => candidate.status === 'pending' && !blocked(candidate)).map((candidate) => candidate.id)

export const reviewCounts = (candidates: Candidate[]) => ({
  pending: candidates.filter((candidate) => candidate.status === 'pending').length,
  accepted: candidates.filter((candidate) => candidate.status === 'accepted' || candidate.status === 'edited').length,
  rejected: candidates.filter((candidate) => candidate.status === 'rejected').length,
  blocked: candidates.filter(blocked).length,
})

export const confidenceText = (confidence: string) => `${Math.round(Number(confidence) * 100)}%`

export const reviewFailure = (error: Error) => {
  if (!(error instanceof ApiFailure)) return 'Não foi possível salvar. Tente de novo.'
  if (error.status === 401) return 'Escolha quem você é para revisar.'
  if (error.status === 409) return 'A importação ainda está sendo lida. Espere terminar.'
  if (/invalid payload/.test(error.message)) return 'Este item tem dados incompletos. Corrija antes de aceitar.'
  if (/already answered/.test(error.message)) return 'Esta pergunta já foi respondida. A lista foi atualizada.'
  if (/not open for review/.test(error.message)) return 'Esta importação não está mais em revisão. A página foi atualizada.'
  if (/answer must have/.test(error.message)) return 'A resposta precisa ter de 1 a 200 caracteres.'
  return 'Não foi possível salvar. Tente de novo.'
}

const chosen = (candidate: Candidate) => candidate.status === 'accepted' || candidate.status === 'edited'

export type Ledger = { accounts: string[]; categories: { name: string; direction: string }[]; reserves: string[] }

type Reference = { kind: 'account' | 'category' | 'reserve'; name: string; direction?: string }

type Missing = Reference & { status: 'pending' | 'rejected' }

export type Unstaged = { candidate: Candidate; references: Missing[] }

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()

const matches = (left: Reference, right: Reference) => left.kind === right.kind && same(left.name, right.name) && left.direction === right.direction

const categoryDirection = ({ kind, payload }: Candidate) => (kind === 'entry' ? String(payload.direction) : kind === 'income' ? 'income' : 'expense')

const referencesOf = (candidate: Candidate) => {
  const { account, category, reserve } = candidate.payload
  const found: Reference[] = []
  if (text(account)) found.push({ kind: 'account', name: String(account).trim() })
  if (text(category)) found.push({ kind: 'category', name: String(category).trim(), direction: categoryDirection(candidate) })
  if (text(reserve)) found.push({ kind: 'reserve', name: String(reserve).trim() })
  return found
}

const stagedAs = ({ kind, payload }: Candidate): Reference | undefined => {
  if (kind === 'account' && text(payload.nickname)) return { kind, name: String(payload.nickname) }
  if (kind === 'category' && text(payload.name)) return { kind, name: String(payload.name), direction: String(payload.kind) }
  if (kind === 'reserve' && text(payload.name)) return { kind, name: String(payload.name) }
}

const inLedger = (ledger: Ledger, reference: Reference) =>
  reference.kind === 'account' ? ledger.accounts.some((name) => same(name, reference.name)) : reference.kind === 'reserve' ? ledger.reserves.some((name) => same(name, reference.name)) : ledger.categories.some((item) => matches(reference, { kind: 'category', name: item.name, direction: item.direction }))

const unstagedOf = (candidates: Candidate[], ready: Candidate[], ledger: Ledger): Unstaged[] => {
  const staged = candidates.flatMap((candidate) => {
    const reference = stagedAs(candidate)
    return reference ? [{ ...reference, status: candidate.status }] : []
  })
  return ready
    .map((candidate) => ({
      candidate,
      references: referencesOf(candidate).flatMap((reference): Missing[] => {
        const creators = staged.filter((item) => matches(item, reference))
        if (inLedger(ledger, reference) || creators.length === 0 || creators.some((item) => item.status === 'accepted' || item.status === 'edited')) return []
        return [{ ...reference, status: creators.some((item) => item.status === 'pending') ? 'pending' : 'rejected' }]
      }),
    }))
    .filter((item) => item.references.length > 0)
}

export const commitPlan = (candidates: Candidate[], ledger?: Ledger) => {
  const ready = candidates.filter((candidate) => chosen(candidate) && !hasBlocking(candidate))
  return {
    ready,
    blocked: candidates.filter((candidate) => chosen(candidate) && hasBlocking(candidate)),
    unstaged: ledger ? unstagedOf(candidates, ready, ledger) : [],
    left: candidates.filter((candidate) => !chosen(candidate)).length,
  }
}

const referenceLabels: Record<Reference['kind'], string> = { account: 'Conta', category: 'Categoria', reserve: 'Reserva' }

export const unstagedText = ({ kind, name, status }: Missing) => `${referenceLabels[kind]} ${name} está num item ${status === 'rejected' ? 'rejeitado' : 'pendente'}`

export type CommitPlan = ReturnType<typeof commitPlan>

export const blockingTexts = (candidate: Candidate) => candidate.checks.filter((check) => isBlocking(candidate.kind, check)).map(checkText)

export const commitFailure = (error: Error) => {
  if (!(error instanceof ApiFailure)) return 'Não foi possível gravar. Tente de novo.'
  if (error.status === 401) return 'Escolha quem você é para gravar.'
  if (error.status === 409) return 'A importação ainda está sendo lida. Espere terminar.'
  if (/have failed checks/.test(error.message)) return 'Há itens aceitos com bloqueio. Edite, responda ou rejeite antes de gravar.'
  if (/no accepted candidates/.test(error.message)) return 'Aceite ao menos um item antes de gravar.'
  if (/is not verified|not open for review/.test(error.message)) return 'Esta importação não está mais em revisão. A página foi atualizada.'
  const unknown = error.message.match(/^unknown (?:member|account|reserve|income category|expense category) (.+)$/)?.[1]
  if (unknown) return `${unknown} não existe no livro nem entre os itens aceitos. Aceite o item que cria esse nome ou edite os itens que o usam.`
  const lonely = error.message.match(/^income (.+) needs a member$/)?.[1]
  if (lonely) return `A receita ${lonely} precisa de uma pessoa. Edite o item e escolha quem recebe.`
  return 'Não foi possível gravar. Tente de novo.'
}
