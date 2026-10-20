import type { components } from '../api/schema.ts'
import { formatBrl } from '../lib/format.ts'
import { Card } from './card.tsx'

type Split = components['schemas']['Split']
type Member = components['schemas']['Member']

const shares = (members: Member[]) => members.map(({ sharePercent }) => sharePercent).join('/')

export const SettlementCard = ({ split, members }: { split: Split; members: Member[] }) => (
  <Card id="split-title" title="Acerto do casal">
    <span className="text-meta text-muted">Despesas conjuntas divididas {shares(members)}</span>
    {split.transfers.length === 0 ? (
      <span className="text-section">Nada a acertar neste mês</span>
    ) : (
      split.transfers.map((transfer) => (
        <span key={`${transfer.from}-${transfer.to}`} className="text-section">
          <strong>{transfer.from}</strong> deve <span className="amount">{formatBrl(transfer.amount.cents)}</span> a <strong>{transfer.to}</strong>
        </span>
      ))
    )}
  </Card>
)
