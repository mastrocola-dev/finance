import { createRootRoute, createRoute, createRouter, lazyRouteComponent, type RouterHistory, retainSearchParams } from '@tanstack/react-router'
import { parseSearch } from './lib/search.ts'
import { NotFound } from './pages/not-found.tsx'
import { Layout } from './shell/layout.tsx'
import { type Path, screens } from './shell/nav.ts'

const rootRoute = createRootRoute({
  validateSearch: parseSearch,
  search: { middlewares: [retainSearchParams(['month', 'member'])] },
  component: Layout,
  notFoundComponent: NotFound,
})

const pages: Record<Path, ReturnType<typeof lazyRouteComponent>> = {
  '/': lazyRouteComponent(() => import('./overview/overview-page.tsx'), 'OverviewPage'),
  '/contas': lazyRouteComponent(() => import('./bills/bills-page.tsx'), 'BillsPage'),
  '/lancamentos': lazyRouteComponent(() => import('./entries/entries-page.tsx'), 'EntriesPage'),
  '/patrimonio': lazyRouteComponent(() => import('./worth/worth-page.tsx'), 'WorthPage'),
  '/decisoes': lazyRouteComponent(() => import('./decisions/decisions-page.tsx'), 'DecisionsPage'),
  '/atividade': lazyRouteComponent(() => import('./activity/activity-page.tsx'), 'ActivityPage'),
  '/importar': lazyRouteComponent(() => import('./imports/imports-page.tsx'), 'ImportsPage'),
}

const routeTree = rootRoute.addChildren(screens.map((screen) => createRoute({ getParentRoute: () => rootRoute, path: screen.path, component: pages[screen.path] })))

export const createAppRouter = (history?: RouterHistory) => createRouter({ routeTree, history, defaultPreload: 'intent', scrollRestoration: true })

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
