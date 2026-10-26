import { Link } from '@tanstack/react-router'
import { type AuditItem, authorLabel, describeAudit, formatWhen } from '../activity/describe.ts'
import { cn } from '../lib/utils.ts'
import { Card } from './card.tsx'

export const RecentActivity = ({ items }: { items: AuditItem[] }) => (
  <Card
    id="act-title"
    title="Atividade recente"
    aside={
      <Link to="/atividade" className="text-accent">
        Histórico
      </Link>
    }
  >
    {items.length === 0 ? (
      <p className="m-0 text-muted">Nenhuma atividade registrada.</p>
    ) : (
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5">
            <span className={cn('flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold', item.author === 'claude' ? 'bg-claude-soft text-claude' : 'bg-sunken text-text')}>{authorLabel(item)}</span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-meta">{describeAudit(item)}</span>
              <span className="text-xs text-muted">{formatWhen(item.at)}</span>
            </div>
          </li>
        ))}
      </ul>
    )}
  </Card>
)
