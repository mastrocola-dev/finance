export const formatBrl = (cents: bigint) => {
  const sign = cents < 0n ? '-' : ''
  const absolute = cents < 0n ? -cents : cents
  const reais = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const centavos = (absolute % 100n).toString().padStart(2, '0')
  return `${sign}R$ ${reais},${centavos}`
}

export const money = (cents: bigint) => ({ cents: cents.toString(), brl: formatBrl(cents) })
