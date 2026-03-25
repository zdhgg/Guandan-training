import { describe, expect, it } from 'vitest'
import { canBeat, identifyPattern } from '../src/core/ruleValidator'
import type { CardRank, CardSuit, RuntimeCard } from '../src/core/cardEngine'

const rankWeight: Record<CardRank, number> = {
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7,
  '9': 8,
  '10': 9,
  J: 10,
  Q: 11,
  K: 12,
  A: 13,
  JOKER: 14,
}

const suitWeight: Record<CardSuit, number> = {
  hearts: 4,
  diamonds: 3,
  clubs: 2,
  spades: 1,
  joker: 0,
}

function makeCard(
  id: string,
  suit: CardSuit,
  rank: CardRank,
  options: { isWildcard?: boolean; deckIndex?: number; logicValue?: number } = {},
): RuntimeCard {
  return {
    id,
    suit,
    rank,
    deckIndex: options.deckIndex ?? 0,
    logicValue: options.logicValue ?? rankWeight[rank] * 10 + suitWeight[suit],
    isWildcard: options.isWildcard ?? false,
    isSelected: false,
  }
}

function makeJoker(id: string, kind: 'small' | 'big', deckIndex = 0): RuntimeCard {
  return makeCard(id, 'joker', 'JOKER', {
    deckIndex,
    logicValue: kind === 'big' ? 170 : 160,
  })
}

describe('ruleValidator identifyPattern', () => {
  it('识别纯正同花顺', () => {
    const cards: RuntimeCard[] = [
      makeCard('h6', 'hearts', '6'),
      makeCard('h7', 'hearts', '7'),
      makeCard('h8', 'hearts', '8'),
      makeCard('h9', 'hearts', '9'),
      makeCard('h10', 'hearts', '10'),
    ]

    const result = identifyPattern(cards)
    expect(result.isValid).toBe(true)
    expect(result.patternType).toBe('straight_flush')
  })

  it('识别纯正三带二(plate)', () => {
    const cards: RuntimeCard[] = [
      makeCard('c4', 'clubs', '4'),
      makeCard('d4', 'diamonds', '4'),
      makeCard('h4', 'hearts', '4'),
      makeCard('s9', 'spades', '9'),
      makeCard('h9', 'hearts', '9'),
    ]

    const result = identifyPattern(cards)
    expect(result.isValid).toBe(true)
    expect(result.patternType).toBe('plate')
  })

  it('1张红桃级牌(逢人配)可以补成顺子', () => {
    const cards: RuntimeCard[] = [
      makeCard('d5', 'diamonds', '5'),
      makeCard('c6', 'clubs', '6'),
      makeCard('s8', 'spades', '8'),
      makeCard('h9', 'hearts', '9'),
      makeCard('wild-h-level', 'hearts', '8', { isWildcard: true }),
    ]

    const result = identifyPattern(cards)
    expect(result.isValid).toBe(true)
    expect(result.patternType).toBe('straight')
  })

  it('1张红桃级牌 + 4张相同可识别为五星炸弹', () => {
    const cards: RuntimeCard[] = [
      makeCard('hq', 'hearts', 'Q'),
      makeCard('dq', 'diamonds', 'Q'),
      makeCard('cq', 'clubs', 'Q'),
      makeCard('sq', 'spades', 'Q'),
      makeCard('wild-h-level', 'hearts', '8', { isWildcard: true }),
    ]

    const result = identifyPattern(cards)
    expect(result.isValid).toBe(true)
    expect(result.patternType).toBe('bomb')
  })

  it('支持低端顺 A-2-3-4-5', () => {
    const cards: RuntimeCard[] = [
      makeCard('a-low', 'spades', 'A'),
      makeCard('2-low', 'hearts', '2'),
      makeCard('3-low', 'clubs', '3'),
      makeCard('4-low', 'diamonds', '4'),
      makeCard('5-low', 'spades', '5'),
    ]

    const result = identifyPattern(cards)
    expect(result.isValid).toBe(true)
    expect(result.patternType).toBe('straight')
  })

  it('支持 2-3-4-5-6 顺子', () => {
    const cards: RuntimeCard[] = [
      makeCard('2-mid', 'hearts', '2'),
      makeCard('3-mid', 'clubs', '3'),
      makeCard('4-mid', 'diamonds', '4'),
      makeCard('5-mid', 'spades', '5'),
      makeCard('6-mid', 'hearts', '6'),
    ]

    const result = identifyPattern(cards)
    expect(result.isValid).toBe(true)
    expect(result.patternType).toBe('straight')
  })

  it('不允许跨边界顺子 10-J-Q-K-A-2', () => {
    const cards: RuntimeCard[] = [
      makeCard('10-cross', 'spades', '10'),
      makeCard('j-cross', 'hearts', 'J'),
      makeCard('q-cross', 'clubs', 'Q'),
      makeCard('k-cross', 'diamonds', 'K'),
      makeCard('a-cross', 'spades', 'A'),
      makeCard('2-cross', 'hearts', '2'),
    ]

    const result = identifyPattern(cards)
    expect(result.isValid).toBe(false)
    expect(result.patternType).toBe('invalid')
  })

  it('胡乱拼凑的6张牌应判无效', () => {
    const cards: RuntimeCard[] = [
      makeCard('h3', 'hearts', '3'),
      makeCard('d3', 'diamonds', '3'),
      makeCard('c5', 'clubs', '5'),
      makeCard('s7', 'spades', '7'),
      makeCard('h9', 'hearts', '9'),
      makeCard('cj', 'clubs', 'J'),
    ]

    const result = identifyPattern(cards)
    expect(result.isValid).toBe(false)
    expect(result.patternType).toBe('invalid')
  })
})

