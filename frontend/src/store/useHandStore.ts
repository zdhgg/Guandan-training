import { defineStore } from 'pinia'
import type { CardGroup, CardSuit, RuntimeCard } from '../types/cards'

const SUIT_ORDER: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds', 'joker']

const suitPriority = (suit: CardSuit): number => SUIT_ORDER.indexOf(suit)

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

const normalizeCard = (card: RuntimeCard, index: number): RuntimeCard => ({
  ...card,
  deckIndex: card.deckIndex ?? 0,
  logicValue: card.logicValue ?? index + 1,
  isWildcard: Boolean(card.isWildcard),
  isSelected: Boolean(card.isSelected),
})

const sortCardsByLogicDesc = (cards: RuntimeCard[]): RuntimeCard[] =>
  [...cards].sort((left, right) => {
    if (left.logicValue !== right.logicValue) {
      return right.logicValue - left.logicValue
    }

    const suitGap = suitPriority(left.suit) - suitPriority(right.suit)
    if (suitGap !== 0) {
      return suitGap
    }

    return left.id.localeCompare(right.id)
  })

const toSmartGroups = (groups: RuntimeCard[][]): CardGroup[] =>
  groups
    .map((cards, groupIndex) => ({
      groupId: `smart-group-${groupIndex + 1}`,
      cards: cards.map((card, cardIndex) => ({
        ...normalizeCard(card, cardIndex),
        isSelected: false,
      })),
    }))
    .filter((group) => group.cards.length > 0)

export const useHandStore = defineStore('hand', {
  state: () => ({
    cardGroups: [] as CardGroup[],
  }),
  getters: {
    selectedCards: (state): RuntimeCard[] =>
      state.cardGroups.flatMap((group) => group.cards).filter((card) => card.isSelected),
  },
  actions: {
    initHand(cards: RuntimeCard[]): void {
      const normalizedCards = cards.map((card, index) => normalizeCard(card, index))
      this.cardGroups = normalizedCards.length > 0 ? [{ groupId: 'init-group', cards: normalizedCards }] : []
      this.resetGrouping()
    },
    syncHandPreserveGrouping(cards: RuntimeCard[]): void {
      const normalizedCards = cards.map((card, index) => ({
        ...normalizeCard(card, index),
        isSelected: false,
      }))

      if (normalizedCards.length === 0) {
        this.cardGroups = []
        return
      }

      if (this.cardGroups.length === 0) {
        this.initHand(normalizedCards)
        return
      }

      const incomingById = new Map(normalizedCards.map((card) => [card.id, card]))
      const nextGroups: CardGroup[] = []

      for (const group of this.cardGroups) {
        const keptCards: RuntimeCard[] = []

        for (const card of group.cards) {
          const incoming = incomingById.get(card.id)
          if (!incoming) {
            continue
          }
          keptCards.push({
            ...incoming,
            isSelected: false,
          })
          incomingById.delete(card.id)
        }

        if (keptCards.length > 0) {
          nextGroups.push({
            groupId: group.groupId,
            cards: keptCards,
          })
        }
      }

      const extraCards = sortCardsByLogicDesc(Array.from(incomingById.values())).map((card, index) => ({
        ...normalizeCard(card, index),
        isSelected: false,
      }))
      if (extraCards.length > 0) {
        nextGroups.push({
          groupId: `sync-extra-${Date.now()}`,
          cards: extraCards,
        })
      }

      if (nextGroups.length === 0) {
        const resetCards = sortCardsByLogicDesc(normalizedCards).map((card, index) => ({
          ...normalizeCard(card, index),
          isSelected: false,
        }))
        this.cardGroups = [
          {
            groupId: `reset-group-${Date.now()}`,
            cards: resetCards,
          },
        ]
        return
      }

      this.cardGroups = nextGroups
      this.clearSelection()
    },
    moveCard(cardId: string, fromGroupId: string, toGroupId: string, newIndex: number): void {
      const fromGroup = this.cardGroups.find((group) => group.groupId === fromGroupId)
      const toGroup = this.cardGroups.find((group) => group.groupId === toGroupId)

      if (!fromGroup || !toGroup) {
        return
      }

      const fromIndex = fromGroup.cards.findIndex((card) => card.id === cardId)
      if (fromIndex === -1) {
        return
      }

      const [card] = fromGroup.cards.splice(fromIndex, 1)
      if (!card) {
        return
      }

      let insertIndex = clamp(newIndex, 0, toGroup.cards.length)
      if (fromGroupId === toGroupId && fromIndex < insertIndex) {
        insertIndex -= 1
      }

      toGroup.cards.splice(insertIndex, 0, card)
    },
    toggleCardSelection(cardId: string): void {
      for (const group of this.cardGroups) {
        const card = group.cards.find((item) => item.id === cardId)
        if (!card) {
          continue
        }
        card.isSelected = !card.isSelected
        return
      }
    },
    clearSelection(): void {
      for (const group of this.cardGroups) {
        for (const card of group.cards) {
          card.isSelected = false
        }
      }
    },
    extractSelectedToNewGroup(): string | null {
      const selectedCards = this.cardGroups.flatMap((group) => group.cards).filter((card) => card.isSelected)
      if (selectedCards.length === 0) {
        return null
      }

      const selectedIds = new Set(selectedCards.map((card) => card.id))
      this.cardGroups = this.cardGroups
        .map((group) => ({
          ...group,
          cards: group.cards.filter((card) => !selectedIds.has(card.id)),
        }))
        .filter((group) => group.cards.length > 0)

      const extractedCards = selectedCards.map((card) => ({
        ...card,
        isSelected: false,
      }))

      const newGroupId = `manual-group-${Date.now()}`
      this.cardGroups.unshift({
        groupId: newGroupId,
        cards: extractedCards,
      })
      return newGroupId
    },
    removeCards(cardIds: string[]): void {
      const removeSet = new Set(cardIds)
      this.cardGroups = this.cardGroups
        .map((group) => ({
          ...group,
          cards: group.cards.filter((card) => !removeSet.has(card.id)),
        }))
        .filter((group) => group.cards.length > 0)
    },
    applySmartGrouping(groupedCards: RuntimeCard[][]): void {
      this.cardGroups = toSmartGroups(groupedCards)
      this.clearSelection()
    },
    resetGrouping(): void {
      const flattenedCards = this.cardGroups.flatMap((group) => group.cards)
      if (flattenedCards.length === 0) {
        this.cardGroups = []
        return
      }

      const resetCards = sortCardsByLogicDesc(flattenedCards).map((card, index) => ({
        ...normalizeCard(card, index),
        isSelected: false,
      }))

      this.cardGroups = [
        {
          groupId: `reset-group-${Date.now()}`,
          cards: resetCards,
        },
      ]
    },
  },
})
