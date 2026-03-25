import { describe, expect, it } from 'vitest'
import { generateDeck } from '../src/core/cardEngine'

function findCard(rank: string, suit: string, currentLevel: string) {
  const deck = generateDeck(currentLevel)
  const card = deck.find((item) => item.rank === rank && item.suit === suit)
  if (!card) {
    throw new Error(`未找到 ${rank}-${suit}`)
  }
  return card
}

describe('cardEngine level ordering', () => {
  it('打3时，普通2应是最小普通牌，级牌3高于A', () => {
    const spade2 = findCard('2', 'spades', '3')
    const spade4 = findCard('4', 'spades', '3')
    const spadeA = findCard('A', 'spades', '3')
    const heart3 = findCard('3', 'hearts', '3')

    expect(spade2.logicValue).toBeLessThan(spade4.logicValue)
    expect(spade2.logicValue).toBeLessThan(spadeA.logicValue)
    expect(heart3.logicValue).toBeGreaterThan(spadeA.logicValue)
    expect(heart3.isWildcard).toBe(true)
  })

  it('打2时，2作为级牌应高于A', () => {
    const spade2 = findCard('2', 'spades', '2')
    const heart2 = findCard('2', 'hearts', '2')
    const spadeA = findCard('A', 'spades', '2')

    expect(spade2.logicValue).toBeGreaterThan(spadeA.logicValue)
    expect(heart2.logicValue).toBeGreaterThan(spade2.logicValue)
    expect(heart2.isWildcard).toBe(true)
  })
})
