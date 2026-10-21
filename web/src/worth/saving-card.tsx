import type { Saving } from './model.ts'

export const SavingCard = ({ saving }: { saving: Saving }) => {
  const degrees = saving.percent * 3.6
  return (
    <article className="flex items-center gap-3.5 rounded-card border bg-surface px-4 py-3.5 md:px-6 md:py-5">
      <div role="img" aria-label={`${saving.percent}% da meta`} className="flex size-16 flex-none items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--${saving.tone}) 0 ${degrees}deg, var(--sunken) ${degrees}deg 360deg)` }}>
        <span className="flex size-[50px] items-center justify-center rounded-full bg-surface text-meta font-semibold">{saving.percent}%</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="m-0 text-body font-semibold">{saving.name}</h3>
        <span className="amount text-meta">{saving.value}</span>
        <span className="text-meta text-muted">{saving.meta}</span>
      </div>
    </article>
  )
}
