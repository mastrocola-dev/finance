import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from '../query/client.ts'
import type { AuditFilter } from './model.ts'

export const useAuditCounts = () => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['audit', 'counts'], queryFn: async () => unwrap(await api.GET('/api/audit', { params: { query: { limit: 1 } } })) })
}

export const useAuditTimeline = (filter: AuditFilter, limit = 50) => {
  const { api } = useIdentity()
  return useInfiniteQuery({
    queryKey: ['audit', 'timeline', filter.key, limit],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrap(await api.GET('/api/audit', { params: { query: { ...filter.query, ...(pageParam && { before: pageParam }), limit } } })),
    getNextPageParam: (page) => page.next ?? undefined,
  })
}
