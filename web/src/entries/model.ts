import { formatBrl } from '../lib/format.ts'
import type { Entry } from '../overview/model.ts'

export type Filters = { text: string; direction?: Entry['direction']; category?: string; open: boolean }

export const noFilters: Filters = { text: '', open: false }

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const digits = (text: string) => text.replace(/\D/g, '')

export const matches = (entry: Entry, text: string) => {
  const query = plain(text.trim())
  if (!query) return true
  if (/^[\d\s.,r$]+$/.test(query) && digits(query)) return entry.amount.cents.includes(digits(query))
  return plain([entry.description, entry.category, entry.account ?? '', entry.member ?? 'Conjunto'].join(' ')).includes(query)
}

const newestFirst = (a: Entry, b: Entry) => b.dueOn.localeCompare(a.dueOn) || Number(BigInt(b.id) - BigInt(a.id))

export const filterEntries = (entries: Entry[], { text, direction, category, open }: Filters) => entries.filter((entry) => (!direction || entry.direction === direction) && (!category || entry.category === category) && (!open || entry.state !== 'paid') && matches(entry, text)).sort(newestFirst)

export const isFiltered = (filters: Filters) => Boolean(filters.text.trim() || filters.direction || filters.category || filters.open)

export const totalsOf = (entries: Entry[]) =>
  entries.reduce(
    (totals, entry) => {
      totals[entry.direction] += BigInt(entry.amount.cents)
      return totals
    },
    { income: 0n, expense: 0n },
  )

export const categoriesOf = (entries: Entry[]) => [...new Set(entries.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

export const originLabels: Record<Entry['origin'], string> = { manual: 'Manual', claude: 'Claude', import: 'Importado', forecast: 'Previsto' }

const stateLabels: Record<Entry['direction'], Record<Entry['state'], string>> = {
  income: { paid: 'Recebida', pending: 'A receber', late: 'Recebimento atrasado' },
  expense: { paid: 'Paga', pending: 'Pendente', late: 'Atrasada' },
}

export const stateLabel = (entry: Entry) => stateLabels[entry.direction][entry.state]

export const openLabel = (direction?: Entry['direction']) => (direction === 'income' ? 'A receber e atrasadas' : 'Pendentes e atrasadas')

export const installmentOf = ({ installmentNumber, installmentsTotal }: Entry) => (installmentNumber ? (installmentsTotal ? `${installmentNumber}/${installmentsTotal}` : `parcela ${installmentNumber}`) : undefined)

export const signedAmount = (entry: Entry) => `${entry.direction === 'income' ? '+' : '−'} ${formatBrl(entry.amount.cents)}`
