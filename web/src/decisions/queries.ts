import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '../api/schema.ts'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from '../query/client.ts'
import type { Answer, Decision } from './model.ts'

export type NewDecision = components['schemas']['ProposeDecisionBody']

export type Reply = { decision: Decision; answer: Answer }

export const useDecisionHistory = () => {
  const { api } = useIdentity()
  return useQuery({
    queryKey: ['decisions', 'history'],
    queryFn: async () => unwrap(await api.GET('/api/decisions', { params: { query: { status: 'all', limit: 30 } } })).filter((decision) => decision.status !== 'proposed'),
  })
}

const refresh = (queryClient: ReturnType<typeof useQueryClient>) => Promise.all(['decisions', 'audit'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))

export const useReply = () => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['decision-reply'],
    mutationFn: async ({ decision, answer }: Reply) => {
      const params = { path: { id: decision.id } }
      if (answer === 'confirm') return unwrap(await api.POST('/api/decisions/{id}/confirm', { params }))
      if (answer === 'reject') return unwrap(await api.POST('/api/decisions/{id}/reject', { params }))
      return unwrap(await api.POST('/api/decisions/{id}/withdraw', { params }))
    },
    onSettled: () => refresh(queryClient),
  })
}

export const usePropose = () => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: NewDecision) => unwrap(await api.POST('/api/decisions', { body })),
    onSuccess: () => refresh(queryClient),
  })
}
