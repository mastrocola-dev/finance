import { createRootRoute, createRoute, createRouter, type RouterHistory, retainSearchParams } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { BillsPage } from './bills/bills-page.tsx'
import { parseSearch } from './lib/search.ts'
import { OverviewPage } from './overview/overview-page.tsx'
import { NotFound } from './pages/not-found.tsx'
import { ScreenPage } from './pages/screen-page.tsx'
import { Layout } from './shell/layout.tsx'
import { type Path, screens } from './shell/nav.ts'

const rootRoute = createRootRoute({
  validateSearch: parseSearch,
  search: { middlewares: [retainSearchParams(['month', 'member'])] },
  component: Layout,
  notFoundComponent: NotFound,
})

const pages: Partial<Record<Path, () => ReactNode>> = { '/': OverviewPage, '/contas': BillsPage }

const routeTree = rootRoute.addChildren(screens.map((screen) => createRoute({ getParentRoute: () => rootRoute, path: screen.path, component: pages[screen.path] ?? (() => <ScreenPage screen={screen} />) })))

export const createAppRouter = (history?: RouterHistory) => createRouter({ routeTree, history, defaultPreload: 'intent', scrollRestoration: true })

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
