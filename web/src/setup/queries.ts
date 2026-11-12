import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from '../query/client.ts'
import type { SetupKind } from './model.ts'

const touched = ['setup', 'categories', 'accounts', 'debts', 'savings', 'net-worth', 'audit']

const useRefresh = () => {
  const queryClient = useQueryClient()
  return () => Promise.all(touched.map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
}

export const useSetup = () => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['setup'], queryFn: async () => unwrap(await api.GET('/api/setup')) })
}

export const useRegister = () => {
  const { api } = useIdentity()
  return useMutation({ mutationFn: async (body: { kind: SetupKind; payload: Record<string, unknown> }) => unwrap(await api.POST('/api/setup', { body })), onSuccess: useRefresh() })
}

export const useCloseRecord = () => {
  const { api } = useIdentity()
  return useMutation({ mutationFn: async ({ kind, id }: { kind: SetupKind; id: string }) => unwrap(await api.POST('/api/setup/{kind}/{id}/close', { params: { path: { kind, id } } })), onSuccess: useRefresh() })
}

export const useEditRecord = () => {
  const { api } = useIdentity()
  return useMutation({
    mutationFn: async ({ kind, id, changes }: { kind: SetupKind; id: string; changes: Record<string, unknown> }) => unwrap(await api.PATCH('/api/setup/{kind}/{id}', { params: { path: { kind, id } }, body: changes })),
    onSuccess: useRefresh(),
  })
}
