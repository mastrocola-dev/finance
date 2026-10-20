import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import { type Api, createApi } from '../api/client.ts'
import { readIdentity, storeIdentity } from './identity.ts'

type Identity = { member: string | undefined; choose: (member: string | undefined) => void; api: Api }

const IdentityContext = createContext<Identity | undefined>(undefined)

export const IdentityProvider = ({ children, fetch }: { children: ReactNode; fetch?: typeof globalThis.fetch }) => {
  const [member, setMember] = useState(readIdentity)
  const api = useMemo(() => createApi({ member, fetch }), [member, fetch])

  const choose = (next: string | undefined) => {
    storeIdentity(next)
    setMember(next)
  }

  return <IdentityContext value={{ member, choose, api }}>{children}</IdentityContext>
}

export const useIdentity = () => {
  const identity = useContext(IdentityContext)
  if (!identity) throw new Error('useIdentity outside IdentityProvider')
  return identity
}
