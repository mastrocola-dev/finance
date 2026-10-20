import type { ReactNode } from 'react'

export const EmptyState = ({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-card border border-dashed bg-surface px-6 py-10 text-center">
    <p className="m-0 text-section font-semibold">{title}</p>
    {children && <p className="m-0 max-w-[48ch] text-muted">{children}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
)
