import { expect, test } from 'vitest'
import type { Entry } from '../overview/model.ts'
import { cell, csvName, decimal, entriesCsv } from './csv.ts'

const entry = (extra: Partial<Entry>): Entry => ({
  id: '1',
  competence: '2026-10-01',
  dueOn: '2026-10-05',
  description: 'Aluguel',
  direction: 'expense',
  amount: { cents: '380000', brl: '' },
  category: 'Moradia',
  account: 'Conta conjunta',
  member: null,
  status: 'paid',
  state: 'paid',
  paidOn: '2026-10-05',
  installmentNumber: null,
  installmentsTotal: null,
  origin: 'manual',
  ...extra,
})

const lines = (csv: string) => csv.slice(1).trimEnd().split('\r\n')

test('starts with a BOM, uses semicolons and CRLF, and has a header row', () => {
  const csv = entriesCsv([entry({})])
  expect(csv.startsWith('﻿Vencimento;Competência;Descrição;Categoria;Conta;Pessoa;Tipo;Valor;Situação;Pago em;Parcela;Origem\r\n')).toBe(true)
  expect(csv.endsWith('\r\n')).toBe(true)
  expect(lines(csv)[1]).toBe('05/10/2026;01/10/2026;Aluguel;Moradia;Conta conjunta;Conjunto;Despesa;-3800,00;Paga;05/10/2026;;Manual')
})

test('writes amounts with a decimal comma and no currency symbol, income positive', () => {
  expect(decimal(123456n)).toBe('1234,56')
  expect(decimal(-5n)).toBe('-0,05')
  expect(decimal(0n)).toBe('0,00')
  const [, income] = lines(entriesCsv([entry({ direction: 'income', amount: { cents: '1240000', brl: '' }, member: 'Márcio', state: 'pending', status: 'planned', paidOn: null, origin: 'forecast' })]))
  expect(income).toBe('05/10/2026;01/10/2026;Aluguel;Moradia;Conta conjunta;Márcio;Receita;12400,00;A receber;;;Previsto')
})

test('quotes fields with separators, quotes or line breaks and keeps accents', () => {
  expect(cell('Pão; café')).toBe('"Pão; café"')
  expect(cell('TV "smart"')).toBe('"TV ""smart"""')
  expect(cell('linha\nnova')).toBe('"linha\nnova"')
  expect(cell(' espaço')).toBe('" espaço"')
  expect(cell('Açougue São João')).toBe('Açougue São João')
  const [, row] = lines(entriesCsv([entry({ description: 'Farmácia; "genérico"', installmentNumber: 3, installmentsTotal: 10 })]))
  expect(row).toContain(';"Farmácia; ""genérico""";')
  expect(row).toContain(';3/10;')
})

test('neutralizes text that a spreadsheet would read as a formula', () => {
  const [, row] = lines(entriesCsv([entry({ description: '=HYPERLINK("x")', category: '+Taxas', account: null })]))
  expect(row).toContain(`;"'=HYPERLINK(""x"")";'+Taxas;;`)
})

test('has one line per entry and no totals row', () => {
  const csv = entriesCsv([entry({ id: '1' }), entry({ id: '2', description: 'Luz' })])
  expect(lines(csv)).toHaveLength(3)
  expect(csv).not.toMatch(/total/i)
})

test('names the file after the month', () => {
  expect(csvName('2026-10')).toBe('lancamentos-2026-10.csv')
})
