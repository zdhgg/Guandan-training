import { defineStore } from 'pinia'
import type {
  BattleLastPlay,
  BattleMode,
  BattleOpponentState,
  BattlePendingTribute,
  BattleRoundPhase,
  BattleRoundSummary,
  ReturnTributeRule,
  TributePairSummary,
  BattleState,
} from '../api/gameClient'

interface BattleStoreState {
  matchId: string
  playerId: string
  battleMode: BattleMode
  roundNumber: number
  roundPhase: BattleRoundPhase
  antiTributeEnabled: boolean
  doubleDownTributeEnabled: boolean
  returnTributeRule: ReturnTributeRule
  currentLevel: string
  currentTurn: number
  passCount: number
  lastPlay: BattleLastPlay | null
  opponents: BattleOpponentState[]
  finishedSeats: number[]
  rank?: number
  lastRoundSummary: BattleRoundSummary | null
  roundHistory: BattleRoundSummary[]
  tributeQueue: TributePairSummary[]
  pendingTribute: BattlePendingTribute | null
}

const initialState = (): BattleStoreState => ({
  matchId: '',
  playerId: 'player1',
  battleMode: 'human_vs_ai',
  roundNumber: 1,
  roundPhase: 'playing',
  antiTributeEnabled: true,
  doubleDownTributeEnabled: true,
  returnTributeRule: 'any_lower',
  currentLevel: '2',
  currentTurn: 0,
  passCount: 0,
  lastPlay: null,
  opponents: [],
  finishedSeats: [],
  rank: undefined,
  lastRoundSummary: null,
  roundHistory: [],
  tributeQueue: [],
  pendingTribute: null,
})

export const useBattleStore = defineStore('battle', {
  state: (): BattleStoreState => initialState(),
  getters: {
    isPlayerTurn: (state): boolean => state.currentTurn === 0 && state.battleMode === 'human_vs_ai',
    hasActiveMatch: (state): boolean => state.matchId.trim() !== '',
  },
  actions: {
    applyBattleState(snapshot: BattleState): void {
      this.matchId = snapshot.matchId
      this.playerId = snapshot.playerId
      this.battleMode = snapshot.battleMode
      this.roundNumber = snapshot.roundNumber
      this.roundPhase = snapshot.roundPhase
      this.antiTributeEnabled = snapshot.antiTributeEnabled
      this.doubleDownTributeEnabled = snapshot.doubleDownTributeEnabled
      this.returnTributeRule = snapshot.returnTributeRule
      this.currentLevel = snapshot.currentLevel
      this.currentTurn = snapshot.currentTurn
      this.passCount = snapshot.passCount
      this.lastPlay = snapshot.lastPlay
      this.opponents = snapshot.opponents
      this.finishedSeats = snapshot.finishedSeats || []
      this.rank = snapshot.rank
      this.lastRoundSummary = snapshot.lastRoundSummary
      this.roundHistory = snapshot.roundHistory || []
      this.tributeQueue = snapshot.tributeQueue || []
      this.pendingTribute = snapshot.pendingTribute
    },
    resetBattleState(): void {
      Object.assign(this, initialState())
    },
  },
})
