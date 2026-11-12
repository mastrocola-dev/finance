import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from '../query/client.ts'
import type { AuditFilter } from './model.ts'

export const useAuditCounts = () => {
  const { api, member } = useIdentity()
  return useQuery({ queryKey: ['audit', 'counts', member], enabled: Boolean(member), queryFn: async () => unwrap(await api.GET('/api/audit', { params: { query: { limit: 1 } } })) })
}

export const useAuditTimeline = (filter: AuditFilter, limit = 50) => {
  const { api, member } = useIdentity()
  return useInfiniteQuery({
    queryKey: ['audit', 'timeline', filter.key, limit, member],
    enabled: Boolean(member),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrap(await api.GET('/api/audit', { params: { query: { ...filter.query, ...(pageParam && { before: pageParam }), limit } } })),
    getNextPageParam: (page) => page.next ?? undefined,
  })
}
