import { Link } from '@tanstack/react-router'
import type { components } from '../api/schema.ts'
import { formatBrl } from '../lib/format.ts'
import { Card } from './card.tsx'

type Decision = components['schemas']['Decision']

const names = new Intl.ListFormat('pt-BR', { type: 'conjunction' })

const meta = (decision: Decision) => [decision.amount && formatBrl(decision.amount.cents), decision.origin === 'claude' ? 'proposta via Claude' : `proposta por ${decision.proposedBy}`, decision.awaiting.length > 0 && `aguarda ${names.format(decision.awaiting)}`].filter(Boolean).join(' · ')

export const PendingDecisions = ({ decisions, limit = 3 }: { decisions: Decision[]; limit?: number }) => (
  <Card
    id="dec-title"
    title="Decisões pendentes"
    aside={
      <Link to="/decisoes" className="text-accent">
        Ver todas
      </Link>
    }
  >
    {decisions.length === 0 ? (
      <p className="m-0 text-muted">Nenhuma decisão aguardando confirmação.</p>
    ) : (
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {decisions.slice(0, limit).map((decision) => (
          <li key={decision.id} className="flex flex-col gap-1">
            <span className="font-medium">{decision.title}</span>
            <span className="text-xs text-muted">{meta(decision)}</span>
          </li>
        ))}
      </ul>
    )}
  </Card>
)
