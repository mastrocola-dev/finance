export type Session = {
  failed: boolean
  signIn: (to: string) => void
  signOut: () => Promise<void>
}

const failedParam = 'entrada'

export const cookieSession = (location: Location = globalThis.location, history: History = globalThis.history, fetch: typeof globalThis.fetch = globalThis.fetch): Session => {
  const url = new URL(location.href)
  const failed = url.searchParams.get(failedParam) === 'falhou'
  if (failed) {
    url.searchParams.delete(failedParam)
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
  return {
    failed,
    signIn: (to) => location.assign(`/auth/login?${new URLSearchParams({ to })}`),
    signOut: async () => {
      const answer = await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
      const body = answer?.ok ? await answer.json().catch(() => ({})) : {}
      location.assign(typeof body.logout_url === 'string' ? body.logout_url : '/')
    },
  }
}
