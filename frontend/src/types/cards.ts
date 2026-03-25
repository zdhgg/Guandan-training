export type CardSuit = 'spades' | 'hearts' | 'clubs' | 'diamonds' | 'joker'
export type CardRank = string

export interface RuntimeCard {
  id: string
  suit: CardSuit
  rank: CardRank
  deckIndex: number
  logicValue: number
  isWildcard: boolean
  isSelected: boolean
}

export type PokerCard = RuntimeCard

export interface CardGroup {
  groupId: string
  cards: RuntimeCard[]
}

export interface CardMovePayload {
  cardId: string
  fromGroupId: string
  toGroupId: string
  newIndex: number
}
