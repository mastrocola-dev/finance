const key = 'finance.member'

export const readIdentity = () => {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

export const storeIdentity = (member: string | undefined) => {
  try {
    if (member) localStorage.setItem(key, member)
    else localStorage.removeItem(key)
  } catch {}
}
