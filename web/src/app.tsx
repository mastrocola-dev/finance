import { QueryClientProvider } from '@tanstack/react-query'
import { type RouterHistory, RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import type { Session } from './auth/session.ts'
import { IdentityProvider } from './identity/identity-provider.tsx'
import { createQueryClient } from './query/client.ts'
import { createAppRouter } from './router.tsx'

export const App = ({ history, fetch, session }: { history?: RouterHistory; fetch?: typeof globalThis.fetch; session?: Session }) => {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(() => createAppRouter(history))

  return (
    <QueryClientProvider client={queryClient}>
      <IdentityProvider fetch={fetch} session={session}>
        <RouterProvider router={router} />
      </IdentityProvider>
    </QueryClientProvider>
  )
}
