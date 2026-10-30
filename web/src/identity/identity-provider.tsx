import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { type Api, createApi } from '../api/client.ts'
import type { Session } from '../auth/session.ts'
import { type Ended, SignInScreen } from '../auth/sign-in-screen.tsx'
import { ApiFailure, unwrap } from '../query/client.ts'
import { isStaleIdentity, readIdentity, storeIdentity } from './identity.ts'

type Identity = { member: string | undefined; api: Api; choose?: (member: string | undefined) => void; signOut?: () => void }

type ProviderProps = { children: ReactNode; fetch?: typeof globalThis.fetch }

const IdentityContext = createContext<Identity | undefined>(undefined)

const LocalIdentity = ({ children, fetch }: ProviderProps) => {
  const [member, setMember] = useState(readIdentity)
  const choose = useCallback((next: string | undefined) => {
    storeIdentity(next)
    setMember(next)
  }, [])

  const api = useMemo(() => {
    const client = createApi({ member, fetch })
    client.use({
      onResponse: async ({ response }) => {
        if (member && (await isStaleIdentity(response))) choose(undefined)
      },
    })
    return client
  }, [member, fetch, choose])

  return <IdentityContext value={{ member, choose, api }}>{children}</IdentityContext>
}

const SessionIdentity = ({ children, fetch, session }: ProviderProps & { session: Session }) => {
  const queryClient = useQueryClient()
  const [ended, setEnded] = useState<Ended | undefined>(session.failed ? 'failed' : undefined)
  const [signedOut, setSignedOut] = useState(false)
  const forget = useCallback(() => {
    queryClient.clear()
    void globalThis.caches?.delete('api')
  }, [queryClient])
  const end = useCallback(
    (reason?: Ended) => {
      if (reason) setEnded(reason)
      setSignedOut(true)
      forget()
    },
    [forget],
  )

  const api = useMemo(() => {
    const client = createApi({ fetch })
    client.use({
      onResponse: async ({ response }) => {
        if (response.status === 401) end(queryClient.getQueryData(['me']) ? 'expired' : undefined)
        else if (await isStaleIdentity(response)) end('unknown')
      },
    })
    return client
  }, [fetch, end, queryClient])

  const { data: me, isError } = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.GET('/api/me')), enabled: !signedOut, retry: (count, error) => count < 1 && !(error instanceof ApiFailure && error.status < 500) })
  const signOut = useCallback(() => {
    forget()
    void session.signOut()
  }, [session, forget])
  const signIn = useCallback(() => session.signIn(`${globalThis.location.pathname}${globalThis.location.search}`), [session])

  if (signedOut) return <SignInScreen signIn={signIn} ended={ended} />
  if (!me && !isError) return null
  return <IdentityContext value={{ member: me?.name, api, signOut }}>{children}</IdentityContext>
}

export const IdentityProvider = ({ session, ...props }: ProviderProps & { session?: Session }) => (session ? <SessionIdentity session={session} {...props} /> : <LocalIdentity {...props} />)

export const useIdentity = () => {
  const identity = useContext(IdentityContext)
  if (!identity) throw new Error('useIdentity outside IdentityProvider')
  return identity
}
