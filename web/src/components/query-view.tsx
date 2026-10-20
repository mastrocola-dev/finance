import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErrorState } from './error-state.tsx'

type Props<T> = { query: UseQueryResult<T>; skeleton: ReactNode; empty?: ReactNode; isEmpty?: (data: T) => boolean; children: (data: T) => ReactNode }

export const QueryView = <T,>({ query, skeleton, empty, isEmpty, children }: Props<T>) => {
  if (query.isPending) return <div aria-busy="true">{skeleton}</div>
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />
  if (empty && isEmpty?.(query.data)) return empty
  return children(query.data)
}
