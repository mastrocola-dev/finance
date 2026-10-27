import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser'
import type { EntraConfig } from './config.ts'
import type { Session } from './session.ts'

export const msalSession = async ({ clientId, authority, scope }: EntraConfig, origin = globalThis.location.origin): Promise<Session> => {
  const msal = new PublicClientApplication({ auth: { clientId, authority, knownAuthorities: [new URL(authority).host], redirectUri: origin, postLogoutRedirectUri: origin }, cache: { cacheLocation: 'localStorage' } })
  await msal.initialize()
  const redirected = await msal.handleRedirectPromise()
  if (redirected?.account) msal.setActiveAccount(redirected.account)
  const account = () => msal.getActiveAccount() ?? msal.getAllAccounts()[0]
  const scopes = [scope]

  return {
    signedIn: () => Boolean(account()),
    signIn: () => msal.loginRedirect({ scopes, prompt: 'select_account' }),
    signOut: () => msal.logoutRedirect({ account: account() }),
    token: async () => {
      const current = account()
      if (!current) return undefined
      try {
        return (await msal.acquireTokenSilent({ scopes, account: current })).accessToken
      } catch (caught) {
        if (caught instanceof InteractionRequiredAuthError) return undefined
        throw caught
      }
    },
  }
}
