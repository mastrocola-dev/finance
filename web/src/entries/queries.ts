import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '../api/schema.ts'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from '../query/client.ts'

export type NewEntry = components['schemas']['CreateEntryBody']

export const useEntries = (month: string, member: string | undefined, enabled = true) => {
  const { api } = useIdentity()
  return useQuery({
    queryKey: ['entries', 'list', month, member ?? 'all'],
    enabled,
    queryFn: async () => unwrap(await api.GET('/api/months/{month}/entries', { params: { path: { month }, query: member ? { member } : {} } })),
  })
}

export const useCategories = () => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['categories'], queryFn: async () => unwrap(await api.GET('/api/categories')) })
}

export const useAccounts = () => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['accounts'], queryFn: async () => unwrap(await api.GET('/api/accounts')) })
}

export const useCreateEntry = () => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: NewEntry) => unwrap(await api.POST('/api/entries', { body })),
    onSuccess: () => Promise.all(['entries', 'split', 'audit'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  })
}
