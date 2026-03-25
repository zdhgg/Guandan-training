import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBattleStore } from './useBattleStore'

describe('useBattleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('applyBattleState 会同步实战状态快照', () => {
    const store = useBattleStore()
    store.applyBattleState({
      success: true,
      matchId: 'battle-001',
      playerId: 'player1',
      battleMode: 'human_vs_ai',
      roundNumber: 1,
      roundPhase: 'playing',
      antiTributeEnabled: true,
      doubleDownTributeEnabled: true,
      returnTributeRule: 'any_lower',
      currentLevel: '2',
      currentTurn: 2,
      passCount: 1,
      handCards: [],
      opponents: [
        { playerId: 'player2', seat: 1, cardsLeft: 21, lastThought: '观察一下牌路' },
        { playerId: 'player3', seat: 2, cardsLeft: 27, lastThought: '' },
        { playerId: 'player4', seat: 3, cardsLeft: 19, lastThought: '先稳一手' },
      ],
      finishedSeats: [],
      lastPlay: {
        playerId: 'player4',
        playerSeat: 3,
        cards: [],
        reasoning: '先稳一手',
      },
      lastRoundSummary: null,
      roundHistory: [],
      tributeQueue: [],
      pendingTribute: null,
    })

    expect(store.matchId).toBe('battle-001')
    expect(store.battleMode).toBe('human_vs_ai')
    expect(store.currentLevel).toBe('2')
    expect(store.currentTurn).toBe(2)
    expect(store.passCount).toBe(1)
    expect(store.opponents).toHaveLength(3)
    expect(store.isPlayerTurn).toBe(false)
    expect(store.hasActiveMatch).toBe(true)
  })

  it('resetBattleState 会清空状态', () => {
    const store = useBattleStore()
    store.applyBattleState({
      success: true,
      matchId: 'battle-001',
      playerId: 'player1',
      battleMode: 'ai_vs_ai',
      roundNumber: 1,
      roundPhase: 'playing',
      antiTributeEnabled: true,
      doubleDownTributeEnabled: true,
      returnTributeRule: 'any_lower',
      currentLevel: '2',
      currentTurn: 0,
      passCount: 0,
      handCards: [],
      opponents: [],
      finishedSeats: [],
      lastPlay: null,
      lastRoundSummary: null,
      roundHistory: [],
      tributeQueue: [],
      pendingTribute: null,
    })

    store.resetBattleState()
    expect(store.matchId).toBe('')
    expect(store.battleMode).toBe('human_vs_ai')
    expect(store.currentTurn).toBe(0)
    expect(store.lastPlay).toBeNull()
    expect(store.opponents).toHaveLength(0)
    expect(store.hasActiveMatch).toBe(false)
  })

  it('ai_vs_ai 模式下即使 currentTurn 为 0 也不会视为玩家回合', () => {
    const store = useBattleStore()
    store.applyBattleState({
      success: true,
      matchId: 'battle-002',
      playerId: 'player1',
      battleMode: 'ai_vs_ai',
      roundNumber: 1,
      roundPhase: 'playing',
      antiTributeEnabled: true,
      doubleDownTributeEnabled: true,
      returnTributeRule: 'any_lower',
      currentLevel: '2',
      currentTurn: 0,
      passCount: 0,
      handCards: [],
      opponents: [],
      finishedSeats: [],
      lastPlay: null,
      lastRoundSummary: null,
      roundHistory: [],
      tributeQueue: [],
      pendingTribute: null,
    })

    expect(store.isPlayerTurn).toBe(false)
  })
})
