import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['bg', 'surface', 'sunken', 'border', 'text', 'muted', 'accent', 'accent-text', 'accent-soft', 'income', 'expense', 'late', 'late-soft', 'ok', 'ok-soft', 'pending', 'pending-soft', 'claude', 'claude-soft', 'ring'],
      text: ['meta', 'body', 'section', 'title', 'title-mobile', 'kpi', 'kpi-hero'],
      radius: ['control', 'field', 'card', 'hero'],
    },
  },
})

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
