import { QueryClient } from '@tanstack/react-query'

export class ApiFailure extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const unwrap = <T>({ data, error, response }: { data?: T; error?: unknown; response: Response }) => {
  if (data === undefined || error !== undefined) {
    const message = typeof error === 'object' && error && 'error' in error ? String(error.error) : response.statusText
    throw new ApiFailure(response.status, message)
  }
  return data
}

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
  })
