import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHandStore } from './useHandStore'
import type { CardSuit, PokerCard } from '../types/cards'

const suits: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']

function buildUnorderedHand(): PokerCard[] {
  const cards: PokerCard[] = []

  for (let i = 0; i < 25; i++) {
    const suit = suits[i % suits.length] ?? 'hearts'
    const rank = ranks[(i * 3) % ranks.length] ?? '3'

    cards.push({
      id: `card-${i}`,
      suit,
      rank,
      deckIndex: 0,
      logicValue: i + 1,
      isWildcard: false,
      isSelected: false,
    })
  }

  cards.push({
    id: 'wild-1',
    suit: 'hearts',
    rank: '2',
    deckIndex: 1,
    logicValue: 101,
    isWildcard: true,
    isSelected: false,
  })

  cards.push({
    id: 'wild-2',
    suit: 'hearts',
    rank: '2',
    deckIndex: 1,
    logicValue: 102,
    isWildcard: true,
    isSelected: false,
  })

  return cards.reverse()
}

describe('useHandStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initHand 默认将 27 张手牌打散为单组并按 logicValue 降序排列', () => {
    const store = useHandStore()
    const cards = buildUnorderedHand()

    store.initHand(cards)

    const firstGroup = store.cardGroups[0]
    const totalCards = store.cardGroups.reduce((sum, group) => sum + group.cards.length, 0)
    const wildcardCount = store.cardGroups
      .flatMap((group) => group.cards)
      .filter((card) => card.isWildcard).length

    expect(store.cardGroups).toHaveLength(1)
    expect(firstGroup?.groupId.startsWith('reset-group-')).toBe(true)
    expect(firstGroup?.cards).toHaveLength(27)
    expect(totalCards).toBe(27)
    expect(wildcardCount).toBe(2)

    const logicValues = firstGroup?.cards.map((card) => card.logicValue) ?? []
    for (let i = 1; i < logicValues.length; i += 1) {
      expect(logicValues[i - 1]).toBeGreaterThanOrEqual(logicValues[i] ?? Number.NEGATIVE_INFINITY)
    }
  })

  it('moveCard 能处理跨组拖拽并更新源组/目标组数量', () => {
    const store = useHandStore()
    store.initHand(buildUnorderedHand())

    const selectedA = store.cardGroups[0]?.cards[0]?.id
    const selectedB = store.cardGroups[0]?.cards[1]?.id
    expect(selectedA).toBeTruthy()
    expect(selectedB).toBeTruthy()
    if (!selectedA || !selectedB) {
      return
    }

    store.toggleCardSelection(selectedA)
    store.toggleCardSelection(selectedB)
    const newGroupId = store.extractSelectedToNewGroup()

    expect(newGroupId).toBeTruthy()
    if (!newGroupId) {
      return
    }

    const source = store.cardGroups.find((group) => group.groupId !== newGroupId)
    const target = store.cardGroups.find((group) => group.groupId === newGroupId)

    expect(source).toBeDefined()
    expect(target).toBeDefined()
    if (!source || !target) {
      return
    }

    const movingCardId = source.cards[0]?.id
    expect(movingCardId).toBeTruthy()
    if (!movingCardId) {
      return
    }

    const sourceCountBefore = source.cards.length
    const targetCountBefore = target.cards.length

    store.moveCard(movingCardId, source.groupId, target.groupId, 1)

    const sourceAfter = store.cardGroups.find((group) => group.groupId === source.groupId)
    const targetAfter = store.cardGroups.find((group) => group.groupId === target.groupId)

    expect(sourceAfter?.cards.length).toBe(sourceCountBefore - 1)
    expect(targetAfter?.cards.length).toBe(targetCountBefore + 1)
    expect(targetAfter?.cards.some((card) => card.id === movingCardId)).toBe(true)
  })

  it('toggleCardSelection + removeCards 行为正确', () => {
    const store = useHandStore()
    store.initHand(buildUnorderedHand())

    const cardId = store.cardGroups[0]?.cards[0]?.id
    expect(cardId).toBeTruthy()
    if (!cardId) {
      return
    }

    store.toggleCardSelection(cardId)
    expect(store.selectedCards.map((card) => card.id)).toContain(cardId)

    store.removeCards([cardId])
    expect(store.selectedCards.map((card) => card.id)).not.toContain(cardId)
    expect(store.cardGroups.flatMap((group) => group.cards).map((card) => card.id)).not.toContain(cardId)
  })

  it('extractSelectedToNewGroup 会提取选中牌到新组并清理空组', () => {
    const store = useHandStore()
    const cards: PokerCard[] = [
      {
        id: 'spade-1',
        suit: 'spades',
        rank: 'A',
        deckIndex: 0,
        logicValue: 121,
        isWildcard: false,
        isSelected: false,
      },
      {
        id: 'spade-2',
        suit: 'spades',
        rank: 'K',
        deckIndex: 0,
        logicValue: 111,
        isWildcard: false,
        isSelected: false,
      },
      {
        id: 'heart-1',
        suit: 'hearts',
        rank: 'Q',
        deckIndex: 0,
        logicValue: 104,
        isWildcard: false,
        isSelected: false,
      },
    ]

    store.initHand(cards)
    store.toggleCardSelection('spade-1')
    store.toggleCardSelection('spade-2')
    const newGroupId = store.extractSelectedToNewGroup()

    expect(store.cardGroups).toHaveLength(2)
    const extractedGroup = store.cardGroups[0]
    expect(newGroupId?.startsWith('manual-group-')).toBe(true)
    expect(extractedGroup?.groupId).toBe(newGroupId)
    expect(extractedGroup?.cards.map((card) => card.id)).toEqual(['spade-1', 'spade-2'])
    expect(extractedGroup?.cards.every((card) => card.isSelected === false)).toBe(true)
    expect(store.cardGroups[1]?.groupId.startsWith('reset-group-')).toBe(true)
    expect(store.selectedCards).toHaveLength(0)
  })

  it('applySmartGrouping 能用后端分组结果重建 cardGroups', () => {
    const store = useHandStore()
    const cards = buildUnorderedHand()

    const groupedCards = [
      cards.slice(0, 5).map((card, index) => ({ ...card, isSelected: index === 0 })),
      cards.slice(5, 10),
      cards.slice(10),
    ]

    store.applySmartGrouping(groupedCards)

    expect(store.cardGroups.map((group) => group.groupId)).toEqual([
      'smart-group-1',
      'smart-group-2',
      'smart-group-3',
    ])
    expect(store.cardGroups.reduce((sum, group) => sum + group.cards.length, 0)).toBe(27)
    expect(store.selectedCards).toHaveLength(0)
  })

  it('resetGrouping 能将所有牌重置为单组并按 logicValue 降序排列', () => {
    const store = useHandStore()
    store.initHand(buildUnorderedHand())

    const firstCardId = store.cardGroups[0]?.cards[0]?.id
    if (firstCardId) {
      store.toggleCardSelection(firstCardId)
    }

    store.resetGrouping()

    expect(store.cardGroups).toHaveLength(1)
    expect(store.cardGroups[0]?.groupId.startsWith('reset-group-')).toBe(true)
    expect(store.cardGroups[0]?.cards).toHaveLength(27)
    expect(store.selectedCards).toHaveLength(0)

    const logicValues = store.cardGroups[0]?.cards.map((card) => card.logicValue) ?? []
    for (let i = 1; i < logicValues.length; i += 1) {
      expect(logicValues[i - 1]).toBeGreaterThanOrEqual(logicValues[i] ?? Number.NEGATIVE_INFINITY)
    }
  })

  it('syncHandPreserveGrouping 会保留现有分组结构并仅移除已出牌', () => {
    const store = useHandStore()
    const cards = buildUnorderedHand()
    store.initHand(cards)
    store.applySmartGrouping([
      cards.slice(0, 5),
      cards.slice(5, 10),
      cards.slice(10, 15),
      cards.slice(15),
    ])

    const firstGroupBefore = store.cardGroups[0]
    const secondGroupBefore = store.cardGroups[1]
    expect(firstGroupBefore?.cards[0]?.id).toBeTruthy()
    expect(secondGroupBefore?.cards[0]?.id).toBeTruthy()
    if (!firstGroupBefore || !secondGroupBefore || !firstGroupBefore.cards[0] || !secondGroupBefore.cards[0]) {
      return
    }

    const removedIdA = firstGroupBefore.cards[0].id
    const removedIdB = secondGroupBefore.cards[0].id
    const updatedHand = cards.filter((card) => card.id !== removedIdA && card.id !== removedIdB)

    store.syncHandPreserveGrouping(updatedHand)

    expect(store.cardGroups[0]?.groupId).toBe('smart-group-1')
    expect(store.cardGroups[1]?.groupId).toBe('smart-group-2')
    expect(store.cardGroups.flatMap((group) => group.cards).some((card) => card.id === removedIdA)).toBe(false)
    expect(store.cardGroups.flatMap((group) => group.cards).some((card) => card.id === removedIdB)).toBe(false)
    expect(store.cardGroups.reduce((sum, group) => sum + group.cards.length, 0)).toBe(cards.length - 2)
  })
})
