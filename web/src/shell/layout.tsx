import { Outlet } from '@tanstack/react-router'
import { Sidebar } from './sidebar.tsx'
import { TabBar } from './tab-bar.tsx'
import { TopBar } from './top-bar.tsx'

export const Layout = () => (
  <div className="flex min-h-dvh">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar />
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 pt-5 pb-28 md:px-10 md:pt-8 md:pb-12">
        <Outlet />
      </main>
    </div>
    <TabBar />
  </div>
)
