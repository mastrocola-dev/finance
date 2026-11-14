export type Palette = Record<'bg' | 'surface' | 'sunken' | 'border' | 'text' | 'muted' | 'accent' | 'accent-text' | 'income' | 'expense' | 'late', string>

export type Candidate = { name: string; reason: string; risk: string }

export type Direction = {
  id: string
  title: string
  idea: string
  says: string
  names: Candidate[]
  mark: (color: string, size: number) => string
  font: string
  light: Palette
  dark: Palette
}

const circle = (cx: number, cy: number, r: number, color: string, stroke: number) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`

export const directions: Direction[] = [
  {
    id: 'abrigo',
    title: 'Abrigo',
    idea: 'The household as a shelter: a roof over a coin, the money the house keeps together.',
    says: 'Calm and domestic; the money of the house, not of a bank.',
    names: [
      { name: 'Teto', reason: 'Four letters, one stress in both languages; "teto" is the roof and also the ceiling of a budget.', risk: '"Teto de gastos" is a common budget term, so the word alone is weak as a mark; register it with a figurative element.' },
      { name: 'Varanda', reason: 'Warm, Brazilian, said the same in English; the place where a couple talks about the month.', risk: 'Used by restaurants and real estate; check class 36 (finance) and 9/42 (software).' },
      { name: 'Alpendre', reason: 'Rare word, distinctive, a covered porch; the most registrable of the three.', risk: 'Harder to spell for English speakers; the "dre" ending is unfamiliar abroad.' },
    ],
    mark: (color, size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><path d="M100 236 256 112l156 124" fill="none" stroke="${color}" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>${circle(256, 326, 72, color, 44)}</svg>`,
    font: 'Geist for text and wordmark (already in the app)',
    light: { bg: '#F7F5F0', surface: '#FFFFFF', sunken: '#EFECE5', border: '#E2DED5', text: '#1A1A17', muted: '#5E5C55', accent: '#0E6B63', 'accent-text': '#FFFFFF', income: '#0E6B63', expense: '#B4440E', late: '#8F360A' },
    dark: { bg: '#0F1211', surface: '#171B1A', sunken: '#20262A', border: '#2B3230', text: '#ECEEEC', muted: '#A2A9A6', accent: '#5CC8B8', 'accent-text': '#0F1211', income: '#5CC8B8', expense: '#F08A4B', late: '#F5A574' },
  },
  {
    id: 'a-dois',
    title: 'A dois',
    idea: 'Two circles and the space they share: each member keeps a part, the overlap is the joint budget.',
    says: 'Shared and fair; decisions made together, Claude as the third voice that only proposes.',
    names: [
      { name: 'Ambos', reason: '"Both" in Portuguese, two syllables, easy in English; it says the product is for the two of them.', risk: 'A common word: check class 36 and 9/42, and whether an app store listing already uses it.' },
      { name: 'Comum', reason: '"Conta comum" is how Brazilians name a joint account; reads as "common" in English.', risk: 'Generic in Portuguese, so the mark depends on the logo; the .com.br may be taken.' },
      { name: 'Dueto', reason: 'Two voices in one piece; friendly, short, close to "duet" in English.', risk: '"Duo" brands are many (Duolingo, Duo Security); keep the full word.' },
    ],
    mark: (color, size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">${circle(206, 256, 112, color, 44)}${circle(306, 256, 112, color, 44)}</svg>`,
    font: 'Geist for text; Fraunces (SIL OFL) named as the wordmark candidate, drawn here in Geist until approved',
    light: { bg: '#F6F5F4', surface: '#FFFFFF', sunken: '#EFEDEC', border: '#E4E1DF', text: '#18161A', muted: '#5F5B63', accent: '#7A2C67', 'accent-text': '#FFFFFF', income: '#7A2C67', expense: '#B4440E', late: '#8F360A' },
    dark: { bg: '#110F12', surface: '#1A171C', sunken: '#241F26', border: '#322C34', text: '#EEECEF', muted: '#AAA4AD', accent: '#E59BD4', 'accent-text': '#110F12', income: '#E59BD4', expense: '#F08A4B', late: '#F5A574' },
  },
  {
    id: 'prumo',
    title: 'Prumo',
    idea: 'The plumb line: the month stays upright when every bill has its place; "estar no prumo" is to be on track.',
    says: 'Trustworthy and exact, numbers first; the closest to the current identity, with a deeper ink blue.',
    names: [
      { name: 'Prumo', reason: 'Five letters, a known idiom ("no prumo"), sounds solid in English.', risk: 'Prumo Logística (ports) exists in Brazil; another class, but check class 36 and 9/42 carefully.' },
      { name: 'Remanso', reason: 'Still water after the current; calm, distinctive, no finance use the agent knows of.', risk: 'Three syllables, less obvious meaning for English speakers.' },
      { name: 'Sereno', reason: 'Calm and also the evening dew; positive, short.', risk: 'Common name for hotels and products; weak alone as a mark.' },
    ],
    mark: (color, size) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><path d="M256 84v100" fill="none" stroke="${color}" stroke-width="36" stroke-linecap="round"/><path d="M256 222l72 82-72 124-72-124z" fill="${color}" stroke="${color}" stroke-width="28" stroke-linejoin="round"/></svg>`,
    font: 'Geist for text and wordmark, tracking -0.03em (already in the app)',
    light: { bg: '#F5F6F7', surface: '#FFFFFF', sunken: '#ECEEF1', border: '#DFE2E7', text: '#141820', muted: '#5A616D', accent: '#233A8B', 'accent-text': '#FFFFFF', income: '#233A8B', expense: '#A14B12', late: '#8F360A' },
    dark: { bg: '#0D1016', surface: '#151922', sunken: '#1D222D', border: '#292F3B', text: '#ECEEF2', muted: '#A2A8B4', accent: '#9DB0F5', 'accent-text': '#0D1016', income: '#9DB0F5', expense: '#F0904F', late: '#F5A574' },
  },
]

export const avoided = [
  'Caixa',
  'Nubank',
  'Inter',
  'C6',
  'PicPay',
  'Neon',
  'Next',
  'Original',
  'Elo',
  'Cora',
  'Stone',
  'Ame',
  'iti',
  'Will',
  'Pan',
  'Mobills',
  'Organizze',
  'Olivia',
  'Warren',
  'Nomad',
  'Méliuz',
  'Kinvo',
  'Mercado Pago',
  'PagBank',
  'Sicredi',
  'Sicoob',
  'Agibank',
  'Juno',
  'Asaas',
  'Genial',
  'Toro',
  'Rico',
  'Clear',
  'Modal',
]
