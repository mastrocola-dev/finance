import { useQuery } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from './client.ts'

export const useMembers = () => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['members'], queryFn: async () => unwrap(await api.GET('/api/members')) })
}

export const useProposedDecisions = () => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['decisions', 'proposed'], queryFn: async () => unwrap(await api.GET('/api/decisions', { params: { query: { status: 'proposed' } } })) })
}
