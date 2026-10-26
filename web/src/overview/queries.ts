import { useQuery } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { shiftMonth } from '../lib/search.ts'
import { unwrap } from '../query/client.ts'

export const useMonthEntries = (month: string, member: string | undefined, enabled = true) => {
  const { api } = useIdentity()
  const read = async (month: string) => unwrap(await api.GET('/api/months/{month}/entries', { params: { path: { month }, query: member ? { member } : {} } }))
  return useQuery({
    queryKey: ['entries', 'overview', month, member ?? 'all'],
    enabled,
    queryFn: async () => {
      const [current, previous] = await Promise.all([read(month), read(shiftMonth(month, -1))])
      return { current, previous }
    },
  })
}

export const useMonthFlow = (month: string, member: string | undefined, count = 6) => {
  const { api } = useIdentity()
  return useQuery({
    queryKey: ['entries', 'flow', month, member ?? 'all', count],
    queryFn: () =>
      Promise.all(
        Array.from({ length: count }, (_, index) => shiftMonth(month, index - count + 1)).map(async (month) => ({
          month,
          entries: unwrap(await api.GET('/api/months/{month}/entries', { params: { path: { month }, query: member ? { member } : {} } })),
        })),
      ),
  })
}

export const useMonthSplit = (month: string) => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['split', month], queryFn: async () => unwrap(await api.GET('/api/months/{month}/split', { params: { path: { month } } })) })
}

export const useRecentActivity = (limit = 5) => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['audit', 'recent', limit], queryFn: async () => unwrap(await api.GET('/api/audit', { params: { query: { limit } } })) })
}
