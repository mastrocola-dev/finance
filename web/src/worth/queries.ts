import { useQuery } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from '../query/client.ts'

export const useDebts = () => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['debts'], queryFn: async () => unwrap(await api.GET('/api/debts')) })
}

export const useSavings = () => {
  const { api } = useIdentity()
  return useQuery({
    queryKey: ['savings'],
    queryFn: async () => {
      const [reserves, goals] = await Promise.all([api.GET('/api/reserves'), api.GET('/api/goals')])
      return { reserves: unwrap(reserves), goals: unwrap(goals) }
    },
  })
}

export const useNetWorth = () => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['net-worth'], queryFn: async () => unwrap(await api.GET('/api/net-worth')) })
}
