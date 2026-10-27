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

export const isStaleIdentity = async (response: Response) => {
  if (response.status !== 403) return false
  const body = await response
    .clone()
    .json()
    .catch(() => undefined)
  return body?.error === 'unknown member'
}
