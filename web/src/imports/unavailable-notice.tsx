import type { Unavailable } from './model.ts'

export const UnavailableNotice = ({ id, notice }: { id: string; notice: Unavailable }) => (
  <p id={id} role="status" className="m-0 w-full rounded-control border bg-pending-soft px-3 py-2 text-meta text-text">
    <span className="font-semibold text-pending">{notice.title}</span> {notice.text}
  </p>
)
