import { useQuery } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from '../query/client.ts'

export const useEntries = (month: string, member: string | undefined, enabled = true) => {
  const { api } = useIdentity()
  return useQuery({
    queryKey: ['entries', 'list', month, member ?? 'all'],
    enabled,
    queryFn: async () => unwrap(await api.GET('/api/months/{month}/entries', { params: { path: { month }, query: member ? { member } : {} } })),
  })
}
