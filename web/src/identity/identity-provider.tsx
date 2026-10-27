import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { type Api, createApi } from '../api/client.ts'
import { isStaleIdentity, readIdentity, storeIdentity } from './identity.ts'

type Identity = { member: string | undefined; choose: (member: string | undefined) => void; api: Api }

const IdentityContext = createContext<Identity | undefined>(undefined)

export const IdentityProvider = ({ children, fetch }: { children: ReactNode; fetch?: typeof globalThis.fetch }) => {
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

export const useIdentity = () => {
  const identity = useContext(IdentityContext)
  if (!identity) throw new Error('useIdentity outside IdentityProvider')
  return identity
}
