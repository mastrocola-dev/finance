export const listOf = (value: string | undefined, fallback: string[]) => {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : fallback
}

export const originHostnamesOf = (value: string | undefined, fallback: string[]) => listOf(value, fallback).map((item) => (/^https?:\/\//i.test(item) ? new URL(item).hostname : item))
