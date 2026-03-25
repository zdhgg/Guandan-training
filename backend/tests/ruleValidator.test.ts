import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { identifyPattern } from '../src/core/ruleValidator'
import type { RuntimeCard, CardSuit, CardRank } from '../src/core/cardEngine'

function makeCard(id: string, suit: CardSuit, rank: CardRank, isWildcard = false): RuntimeCard {
  return {
    id,
    suit,
    rank,
    deckIndex: 0,
    logicValue: 10,
    isWildcard,
    isSelected: false,
  }
}

describe('ruleValidator legacy assertions', () => {
  it('keeps legacy edge cases passing', () => {
    {
      const cards: RuntimeCard[] = [
        makeCard('1', 'hearts', '5'),
        makeCard('2', 'diamonds', '6'),
        makeCard('3', 'clubs', '7'),
        makeCard('4', 'spades', '8'),
        makeCard('5', 'hearts', '9'),
      ]
      const result = identifyPattern(cards)
      assert.equal(result.isValid, true)
      assert.equal(result.patternType, 'straight')
    }

    {
      const cards: RuntimeCard[] = [
        makeCard('1', 'hearts', '5'),
        makeCard('2', 'diamonds', '6'),
        makeCard('3', 'clubs', '7'),
        makeCard('4', 'spades', '8'),
        makeCard('5', 'hearts', '9', true),
      ]
      const result = identifyPattern(cards)
      assert.equal(result.isValid, true)
      assert.equal(result.patternType, 'straight')
    }

    {
      const cards: RuntimeCard[] = [
        makeCard('1', 'hearts', '5'),
        makeCard('2', 'diamonds', '5'),
        makeCard('3', 'clubs', '6'),
        makeCard('4', 'spades', '7'),
        makeCard('5', 'hearts', '8'),
        makeCard('6', 'hearts', '9', true),
      ]
      const result = identifyPattern(cards)
      assert.equal(result.isValid, false)
    }

    {
      const cards: RuntimeCard[] = [
        makeCard('1', 'hearts', '8'),
        makeCard('2', 'diamonds', '8'),
        makeCard('3', 'clubs', '8'),
        makeCard('4', 'hearts', '9', true),
      ]
      const result = identifyPattern(cards)
      assert.equal(result.isValid, true)
      assert.equal(result.patternType, 'bomb')
    }

    {
      const cards: RuntimeCard[] = [
        makeCard('1', 'hearts', '8'),
        makeCard('2', 'diamonds', '8'),
        makeCard('3', 'clubs', '9'),
        makeCard('4', 'hearts', '8', true),
      ]
      const result = identifyPattern(cards)
      assert.equal(result.isValid, false)
    }

    {
      const cards: RuntimeCard[] = [
        makeCard('1', 'hearts', '3'),
        makeCard('2', 'diamonds', '3'),
        makeCard('3', 'clubs', '3'),
        makeCard('4', 'hearts', '4'),
        makeCard('5', 'spades', '4'),
      ]
      const result = identifyPattern(cards)
      assert.equal(result.isValid, true)
      assert.equal(result.patternType, 'plate')
    }

    {
      const cards: RuntimeCard[] = [
        makeCard('1', 'hearts', '3'),
        makeCard('2', 'diamonds', '3'),
        makeCard('3', 'clubs', '3'),
        makeCard('4', 'hearts', '4'),
        makeCard('5', 'hearts', '9', true),
      ]
      const result = identifyPattern(cards)
      assert.equal(result.isValid, true)
      assert.equal(result.patternType, 'plate')
    }
  })
})
