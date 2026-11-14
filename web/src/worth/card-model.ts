import type { components } from '../api/schema.ts'
import { formatBrl, formatMonth, formatMonthShort } from '../lib/format.ts'
import { shiftMonth } from '../lib/search.ts'
import { formatSignedBrl } from './model.ts'

export type Card = components['schemas']['Card']

export type ReleaseBar = { month: string; label: string; cents: number }

export type LimitView = { percent: number; over: boolean; label: string; available: string }

export type CardView = {
  id: string
  name: string
  meta: string
  committed: string
  limit: LimitView | null
  release: string | null
  bars: ReleaseBar[]
  chartLabel: string
}

const monthName = (month: string, current: string) => {
  const text = formatMonth(month)
  return month.slice(0, 4) === current.slice(0, 4) ? text.replace(/ de \d{4}$/, '') : text
}

const limitOf = (card: Card): LimitView | null => {
  if (!card.limit || !card.available) return null
  const limit = BigInt(card.limit.cents)
  const committed = BigInt(card.committed.cents)
  const available = BigInt(card.available.cents)
  const over = available < 0n
  const percent = limit > 0n ? Math.min(100, Number((committed * 100n) / limit)) : 100
  return {
    percent,
    over,
    label: `${formatBrl(committed)} de ${formatBrl(limit)} do limite em uso${over ? ', acima do limite' : ''}`,
    available: formatSignedBrl(available),
  }
}

export const releaseBars = (card: Card, month: string, count = 12): ReleaseBar[] =>
  Array.from({ length: count }, (_, index) => {
    const at = `${shiftMonth(month, index)}-01`
    const release = card.releases.find((item) => item.month === at)
    return { month: at, label: formatMonthShort(at), cents: release ? Number(release.amount.cents) : 0 }
  })

export const cardView = (card: Card, month: string): CardView => {
  const current = `${month}-01`
  const first = card.releases.find((release) => BigInt(release.amount.cents) > 0n)
  const bars = releaseBars(card, month)
  const freed = bars.filter((bar) => bar.cents > 0)
  return {
    id: card.id,
    name: card.nickname,
    meta: [card.institution, `final ${card.lastFour}`, card.member ?? 'Conjunto'].join(' · '),
    committed: formatBrl(card.committed.cents),
    limit: limitOf(card),
    release: first ? `Libera ${formatBrl(first.amount.cents)} em ${monthName(first.month, current)}` : null,
    bars,
    chartLabel: freed.length === 0 ? 'Nenhuma liberação nos próximos 12 meses' : `Liberações nos próximos 12 meses: ${freed.map((bar) => `${formatBrl(BigInt(bar.cents))} em ${monthName(bar.month, current)}`).join(', ')}`,
  }
}
