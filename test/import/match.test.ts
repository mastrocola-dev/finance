import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { bestMatch, distance, score, singular } from '../../src/import/match.ts'

const categories = ['Alimentação', 'Supermercado', 'Saúde', 'Farmácia', 'Casa', 'Contas da casa', 'Lazer']

describe('name matcher', () => {
  test('makes Portuguese words singular after removing accents and punctuation', () => {
    assert.equal(singular('Farmácias'), 'farmacia')
    assert.equal(singular('Serviços / Assinaturas'), 'servico assinatura')
    assert.equal(singular('Cartões'), 'cartao')
    assert.equal(singular('Aluguéis'), 'aluguel')
    assert.equal(singular('Viagens'), 'viagem')
    assert.equal(singular('Luzes'), 'luz')
    assert.equal(singular('Gás'), 'gas')
  })

  test('counts edits between two names', () => {
    assert.equal(distance('lazer', 'lazer'), 0)
    assert.equal(distance('transporte', 'trasnporte'), 2)
    assert.equal(distance('', 'abc'), 3)
  })

  test('ranks exact, singular, token and fuzzy matches', () => {
    assert.equal(score('saude', 'Saúde'), 0)
    assert.equal(score('Farmacias', 'Farmácia'), 1)
    assert.equal(score('Contas', 'Contas da casa'), 2)
    assert.equal(score('Mercado', 'Supermercado'), 3)
    assert.equal(score('Trasnporte', 'Transporte'), 5)
    assert.equal(score('Cama', 'Casa'), undefined)
    assert.equal(score('Moradia', 'Mercado'), undefined)
  })

  test('maps near-misses to the open name', () => {
    assert.equal(bestMatch('Mercado', categories), 'Supermercado')
    assert.equal(bestMatch('Saude', categories), 'Saúde')
    assert.equal(bestMatch('Farmácias', categories), 'Farmácia')
    assert.equal(bestMatch('ALIMENTACAO', categories), 'Alimentação')
    assert.equal(bestMatch('Lazers', categories), 'Lazer')
  })

  test('never fuzzy-matches names shorter than five letters', () => {
    assert.equal(bestMatch('Cama', categories), undefined)
    assert.equal(bestMatch('Pets', ['Peto', 'Petshop']), undefined)
    assert.equal(bestMatch('Gás', ['Gasolina']), undefined)
  })

  test('gives up when two different names match equally well', () => {
    assert.equal(bestMatch('Conta', ['Conta conjunta', 'Conta Marcio']), undefined)
    assert.equal(bestMatch('Conta conjunta', ['Conta conjunta', 'Conta Marcio']), 'Conta conjunta')
  })

  test('matches members by initials only when asked and only when one member fits', () => {
    const members = ['Marcio', 'Gabriela']
    assert.equal(bestMatch('GMA', members, { initials: true }), 'Gabriela')
    assert.equal(bestMatch('MMA', members, { initials: true }), 'Marcio')
    assert.equal(bestMatch('GMA', members), undefined)
    assert.equal(bestMatch('gma', members, { initials: true }), undefined)
    assert.equal(bestMatch('GA', ['Gabriela', 'Gustavo'], { initials: true }), undefined)
    assert.equal(bestMatch('GA', ['Gabriela Alves', 'Gustavo'], { initials: true }), 'Gabriela Alves')
    assert.equal(bestMatch('Gabriela A.', members, { initials: true }), 'Gabriela')
  })
})
