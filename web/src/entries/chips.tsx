import { cn } from '../lib/utils.ts'
import type { Entry } from '../overview/model.ts'
import { originLabels, stateLabel } from './model.ts'

const chip = 'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold'

const originTones: Record<Entry['origin'], string> = { claude: 'bg-claude-soft text-claude', manual: 'bg-sunken text-text', import: 'bg-sunken text-muted', forecast: 'bg-sunken text-muted' }

const stateTones: Record<Entry['state'], string> = { paid: 'bg-ok-soft text-ok', pending: 'bg-pending-soft text-pending', late: 'bg-late-soft text-late' }

export const OriginChip = ({ entry }: { entry: Entry }) => <span className={cn(chip, originTones[entry.origin])}>{originLabels[entry.origin]}</span>

export const StateChip = ({ entry }: { entry: Entry }) => <span className={cn(chip, stateTones[entry.state])}>{stateLabel(entry)}</span>
