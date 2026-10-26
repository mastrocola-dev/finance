import { QueryClientProvider } from '@tanstack/react-query'
import { type RouterHistory, RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { IdentityProvider } from './identity/identity-provider.tsx'
import { createQueryClient } from './query/client.ts'
import { createAppRouter } from './router.tsx'

export const App = ({ history, fetch }: { history?: RouterHistory; fetch?: typeof globalThis.fetch }) => {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(() => createAppRouter(history))

  return (
    <QueryClientProvider client={queryClient}>
      <IdentityProvider fetch={fetch}>
        <RouterProvider router={router} />
      </IdentityProvider>
    </QueryClientProvider>
  )
}
