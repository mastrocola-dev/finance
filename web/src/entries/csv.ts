import type { Entry } from '../overview/model.ts'
import { installmentOf, originLabels, stateLabel } from './model.ts'

const headers = ['Vencimento', 'Competência', 'Descrição', 'Categoria', 'Conta', 'Pessoa', 'Tipo', 'Valor', 'Situação', 'Pago em', 'Parcela', 'Origem']

const brDate = (date: string | null) => (date ? date.split('-').reverse().join('/') : '')

export const decimal = (cents: bigint) => {
  const absolute = cents < 0n ? -cents : cents
  return `${cents < 0n ? '-' : ''}${absolute / 100n},${String(absolute % 100n).padStart(2, '0')}`
}

const text = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value)

export const cell = (value: string) => (/[;"\r\n]/.test(value) || value !== value.trim() ? `"${value.replaceAll('"', '""')}"` : value)

const row = (entry: Entry) => {
  const cents = BigInt(entry.amount.cents)
  return [
    brDate(entry.dueOn),
    brDate(entry.competence),
    text(entry.description),
    text(entry.category),
    text(entry.account ?? ''),
    text(entry.member ?? 'Conjunto'),
    entry.direction === 'income' ? 'Receita' : 'Despesa',
    decimal(entry.direction === 'income' ? cents : -cents),
    stateLabel(entry),
    brDate(entry.paidOn),
    installmentOf(entry) ?? '',
    originLabels[entry.origin],
  ]
}

export const entriesCsv = (entries: Entry[]) => `﻿${[headers, ...entries.map(row)].map((fields) => fields.map(cell).join(';')).join('\r\n')}\r\n`

export const csvName = (month: string) => `lancamentos-${month}.csv`

export const download = (name: string, content: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
