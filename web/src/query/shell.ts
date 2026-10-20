import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
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

export const useSelectedMember = () => {
  const { member } = useSearch({ from: '__root__' })
  const { data: members = [] } = useMembers()
  return members.some(({ name }) => name === member) ? member : undefined
}
