export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const singularWord = (word: string) => {
  if (word.length <= 3 || !word.endsWith('s')) return word
  if (/(oe|ae)s$/.test(word)) return `${word.slice(0, -3)}ao`
  if (word.endsWith('ns')) return `${word.slice(0, -2)}m`
  if (word.length > 4 && /[ae]is$/.test(word)) return `${word.slice(0, -2)}l`
  if (/[rz]es$/.test(word)) return word.slice(0, -2)
  return word.slice(0, -1)
}

export const singular = (value: string) => normalize(value).split(' ').filter(Boolean).map(singularWord).join(' ')

export const distance = (a: string, b: string) => {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (const [i, left] of [...a].entries()) {
    const current = [i + 1]
    for (const [j, right] of [...b].entries()) current.push(Math.min((previous[j + 1] ?? 0) + 1, (current[j] ?? 0) + 1, (previous[j] ?? 0) + Number(left !== right)))
    previous = current
  }
  return previous[b.length] ?? 0
}

const letters = (value: string) => value.replace(/ /g, '').length

const contains = (long: string[], short: string[]) => short.every((word) => long.includes(word))

const partOf = (long: string[], short: string[]) => short.length === 1 && letters(short[0] ?? '') >= 5 && long.some((word) => word !== short[0] && (word.startsWith(short[0] ?? '') || word.endsWith(short[0] ?? '')))

export const score = (reference: string, name: string) => {
  const a = singular(reference)
  const b = singular(name)
  if (!a || !b) return undefined
  if (normalize(reference) === normalize(name)) return 0
  if (a === b) return 1
  const [long, short] = a.length >= b.length ? [a.split(' '), b.split(' ')] : [b.split(' '), a.split(' ')]
  if (contains(long, short)) return 2
  if (partOf(long, short)) return 3
  if (letters(a) >= 5 && letters(b) >= 5 && distance(a, b) <= 2) return 3 + distance(a, b)
  return undefined
}

const initialsOf = (value: string) =>
  normalize(value)
    .split(' ')
    .map((word) => word[0])
    .join('')

const byInitials = (reference: string, names: string[]) => {
  if (!/^\p{Lu}{2,4}$/u.test(reference.trim())) return undefined
  const code = normalize(reference)
  const exact = names.filter((name) => initialsOf(name).length > 1 && initialsOf(name) === code)
  if (exact.length === 1) return exact[0]
  const first = names.filter((name) => initialsOf(name)[0] === code[0])
  return first.length === 1 ? first[0] : undefined
}

export const bestMatch = (reference: string, names: string[], { initials = false } = {}) => {
  const scored = names.flatMap((name) => {
    const found = score(reference, name)
    return found === undefined ? [] : [{ name, score: found }]
  })
  const top = Math.min(...scored.map((item) => item.score))
  const best = [...new Set(scored.filter((item) => item.score === top).map((item) => singular(item.name)))]
  if (best.length === 1) return scored.find((item) => item.score === top)?.name
  if (best.length > 1) return undefined
  return initials ? byInitials(reference, names) : undefined
}
