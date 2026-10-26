import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { unwrap } from '../query/client.ts'
import { type Batch, isExtracting, runtimePollMs } from './model.ts'

export const pollMs = 1000

export const useImports = () => {
  const { api } = useIdentity()
  return useQuery({
    queryKey: ['imports'],
    queryFn: async () => unwrap(await api.GET('/api/imports')),
    refetchInterval: (query) => (query.state.data?.some(isExtracting) ? pollMs : false),
  })
}

export const useRuntime = () => {
  const { api } = useIdentity()
  return useQuery({
    queryKey: ['imports', 'runtime'],
    queryFn: async () => unwrap(await api.GET('/api/imports/runtime')),
    refetchInterval: (query) => (query.state.data?.ready === false ? runtimePollMs : false),
  })
}

const refresh = (queryClient: ReturnType<typeof useQueryClient>) => Promise.all(['imports', 'audit'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))

export const useUpload = () => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) =>
      unwrap(
        await api.POST('/api/imports', {
          params: { query: { consent: 'true' }, header: { 'x-file-name': encodeURIComponent(file.name) } },
          headers: { 'content-type': 'application/octet-stream' },
          body: new Uint8Array(await file.arrayBuffer()) as unknown as string,
          bodySerializer: (body) => body,
        }),
      ),
    onSuccess: (batch) => queryClient.setQueryData<Batch[]>(['imports'], (batches) => [batch, ...(batches ?? []).filter(({ id }) => id !== batch.id)]),
    onSettled: () => refresh(queryClient),
  })
}

export const useClose = () => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['import-close'],
    mutationFn: async (batch: Batch) => unwrap(await api.POST('/api/imports/{id}/close', { params: { path: { id: batch.id } } })),
    onSettled: () => refresh(queryClient),
  })
}

export const useRetry = () => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['import-retry'],
    mutationFn: async (batch: Batch) => unwrap(await api.POST('/api/imports/{id}/retry', { params: { path: { id: batch.id } } })),
    onSuccess: (batch) => {
      queryClient.setQueryData(['imports', batch.id], batch)
      queryClient.setQueryData<Batch[]>(['imports'], (batches) => batches?.map((item) => (item.id === batch.id ? batch : item)))
    },
    onSettled: () => refresh(queryClient),
  })
}
