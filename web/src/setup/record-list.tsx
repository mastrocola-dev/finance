import { useState } from 'react'
import type { Notice } from '../components/toast.tsx'
import { formatBrl } from '../lib/format.ts'
import { type ApiRecord, cardGroups, groupRecords, type SetupRecord, setupLabels } from './model.ts'
import { type Open, RecordGroup } from './record-group.tsx'
import { StarterCategories } from './starter-categories.tsx'

type Notify = (notice: Notice) => void

const CardIntro = ({ card }: { card: SetupRecord }) => <p className="m-0">{card.amount ? `Limite ${formatBrl(card.amount.cents)}.` : 'Sem limite cadastrado: edite o cartão em Contas.'} As parcelas já estão na fatura do cartão; aqui elas mostram quanto do limite está tomado e quando ele libera.</p>

export const RecordList = ({ records, notify }: { records: ApiRecord[]; notify: Notify }) => {
  const [adding, setAdding] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const toggle = (value: string) => (current?: string) => (current === value ? undefined : value)
  const open: Open = { adding, editing, add: (id) => setAdding(toggle(id)), edit: (key) => setEditing(toggle(key)) }
  const cards = cardGroups(records).map(({ card, records: group }) => <RecordGroup open={open} key={`card-${card.id}`} id={`setup-card-${card.id}`} title={`Parcelamentos · ${card.name}`} kind="card_installment" records={group} notify={notify} intro={<CardIntro card={card} />} preset={{ account: card.name }} />)
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {groupRecords(records).flatMap(({ kind, records: group }) => [
        <RecordGroup open={open} key={kind} id={`setup-${kind}`} title={setupLabels[kind].many} kind={kind} records={group} notify={notify} empty={kind === 'category' ? <StarterCategories notify={notify} /> : undefined} />,
        ...(kind === 'account' ? cards : []),
      ])}
    </div>
  )
}