describe('ruleValidator canBeat', () => {
  it('同点A仅花色不同不能互压', () => {
    const lastPlay: RuntimeCard[] = [makeCard('a-spade', 'spades', 'A')]
    const attempt: RuntimeCard[] = [makeCard('a-heart', 'hearts', 'A')]

    expect(canBeat(attempt, lastPlay)).toBe(false)
  })

  it('级牌可以压过A，但同点级牌不再按花色互压', () => {
    const acePlay: RuntimeCard[] = [makeCard('a-heart', 'hearts', 'A')]
    const levelAttempt: RuntimeCard[] = [makeCard('level-spade', 'spades', '8', { logicValue: 151 })]
    const levelPlay: RuntimeCard[] = [makeCard('level-heart', 'hearts', '8', { logicValue: 154, isWildcard: true })]

    expect(canBeat(levelAttempt, acePlay)).toBe(true)
    expect(canBeat(levelAttempt, levelPlay)).toBe(false)
  })

  it('同点对子仅花色不同不能互压', () => {
    const lastPlay: RuntimeCard[] = [
      makeCard('a-heart', 'hearts', 'A'),
      makeCard('a-spade', 'spades', 'A'),
    ]
    const attempt: RuntimeCard[] = [
      makeCard('a-diamond', 'diamonds', 'A'),
      makeCard('a-club', 'clubs', 'A'),
    ]

    expect(canBeat(attempt, lastPlay)).toBe(false)
  })

  it('对K可以压过对Q', () => {
    const lastPlay: RuntimeCard[] = [
      makeCard('hQ', 'hearts', 'Q'),
      makeCard('sQ', 'spades', 'Q'),
    ]
    const attempt: RuntimeCard[] = [
      makeCard('hK', 'hearts', 'K'),
      makeCard('sK', 'spades', 'K'),
    ]

    expect(canBeat(attempt, lastPlay)).toBe(true)
  })

  it('三带二比较应看三张主牌点数', () => {
    const lastPlay: RuntimeCard[] = [
      makeCard('h10', 'hearts', '10'),
      makeCard('d10', 'diamonds', '10'),
      makeCard('c10', 'clubs', '10'),
      makeCard('hQ', 'hearts', 'Q'),
      makeCard('cQ', 'clubs', 'Q'),
    ]
    const attempt: RuntimeCard[] = [
      makeCard('hQ-2', 'hearts', 'Q', { deckIndex: 1 }),
      makeCard('dQ', 'diamonds', 'Q'),
      makeCard('sQ', 'spades', 'Q'),
      makeCard('hJ', 'hearts', 'J'),
      makeCard('cJ', 'clubs', 'J'),
    ]

    expect(canBeat(attempt, lastPlay)).toBe(true)
  })

  it('炸弹可以压制普通顺子', () => {
    const lastPlay: RuntimeCard[] = [
      makeCard('s5', 'spades', '5'),
      makeCard('h6', 'hearts', '6'),
      makeCard('c7', 'clubs', '7'),
      makeCard('d8', 'diamonds', '8'),
      makeCard('s9', 'spades', '9'),
    ]
    const attempt: RuntimeCard[] = [
      makeCard('h8', 'hearts', '8'),
      makeCard('d8', 'diamonds', '8'),
      makeCard('c8', 'clubs', '8'),
      makeCard('s8', 'spades', '8'),
    ]

    expect(canBeat(attempt, lastPlay)).toBe(true)
  })

  it('A-2-3-4-5 不能压过 3-4-5-6-7', () => {
    const lastPlay: RuntimeCard[] = [
      makeCard('l3', 'spades', '3'),
      makeCard('l4', 'hearts', '4'),
      makeCard('l5', 'clubs', '5'),
      makeCard('l6', 'diamonds', '6'),
      makeCard('l7', 'spades', '7'),
    ]
    const attempt: RuntimeCard[] = [
      makeCard('a-low', 'spades', 'A'),
      makeCard('2-low', 'hearts', '2'),
      makeCard('3-low', 'clubs', '3'),
      makeCard('4-low', 'diamonds', '4'),
      makeCard('5-low', 'spades', '5'),
    ]

    expect(canBeat(attempt, lastPlay)).toBe(false)
  })

  it('2-3-4-5-6 可以压过 A-2-3-4-5', () => {
    const lastPlay: RuntimeCard[] = [
      makeCard('a-low', 'spades', 'A'),
      makeCard('2-low', 'hearts', '2'),
      makeCard('3-low', 'clubs', '3'),
      makeCard('4-low', 'diamonds', '4'),
      makeCard('5-low', 'spades', '5'),
    ]
    const attempt: RuntimeCard[] = [
      makeCard('2-mid', 'hearts', '2'),
      makeCard('3-mid', 'clubs', '3'),
      makeCard('4-mid', 'diamonds', '4'),
      makeCard('5-mid', 'spades', '5'),
      makeCard('6-mid', 'hearts', '6'),
    ]

    expect(canBeat(attempt, lastPlay)).toBe(true)
  })

  it('同点顺子仅花色不同不能互压', () => {
    const lastPlay: RuntimeCard[] = [
      makeCard('s3', 'spades', '3'),
      makeCard('h4', 'hearts', '4'),
      makeCard('c5', 'clubs', '5'),
      makeCard('d6', 'diamonds', '6'),
      makeCard('s7', 'spades', '7'),
    ]
    const attempt: RuntimeCard[] = [
      makeCard('h3', 'hearts', '3'),
      makeCard('d4', 'diamonds', '4'),
      makeCard('s5', 'spades', '5'),
      makeCard('c6', 'clubs', '6'),
      makeCard('h7', 'hearts', '7'),
    ]

    expect(canBeat(attempt, lastPlay)).toBe(false)
  })

  it('同点同花顺仅花色不同不能互压', () => {
    const lastPlay: RuntimeCard[] = [
      makeCard('d3-sf-last', 'diamonds', '3'),
      makeCard('d4-sf-last', 'diamonds', '4'),
      makeCard('d5-sf-last', 'diamonds', '5'),
      makeCard('d6-sf-last', 'diamonds', '6'),
      makeCard('d7-sf-last', 'diamonds', '7'),
    ]
    const attempt: RuntimeCard[] = [
      makeCard('h3-sf-attempt', 'hearts', '3'),
      makeCard('h4-sf-attempt', 'hearts', '4'),
      makeCard('h5-sf-attempt', 'hearts', '5'),
      makeCard('h6-sf-attempt', 'hearts', '6'),
      makeCard('h7-sf-attempt', 'hearts', '7'),
    ]

    expect(canBeat(attempt, lastPlay)).toBe(false)
  })

  it('5张同花顺不能压6张普通炸弹', () => {
    const lastPlay: RuntimeCard[] = [
      makeCard('h9', 'hearts', '9'),
      makeCard('d9', 'diamonds', '9'),
      makeCard('c9', 'clubs', '9'),
      makeCard('s9', 'spades', '9'),
      makeCard('h9-2', 'hearts', '9', { deckIndex: 1 }),
      makeCard('d9-2', 'diamonds', '9', { deckIndex: 1 }),
    ]
    const attempt: RuntimeCard[] = [
      makeCard('h6', 'hearts', '6'),
      makeCard('h7', 'hearts', '7'),
      makeCard('h8', 'hearts', '8'),
      makeCard('h9-sf', 'hearts', '9'),
      makeCard('h10', 'hearts', '10'),
    ]

    expect(canBeat(attempt, lastPlay)).toBe(false)
  })

  it('同级大王不能互压', () => {
    const lastPlay: RuntimeCard[] = [makeJoker('big-last', 'big', 0)]
    const attempt: RuntimeCard[] = [makeJoker('big-attempt', 'big', 1)]

    expect(canBeat(attempt, lastPlay)).toBe(false)
  })

  it('大王可以压过小王', () => {
    const lastPlay: RuntimeCard[] = [makeJoker('small-last', 'small', 0)]
    const attempt: RuntimeCard[] = [makeJoker('big-attempt', 'big', 1)]

    expect(canBeat(attempt, lastPlay)).toBe(true)
  })

  it('两张同级大王应识别为对子', () => {
    const cards: RuntimeCard[] = [
      makeJoker('big-pair-a', 'big', 0),
      makeJoker('big-pair-b', 'big', 1),
    ]

    const result = identifyPattern(cards)
    expect(result.isValid).toBe(true)
    expect(result.patternType).toBe('pair')
  })
})
