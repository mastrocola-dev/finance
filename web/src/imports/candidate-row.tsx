import { useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { chip } from '../decisions/decision-card.tsx'
import { recordProps } from '../lib/record.tsx'
import { cn } from '../lib/utils.ts'
import { CandidateForm } from './candidate-form.tsx'
import type { Errors, Names } from './edit-model.ts'
import { amountOf, type Candidate, candidateRecord, checkText, confidenceText, type Decision, detailsOf, hasBlocking, isBlocking, statusLabels, statusTones, titleOf } from './review-model.ts'

export type EditForm = { close: () => void; refuse: (errors: Errors) => void }

type Props = { candidate: Candidate; hash: string; names: Record<Names, string[]>; busy: boolean; onDecide: (decision: Decision) => void; onEdit: (payload: Record<string, unknown>, form: EditForm) => void }

export const CandidateRow = ({ candidate, hash, names, busy, onDecide, onEdit }: Props) => {
  const [editing, setEditing] = useState(false)
  const [refused, setRefused] = useState<Errors>()
  const close = () => {
    setEditing(false)
    setRefused(undefined)
  }
  const title = titleOf(candidate)
  const amount = amountOf(candidate)
  const stuck = hasBlocking(candidate)
  const accepted = candidate.status === 'accepted' || candidate.status === 'edited'
  const titleId = `candidate-title-${candidate.id}`
  return (
    <li aria-labelledby={titleId} {...recordProps(candidateRecord(candidate.id), hash)} className="flex flex-col gap-2 border-b py-3 last:border-b-0 aria-[current=true]:bg-accent-soft">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={titleId} className={cn('font-medium', candidate.status === 'rejected' && 'text-muted line-through')}>
            {title}
          </span>
          <span className="text-xs text-muted">{detailsOf(candidate).join(' · ')}</span>
        </div>
        {amount && <span className={cn('amount whitespace-nowrap', amount.income && 'text-income')}>{amount.text}</span>}
      </div>
      {candidate.checks.length > 0 && (
        <ul aria-label={`Alertas de ${title}`} className="m-0 flex list-none flex-col gap-1 p-0">
          {candidate.checks.map((check) => (
            <li key={`${check.code}-${check.detail ?? ''}`} className={cn('text-xs', isBlocking(candidate.kind, check) ? 'text-late' : 'text-muted')}>
              {checkText(check)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={cn(chip, statusTones[candidate.status])}>{statusLabels[candidate.status]}</span>
        <span className="min-w-0 truncate rounded-control bg-sunken px-1.5 py-0.5 font-mono text-xs text-muted" title={candidate.source}>
          {candidate.source}
        </span>
        <span className="text-xs text-muted">Confiança {confidenceText(candidate.confidence)}</span>
        <span className="ml-auto flex gap-2">
          {candidate.status !== 'rejected' && !editing && (
            <Button variant="ghost" disabled={busy} aria-label={`Editar ${title}`} onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
          {candidate.status !== 'rejected' && (
            <Button variant="ghost" disabled={busy} aria-label={`Rejeitar ${title}`} onClick={() => onDecide('reject')}>
              Rejeitar
            </Button>
          )}
          {!accepted && (
            <Button variant="outline" disabled={busy || stuck} aria-label={`Aceitar ${title}`} onClick={() => onDecide('accept')}>
              Aceitar
            </Button>
          )}
        </span>
      </div>
      {editing && (
        <CandidateForm
          candidate={candidate}
          title={title}
          names={names}
          busy={busy}
          serverErrors={refused}
          onCancel={close}
          onSave={(payload) => {
            setRefused(undefined)
            onEdit(payload, { close, refuse: setRefused })
          }}
        />
      )}
    </li>
  )
}
