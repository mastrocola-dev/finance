import { currentMonth } from './format.ts'

export type AppSearch = { month?: string; member?: string }

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

export const parseSearch = (search: Record<string, unknown>): AppSearch => {
  const month = typeof search.month === 'string' && monthPattern.test(search.month) ? search.month : undefined
  const member = typeof search.member === 'string' && search.member.trim() ? search.member.trim() : undefined
  return { ...(month && { month }), ...(member && { member }) }
}

export const monthOf = (search: AppSearch, now = new Date()) => search.month ?? currentMonth(now).slice(0, 7)

export const shiftMonth = (month: string, by: number) => {
  const [year = 0, number = 1] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + by, 1))
  return date.toISOString().slice(0, 7)
}

export const firstDay = (month: string) => `${month}-01`
