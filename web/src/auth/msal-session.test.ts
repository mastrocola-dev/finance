import { beforeEach, expect, test, vi } from 'vitest'

const msal = vi.hoisted(() => ({
  options: undefined as unknown,
  accounts: [] as { username: string }[],
  redirected: null as { account: { username: string } } | null,
  silent: vi.fn(),
  loginRedirect: vi.fn(async () => {}),
  logoutRedirect: vi.fn(async () => {}),
}))

vi.mock('@azure/msal-browser', () => {
  class InteractionRequiredAuthError extends Error {}
  class PublicClientApplication {
    active: { username: string } | null = null
    constructor(options: unknown) {
      msal.options = options
    }
    initialize = async () => {}
    handleRedirectPromise = async () => msal.redirected
    setActiveAccount = (account: { username: string }) => {
      this.active = account
    }
    getActiveAccount = () => this.active
    getAllAccounts = () => msal.accounts
    acquireTokenSilent = msal.silent
    loginRedirect = msal.loginRedirect
    logoutRedirect = msal.logoutRedirect
  }
  return { InteractionRequiredAuthError, PublicClientApplication }
})

const { InteractionRequiredAuthError } = await import('@azure/msal-browser')
const { msalSession } = await import('./msal-session.ts')

const config = { mode: 'entra', clientId: 'client', authority: 'https://caixa.ciamlogin.com/', scope: 'api://finance/access' } as const

beforeEach(() => {
  msal.accounts = []
  msal.redirected = null
  vi.clearAllMocks()
})

test('starts signed out and redirects to sign in with the API scope', async () => {
  const session = await msalSession(config, 'https://caixa.example')
  expect(msal.options).toEqual({ auth: { clientId: 'client', authority: 'https://caixa.ciamlogin.com/', knownAuthorities: ['caixa.ciamlogin.com'], redirectUri: 'https://caixa.example', postLogoutRedirectUri: 'https://caixa.example' }, cache: { cacheLocation: 'localStorage' } })
  expect(session.signedIn()).toBe(false)
  expect(await session.token()).toBeUndefined()
  await session.signIn()
  expect(msal.loginRedirect).toHaveBeenCalledWith({ scopes: ['api://finance/access'], prompt: 'select_account' })
})

test('keeps the account from the redirect and asks for tokens silently', async () => {
  msal.redirected = { account: { username: 'marcio@example.com' } }
  msal.silent.mockResolvedValueOnce({ accessToken: 'token' })
  const session = await msalSession(config, 'https://caixa.example')
  expect(session.signedIn()).toBe(true)
  expect(await session.token()).toBe('token')
  expect(msal.silent).toHaveBeenCalledWith({ scopes: ['api://finance/access'], account: { username: 'marcio@example.com' } })
  await session.signOut()
  expect(msal.logoutRedirect).toHaveBeenCalledWith({ account: { username: 'marcio@example.com' } })
})

test('a token that needs interaction ends the session, other failures surface', async () => {
  msal.accounts = [{ username: 'gabriela@example.com' }]
  const session = await msalSession(config, 'https://caixa.example')
  msal.silent.mockRejectedValueOnce(new InteractionRequiredAuthError('interaction_required', 'login needed'))
  expect(await session.token()).toBeUndefined()
  msal.silent.mockRejectedValueOnce(new Error('network'))
  await expect(session.token()).rejects.toThrow('network')
})
