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

const useRefresh = () => {
  const queryClient = useQueryClient()
  return () => Promise.all(['entries', 'split', 'audit'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
}

export const useCreateEntry = () => {
  const { api } = useIdentity()
  return useMutation({ mutationFn: async (body: NewEntry) => unwrap(await api.POST('/api/entries', { body })), onSuccess: useRefresh() })
}

export const useCorrectEntry = () => {
  const { api } = useIdentity()
  return useMutation({ mutationFn: async ({ id, body }: { id: string; body: NewEntry }) => unwrap(await api.PUT('/api/entries/{id}', { params: { path: { id } }, body })), onSuccess: useRefresh() })
}

export const useCancelEntry = () => {
  const { api } = useIdentity()
  return useMutation({ mutationFn: async (id: string) => unwrap(await api.POST('/api/entries/{id}/cancel', { params: { path: { id } } })), onSuccess: useRefresh() })
}
