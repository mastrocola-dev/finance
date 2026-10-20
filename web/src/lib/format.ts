const zone = 'America/Sao_Paulo'

const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

const month = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const utc = (date: string) => {
  const [year = 0, monthNumber = 1, dayNumber = 1] = date.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1, dayNumber))
}

export const formatBrl = (cents: bigint | string) => {
  const value = BigInt(cents)
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  const reais = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const centavos = (absolute % 100n).toString().padStart(2, '0')
  return `${sign}R$ ${reais},${centavos}`
}

export const formatDay = (date: string) => day.format(utc(date))

export const formatMonth = (date: string) => month.format(utc(date))

export const formatMonthTitle = (date: string) => {
  const text = formatMonth(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const today = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(now)

export const currentMonth = (now = new Date()) => `${today(now).slice(0, 7)}-01`
