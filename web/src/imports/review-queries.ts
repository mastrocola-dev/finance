import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from '../query/client.ts'
import { type Batch, isExtracting } from './model.ts'
import { pollMs } from './queries.ts'
import type { Decision, Question } from './review-model.ts'

export const useBatch = (id: string) => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['imports', id],
    queryFn: async () => {
      const before = queryClient.getQueryData<Batch>(['imports', id])
      const batch = unwrap(await api.GET('/api/imports/{id}', { params: { path: { id } } }))
      if (before && isExtracting(before) && !isExtracting(batch)) for (const part of ['candidates', 'questions']) await queryClient.invalidateQueries({ queryKey: ['imports', id, part] })
      return batch
    },
    refetchInterval: (query) => (query.state.data && isExtracting(query.state.data) ? pollMs : false),
  })
}

export const useCandidates = (id: string, enabled: boolean) => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['imports', id, 'candidates'], enabled, queryFn: async () => unwrap(await api.GET('/api/imports/{id}/candidates', { params: { path: { id } } })) })
}

export const useQuestions = (id: string, enabled: boolean) => {
  const { api } = useIdentity()
  return useQuery({ queryKey: ['imports', id, 'questions'], enabled, queryFn: async () => unwrap(await api.GET('/api/imports/{id}/questions', { params: { path: { id } } })) })
}

const refresh = (queryClient: ReturnType<typeof useQueryClient>) => Promise.all(['imports', 'audit'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))

export const useAnswer = (id: string) => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['import-review', id],
    scope: { id: `import-review-${id}` },
    mutationFn: async ({ question, answer }: { question: Question; answer: string }) => unwrap(await api.POST('/api/imports/{id}/questions/{question}/answer', { params: { path: { id, question: question.id } }, body: { answer } })),
    onSettled: () => refresh(queryClient),
  })
}

export const useDecide = (id: string) => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['import-review', id],
    scope: { id: `import-review-${id}` },
    mutationFn: async ({ ids, decision }: { ids: string[]; decision: Decision }) => {
      const options = { params: { path: { id } }, body: { ids } }
      return unwrap(decision === 'accept' ? await api.POST('/api/imports/{id}/candidates/accept', options) : await api.POST('/api/imports/{id}/candidates/reject', options))
    },
    onSettled: () => refresh(queryClient),
  })
}

export const useEdit = (id: string) => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['import-review', id],
    scope: { id: `import-review-${id}` },
    mutationFn: async ({ candidate, payload }: { candidate: string; payload: Record<string, unknown> }) => unwrap(await api.PATCH('/api/imports/{id}/candidates/{candidate}', { params: { path: { id, candidate } }, body: { payload } })),
    onSettled: () => refresh(queryClient),
  })
}
