import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { CandidateRow, type EditForm } from './candidate-row.tsx'
import type { Names } from './edit-model.ts'
import { plural } from './model.ts'
import { acceptable, type Candidate, candidateRecord, type Decision, type Group, reviewCounts, settled, titleOf } from './review-model.ts'

export const card = 'flex min-w-0 flex-col gap-2 rounded-card border bg-surface px-4 py-3 md:px-6 md:py-4'

type Props = { group: Group; hash: string; names: Record<Names, string[]>; busy: boolean; onDecide: (ids: string[], decision: Decision, label: string) => void; onEdit: (candidate: Candidate, payload: Record<string, unknown>, form: EditForm) => void }

const settledText = (group: Group) => {
  const counts = reviewCounts(group.candidates)
  return [counts.accepted > 0 && plural(counts.accepted, 'aceito', 'aceitos'), counts.rejected > 0 && plural(counts.rejected, 'rejeitado', 'rejeitados')].filter(Boolean).join(' · ')
}

export const GroupCard = ({ group, hash, names, busy, onDecide, onEdit }: Props) => {
  const [shown, setShown] = useState(() => !settled(group))
  const ready = acceptable(group)
  const headingId = `group-${group.key}`
  const heading = (
    <h2 id={headingId} className="m-0 text-section font-semibold first-letter:uppercase">
      {group.title}
    </h2>
  )
  const count = <span className="text-xs text-muted">{plural(group.candidates.length, 'item', 'itens')}</span>
  const rows = (
    <ul className="m-0 flex list-none flex-col p-0">
      {group.candidates.map((candidate) => (
        <CandidateRow key={candidate.id} candidate={candidate} hash={hash} names={names} busy={busy} onDecide={(decision) => onDecide([candidate.id], decision, titleOf(candidate))} onEdit={(payload, form) => onEdit(candidate, payload, form)} />
      ))}
    </ul>
  )
  if (settled(group)) {
    const target = group.candidates.some((candidate) => candidateRecord(candidate.id) === hash)
    return (
      <section aria-labelledby={headingId} className={card}>
        <details className="group" open={shown || target} onToggle={(event) => setShown(event.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 md:min-h-0 [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted group-open:rotate-90" />
            {heading}
            {count}
            <span className="text-xs text-ok">{settledText(group)}</span>
          </summary>
          <div className="mt-1">{rows}</div>
        </details>
      </section>
    )
  }
  return (
    <section aria-labelledby={headingId} className={card}>
      <div className="flex flex-wrap items-center gap-2">
        {heading}
        {count}
        {ready.length > 1 && (
          <Button variant="ghost" className="ml-auto" disabled={busy} onClick={() => onDecide(ready, 'accept', `${ready.length} itens`)}>
            Aceitar {ready.length} prontos
          </Button>
        )}
      </div>
      {rows}
    </section>
  )
}
