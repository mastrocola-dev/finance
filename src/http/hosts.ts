export const listOf = (value: string | undefined, fallback: string[]) => {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : fallback
}
