import type { RuntimeCard } from '../types/cards'
import { useSettingsStore } from '../store/useSettingsStore'
import type { AIPlayerPersonality } from '../store/useSettingsStore'
import { pinia } from '../store'

export type BattleMode = 'human_vs_ai' | 'ai_vs_ai'
export type BattleRoundPhase = 'playing' | 'finished' | 'awaiting_tribute' | 'awaiting_return'
export type ReturnTributeRule = 'any_lower' | 'lowest_only'

export interface TributePairSummary {
  order: number
  giverSeat: number
  receiverSeat: number
  phase: 'planned' | 'awaiting_tribute' | 'awaiting_return' | 'completed' | 'skipped_anti_tribute'
  tributeCard?: RuntimeCard
  antiTributeApplied?: boolean
  antiTributeReason?: string
}

export interface BattleRoundSummary {
  roundNumber: number
  finishedSeats: number[]
  winnerTeam: 'teamA' | 'teamB' | 'unknown'
  levelBefore: string
  levelAfter: string
  upgradeSteps: number
  resultLabel: string
  tributeRequired: boolean
  tributeGiverSeat?: number
  tributeReceiverSeat?: number
  antiTributeApplied?: boolean
  antiTributeReason?: string
  tributePairs?: TributePairSummary[]
}

export interface BattlePendingTribute {
  exchangeIndex: number
  totalExchanges: number
  phase: 'awaiting_tribute' | 'awaiting_return'
  giverSeat: number
  receiverSeat: number
  tributeCard?: RuntimeCard
  requiredAction?: 'give' | 'return'
}

export interface SubmitPlayResult {
  success: boolean
  message?: string
  nextTurnPlayerId?: string
}

export interface TrainingGroupValidationResult {
  groupIndex: number
  cardCount: number
  isValid: boolean
  patternType: string
  powerLevel: number
}

export interface ValidateTrainingGroupsResult {
  success: boolean
  message?: string
  totalMoves?: number
  invalidGroupIndex?: number
  invalidGroup?: RuntimeCard[]
  groupResults?: TrainingGroupValidationResult[]
}

export interface AutoGroupTrainingResult {
  success: boolean
  message?: string
  groupedCards: RuntimeCard[][]
  totalGroups?: number
  allGroupings?: {
    strategyName: string
    groups: RuntimeCard[][]
    score: number
    scoreBreakdown?: {
      handCountPenalty: number
      patternContribution: number
      contextAdjustment: number
      totalScore: number
    }
    reasonTags?: string[]
  }[]
}

export interface BattleOpponentState {
  playerId: string
  seat: number
  cardsLeft: number
  lastThought: string
  rank?: number
}

export interface BattleLastPlay {
  playerId: string
  playerSeat: number
  cards: RuntimeCard[]
  reasoning: string
}

export interface BattleTurnEvent {
  playerId: string
  playerSeat: number
  action: 'play' | 'pass'
  cards: RuntimeCard[]
  reasoning: string
  speech?: string
  decisionInsight?: BattleTurnDecisionInsight
}

export interface BattleTurnDecisionTacticalSignals {
  hasLastPlay: boolean
  lastPlayByTeammate: boolean
  lastPlayByOpponent: boolean
  teammateCardsLeft?: number
  minOpponentCardsLeft?: number
  teammateNearFinish: boolean
  opponentNearFinish: boolean
  opponentCritical: boolean
}

export interface BattleTurnDecisionCandidate {
  index: number
  action: 'play' | 'pass'
  summary: string
  patternType: string
  powerLevel: number
  score?: number
  cardIds: string[]
  tacticHints?: string[]
}

export interface BattleTurnDecisionInsight {
  decisionMode: 'candidate' | 'legacy'
  tacticalSignals?: BattleTurnDecisionTacticalSignals
  selectedAction: 'play' | 'pass'
  selectedCandidateIndex?: number
  selectedSummary?: string
  selectedScore?: number
  topCandidates?: BattleTurnDecisionCandidate[]
}

export interface BattlePlayStreamReadyEvent {
  type: 'ready'
  success: boolean
  matchId: string
}

export interface BattlePlayStreamPlayerActionEvent {
  type: 'player_action_applied'
  action: 'play' | 'pass'
  cards: RuntimeCard[]
  state: BattleState
}

export interface BattlePlayStreamAiTurnStartEvent {
  type: 'ai_turn_start'
  playerId: string
  playerSeat: number
  state: BattleState
}

export interface BattlePlayStreamAiTurnEvent {
  type: 'ai_turn_event'
  event: BattleTurnEvent
  state: BattleState
}

export interface BattlePlayStreamCompleteEvent {
  type: 'complete'
  state: BattleState
}

export interface BattlePlayStreamErrorEvent {
  type: 'error'
  success: false
  message: string
}

export type BattlePlayStreamEvent =
  | BattlePlayStreamReadyEvent
  | BattlePlayStreamPlayerActionEvent
  | BattlePlayStreamAiTurnStartEvent
  | BattlePlayStreamAiTurnEvent
  | BattlePlayStreamCompleteEvent
  | BattlePlayStreamErrorEvent

export interface BattleStateSnapshot {
  success: boolean
  message?: string
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
  handCards: RuntimeCard[]
  opponents: BattleOpponentState[]
  lastPlay: BattleLastPlay | null
  finishedSeats: number[]
  rank?: number
  lastRoundSummary: BattleRoundSummary | null
  roundHistory: BattleRoundSummary[]
  tributeQueue: TributePairSummary[]
  pendingTribute: BattlePendingTribute | null
  turnEvents?: BattleTurnEvent[]
}

export interface BattleTimelineEntry {
  id: string
  stepNumber: number
  playerId: string
  playerSeat: number
  source: 'player' | 'ai'
  action: 'play' | 'pass'
  cards: RuntimeCard[]
  reasoning: string
  speech?: string
  decisionInsight?: BattleTurnDecisionInsight
  state: BattleStateSnapshot
}

export interface BattleState extends BattleStateSnapshot {
  timelineEntries?: BattleTimelineEntry[]
}

export interface BattleSessionSummary {
  matchId: string
  battleMode: BattleMode
  roundNumber: number
  roundPhase: BattleRoundPhase
  antiTributeEnabled: boolean
  doubleDownTributeEnabled: boolean
  returnTributeRule: ReturnTributeRule
  currentLevel: string
  currentTurn: number
  stepCount: number
  finishedSeats: number[]
  createdAt: string
  updatedAt: string
  endedAt?: string
  lastRoundSummary: BattleRoundSummary | null
  lastAction?: {
    playerId: string
    playerSeat: number
    action: 'play' | 'pass'
    stepNumber: number
  }
}

export interface BattleAutoGroupContextPlayer {
  seat: number
  cardsLeft: number
  isTeammate: boolean
  rank?: number
}

export interface BattleAutoGroupContext {
  players: BattleAutoGroupContextPlayer[]
  currentTurn?: number
  currentLevel?: string
  lastPlay?: BattleLastPlay | null
}

export interface LLMConnectivityResult {
  success: boolean
  message: string
  model: string
  latencyMs: number
  statusCode?: number
  errorType?: string
}

interface NewTrainingHandResponse {
  success?: boolean
  message?: string
  cards?: RuntimeCard[]
  totalCards?: number
}

interface CreateMatchResponse {
  success: boolean
  message?: string
  matchId?: string
}

interface BattleStreamOptions {
  signal?: AbortSignal
  llmOverride?: BattleLLMHeaderOverride
}

interface BattleRequestOptions {
  signal?: AbortSignal
  llmOverride?: BattleLLMHeaderOverride
}

export interface BattleLLMHeaderOverride {
  seatPersonalities?: Partial<Record<0 | 1 | 2 | 3, AIPlayerPersonality>>
}

export interface BattleMetricsBucket {
  turnCount: number
  llmCalls: number
  llmSuccesses: number
  fallbacks: number
  timeoutErrors: number
  parseErrors: number
  illegalOutputs: number
  totalLatencyMs: number
  avgLatencyMs: number
  llmSuccessRate: number
  fallbackRate: number
  timeoutRate: number
  parseErrorRate: number
  illegalOutputRate: number
}

export interface BattleMetricsSnapshot {
  success: boolean
  generatedAt: string
  totals: BattleMetricsBucket
  byDecisionMode: Record<string, BattleMetricsBucket>
  byPersonality: Record<string, BattleMetricsBucket>
  byModel: Record<string, BattleMetricsBucket>
  battleOutcomes: {
    totalFinished: number
    teamAWins: number
    teamBWins: number
    unknown: number
  }
}

type InitialHandsResponse = RuntimeCard[] | { cards: RuntimeCard[] }

const normalizeApiBaseUrl = (rawUrl: string | undefined): string => {
  const input = (rawUrl ?? '').trim()
  if (input === '') {
    return ''
  }

  // 误写 ":8005" 视为无效，回退为同源 /api 代理。
  if (input.startsWith(':')) {
    return ''
  }

  // 支持路径写法，例如 "/api"（会在后续剔除重复 /api）。
  if (input.startsWith('/')) {
    return input.replace(/\/+$/, '')
  }

  if (/^https?:\/\//i.test(input)) {
    return input.replace(/\/+$/, '')
  }

  // 仅允许明确的主机格式，避免把 "api" 当成域名导致 ERR_NAME_NOT_RESOLVED。
  const isLocalHost = /^localhost(?::\d+)?$/i.test(input)
  const isHostWithPort = /^[a-zA-Z0-9.-]+:\d+$/.test(input)
  const isDomainLike = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?::\d+)?$/.test(input)

  if (isLocalHost || isHostWithPort || isDomainLike) {
    return `http://${input}`.replace(/\/+$/, '')
  }

  return ''
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL).replace(/\/api$/i, '')
const API_PREFIX = '/api'
const DEFAULT_PLAYER_ID = import.meta.env.VITE_PLAYER_ID ?? 'player1'
const API_ROOT = `${API_BASE_URL}${API_PREFIX}`

const buildUrl = (path: string): string => `${API_ROOT}${path}`
type RequestHeaders = Record<string, string>

const readDynamicLLMHeaders = (override?: BattleLLMHeaderOverride): RequestHeaders => {
  const settingsStore = useSettingsStore(pinia)
  const llmBaseUrl = settingsStore.llmBaseUrl.trim()
  const llmApiKey = settingsStore.llmApiKey.trim()
  const llmModel = settingsStore.llmModel.trim()
  const llmTimeoutMs = settingsStore.llmTimeoutMs
  const decisionMode = settingsStore.llmDecisionMode
  const pAgg = settingsStore.llmPromptAggressive
  const pCon = settingsStore.llmPromptConservative
  const pBal = settingsStore.llmPromptBalanced
  const profileAgg = settingsStore.llmProfileAggressive
  const profileCon = settingsStore.llmProfileConservative
  const profileBal = settingsStore.llmProfileBalanced
  const s0P = override?.seatPersonalities?.[0] ?? settingsStore.seat0Personality
  const s1P = override?.seatPersonalities?.[1] ?? settingsStore.seat1Personality
  const s2P = override?.seatPersonalities?.[2] ?? settingsStore.seat2Personality
  const s3P = override?.seatPersonalities?.[3] ?? settingsStore.seat3Personality
  const speechStyle = settingsStore.battleSpeechStyle
  const tauntLevel = settingsStore.battleTauntLevel
  const antiTributeEnabled = settingsStore.battleEnableAntiTribute
  const doubleDownTributeEnabled = settingsStore.battleEnableDoubleDownTribute
  const returnTributeRule = settingsStore.battleReturnTributeRule

  const dynamicHeaders: RequestHeaders = {}

  if (llmBaseUrl) {
    dynamicHeaders['X-LLM-Base-Url'] = llmBaseUrl
  }
  if (llmApiKey) {
    dynamicHeaders['X-LLM-Api-Key'] = llmApiKey
  }
  if (llmModel) {
    dynamicHeaders['X-LLM-Model'] = llmModel
  }
  if (typeof llmTimeoutMs === 'number' && llmTimeoutMs > 0) {
    dynamicHeaders['X-LLM-Timeout-Ms'] = llmTimeoutMs.toString()
  }
  if (decisionMode) {
    dynamicHeaders['X-LLM-Decision-Mode'] = decisionMode
  }
  if (pAgg) dynamicHeaders['X-LLM-Prompt-Aggressive'] = encodeURIComponent(pAgg)
  if (pCon) dynamicHeaders['X-LLM-Prompt-Conservative'] = encodeURIComponent(pCon)
  if (pBal) dynamicHeaders['X-LLM-Prompt-Balanced'] = encodeURIComponent(pBal)
  if (profileAgg) dynamicHeaders['X-LLM-Profile-Aggressive'] = encodeURIComponent(profileAgg)
  if (profileCon) dynamicHeaders['X-LLM-Profile-Conservative'] = encodeURIComponent(profileCon)
  if (profileBal) dynamicHeaders['X-LLM-Profile-Balanced'] = encodeURIComponent(profileBal)

  if (s0P) dynamicHeaders['X-LLM-Seat0-Personality'] = s0P
  if (s1P) dynamicHeaders['X-LLM-Seat1-Personality'] = s1P
  if (s2P) dynamicHeaders['X-LLM-Seat2-Personality'] = s2P
  if (s3P) dynamicHeaders['X-LLM-Seat3-Personality'] = s3P
  if (speechStyle) dynamicHeaders['X-LLM-Speech-Style'] = speechStyle
  if (tauntLevel) dynamicHeaders['X-LLM-Taunt-Level'] = tauntLevel
  dynamicHeaders['X-Battle-Anti-Tribute'] = antiTributeEnabled ? 'true' : 'false'
  dynamicHeaders['X-Battle-Double-Down-Tribute'] = doubleDownTributeEnabled ? 'true' : 'false'
  dynamicHeaders['X-Battle-Return-Tribute-Rule'] = returnTributeRule === 'lowest_only' ? 'lowest_only' : 'any_lower'

  return dynamicHeaders
}

const buildRequestHeaders = (baseHeaders: RequestHeaders, override?: BattleLLMHeaderOverride): RequestHeaders => ({
  ...baseHeaders,
  ...readDynamicLLMHeaders(override),
})

const normalizeBattleTurnEvent = (event: unknown): BattleTurnEvent => {
  const raw = typeof event === 'object' && event !== null ? event as Partial<BattleTurnEvent> : {}

  return {
    playerId: typeof raw.playerId === 'string' ? raw.playerId : '',
    playerSeat: typeof raw.playerSeat === 'number' ? raw.playerSeat : -1,
    action: raw.action === 'play' ? 'play' : 'pass',
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
    speech: typeof raw.speech === 'string' ? raw.speech : undefined,
    decisionInsight:
      raw.decisionInsight &&
        typeof raw.decisionInsight === 'object' &&
        (raw.decisionInsight.decisionMode === 'candidate' || raw.decisionInsight.decisionMode === 'legacy') &&
        (raw.decisionInsight.selectedAction === 'play' || raw.decisionInsight.selectedAction === 'pass')
        ? {
          decisionMode: raw.decisionInsight.decisionMode,
          selectedAction: raw.decisionInsight.selectedAction,
          selectedCandidateIndex:
            typeof raw.decisionInsight.selectedCandidateIndex === 'number'
              ? raw.decisionInsight.selectedCandidateIndex
              : undefined,
          selectedSummary:
            typeof raw.decisionInsight.selectedSummary === 'string'
              ? raw.decisionInsight.selectedSummary
              : undefined,
          selectedScore:
            typeof raw.decisionInsight.selectedScore === 'number'
              ? raw.decisionInsight.selectedScore
              : undefined,
          tacticalSignals:
            raw.decisionInsight.tacticalSignals &&
              typeof raw.decisionInsight.tacticalSignals === 'object'
              ? {
                hasLastPlay: Boolean(raw.decisionInsight.tacticalSignals.hasLastPlay),
                lastPlayByTeammate: Boolean(raw.decisionInsight.tacticalSignals.lastPlayByTeammate),
                lastPlayByOpponent: Boolean(raw.decisionInsight.tacticalSignals.lastPlayByOpponent),
                teammateCardsLeft:
                  typeof raw.decisionInsight.tacticalSignals.teammateCardsLeft === 'number'
                    ? raw.decisionInsight.tacticalSignals.teammateCardsLeft
                    : undefined,
                minOpponentCardsLeft:
                  typeof raw.decisionInsight.tacticalSignals.minOpponentCardsLeft === 'number'
                    ? raw.decisionInsight.tacticalSignals.minOpponentCardsLeft
                    : undefined,
                teammateNearFinish: Boolean(raw.decisionInsight.tacticalSignals.teammateNearFinish),
                opponentNearFinish: Boolean(raw.decisionInsight.tacticalSignals.opponentNearFinish),
                opponentCritical: Boolean(raw.decisionInsight.tacticalSignals.opponentCritical),
              }
              : undefined,
          topCandidates: Array.isArray(raw.decisionInsight.topCandidates)
            ? raw.decisionInsight.topCandidates.reduce<BattleTurnDecisionCandidate[]>((acc, candidate) => {
              if (!candidate || typeof candidate !== 'object') {
                return acc
              }

              const normalizedAction = candidate.action === 'play' ? 'play' : candidate.action === 'pass' ? 'pass' : null
              if (!normalizedAction) {
                return acc
              }

              const normalizedIndex = typeof candidate.index === 'number' ? candidate.index : -1
              if (normalizedIndex < 0) {
                return acc
              }

              const normalizedCandidate: BattleTurnDecisionCandidate = {
                index: normalizedIndex,
                action: normalizedAction,
                summary: typeof candidate.summary === 'string' ? candidate.summary : '',
                patternType: typeof candidate.patternType === 'string' ? candidate.patternType : 'unknown',
                powerLevel: typeof candidate.powerLevel === 'number' ? candidate.powerLevel : 0,
                cardIds: Array.isArray(candidate.cardIds)
                  ? candidate.cardIds.filter((id): id is string => typeof id === 'string')
                  : [],
              }

              if (typeof candidate.score === 'number') {
                normalizedCandidate.score = candidate.score
              }
              if (Array.isArray(candidate.tacticHints)) {
                normalizedCandidate.tacticHints = candidate.tacticHints.filter(
                  (hint): hint is string => typeof hint === 'string',
                )
              }

              acc.push(normalizedCandidate)
              return acc
            }, [])
            : undefined,
        }
        : undefined,
  }
}

const normalizeHandPayload = (payload: InitialHandsResponse): RuntimeCard[] =>
  Array.isArray(payload) ? payload : payload.cards

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { message?: string } | null
    if (payload?.message) {
      return payload.message
    }
  } catch {
    // ignore json parse error and fallback to status text
  }
  return `${response.status} ${response.statusText}`
}

const normalizeTributePairSummary = (payload: unknown, fallbackOrder = 1): TributePairSummary | null => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const raw = payload as Partial<TributePairSummary>
  if (typeof raw.giverSeat !== 'number' || typeof raw.receiverSeat !== 'number') {
    return null
  }

  return {
    order: typeof raw.order === 'number' ? raw.order : fallbackOrder,
    giverSeat: raw.giverSeat,
    receiverSeat: raw.receiverSeat,
    phase:
      raw.phase === 'awaiting_tribute' ||
      raw.phase === 'awaiting_return' ||
      raw.phase === 'completed' ||
      raw.phase === 'skipped_anti_tribute'
        ? raw.phase
        : 'planned',
    tributeCard: raw.tributeCard && typeof raw.tributeCard.id === 'string' ? raw.tributeCard : undefined,
    antiTributeApplied: raw.antiTributeApplied === true,
    antiTributeReason: typeof raw.antiTributeReason === 'string' ? raw.antiTributeReason : undefined,
  }
}

const normalizeBattleStateSnapshot = (payload: Partial<BattleStateSnapshot> | null): BattleStateSnapshot => ({
  success: payload?.success ?? true,
  message: payload?.message,
  matchId: payload?.matchId ?? '',
  playerId: payload?.playerId ?? DEFAULT_PLAYER_ID,
  battleMode: payload?.battleMode === 'ai_vs_ai' ? 'ai_vs_ai' : 'human_vs_ai',
  roundNumber: typeof payload?.roundNumber === 'number' && payload.roundNumber > 0 ? payload.roundNumber : 1,
  roundPhase:
    payload?.roundPhase === 'finished' || payload?.roundPhase === 'awaiting_tribute' || payload?.roundPhase === 'awaiting_return'
      ? payload.roundPhase
      : 'playing',
  antiTributeEnabled: payload?.antiTributeEnabled !== false,
  doubleDownTributeEnabled: payload?.doubleDownTributeEnabled !== false,
  returnTributeRule: payload?.returnTributeRule === 'lowest_only' ? 'lowest_only' : 'any_lower',
  currentLevel: payload?.currentLevel ?? '2',
  currentTurn: payload?.currentTurn ?? 0,
  passCount: payload?.passCount ?? 0,
  handCards: Array.isArray(payload?.handCards) ? payload?.handCards : [],
  opponents: Array.isArray(payload?.opponents)
    ? payload.opponents.map((opponent) => ({
      playerId: typeof opponent?.playerId === 'string' ? opponent.playerId : '',
      seat: typeof opponent?.seat === 'number' ? opponent.seat : -1,
      cardsLeft: typeof opponent?.cardsLeft === 'number' ? opponent.cardsLeft : 0,
      lastThought: typeof opponent?.lastThought === 'string' ? opponent.lastThought : '',
      rank: typeof opponent?.rank === 'number' ? opponent.rank : undefined,
    }))
    : [],
  lastPlay:
    payload?.lastPlay &&
      typeof payload.lastPlay.playerId === 'string' &&
      typeof payload.lastPlay.playerSeat === 'number' &&
      Array.isArray(payload.lastPlay.cards)
      ? {
        playerId: payload.lastPlay.playerId,
        playerSeat: payload.lastPlay.playerSeat,
        cards: payload.lastPlay.cards,
        reasoning: typeof payload.lastPlay.reasoning === 'string' ? payload.lastPlay.reasoning : '',
      }
      : null,
  finishedSeats: Array.isArray(payload?.finishedSeats) ? payload.finishedSeats : [],
  rank: typeof payload?.rank === 'number' ? payload.rank : undefined,
  lastRoundSummary:
    payload?.lastRoundSummary &&
    typeof payload.lastRoundSummary.levelBefore === 'string' &&
    typeof payload.lastRoundSummary.levelAfter === 'string'
      ? {
        finishedSeats: Array.isArray(payload.lastRoundSummary.finishedSeats) ? payload.lastRoundSummary.finishedSeats : [],
        winnerTeam:
          payload.lastRoundSummary.winnerTeam === 'teamA' || payload.lastRoundSummary.winnerTeam === 'teamB'
            ? payload.lastRoundSummary.winnerTeam
            : 'unknown',
        levelBefore: payload.lastRoundSummary.levelBefore,
        levelAfter: payload.lastRoundSummary.levelAfter,
        upgradeSteps:
          typeof payload.lastRoundSummary.upgradeSteps === 'number' ? payload.lastRoundSummary.upgradeSteps : 0,
        resultLabel: typeof payload.lastRoundSummary.resultLabel === 'string' ? payload.lastRoundSummary.resultLabel : '',
        tributeRequired: Boolean(payload.lastRoundSummary.tributeRequired),
        tributeGiverSeat:
          typeof payload.lastRoundSummary.tributeGiverSeat === 'number'
            ? payload.lastRoundSummary.tributeGiverSeat
            : undefined,
        tributeReceiverSeat:
          typeof payload.lastRoundSummary.tributeReceiverSeat === 'number'
            ? payload.lastRoundSummary.tributeReceiverSeat
            : undefined,
        antiTributeApplied: payload.lastRoundSummary.antiTributeApplied === true,
        antiTributeReason:
          typeof payload.lastRoundSummary.antiTributeReason === 'string'
            ? payload.lastRoundSummary.antiTributeReason
            : undefined,
        roundNumber: typeof payload.lastRoundSummary.roundNumber === 'number' ? payload.lastRoundSummary.roundNumber : 1,
        tributePairs: Array.isArray(payload.lastRoundSummary.tributePairs)
          ? payload.lastRoundSummary.tributePairs
            .map((pair, index) => normalizeTributePairSummary(pair, index + 1))
            .filter((pair): pair is TributePairSummary => pair !== null)
          : undefined,
      }
      : null,
  roundHistory: Array.isArray(payload?.roundHistory)
    ? payload.roundHistory.reduce<BattleRoundSummary[]>((acc, item) => {
      if (!item || typeof item.levelBefore !== 'string' || typeof item.levelAfter !== 'string') {
        return acc
      }
      acc.push({
        roundNumber: typeof item.roundNumber === 'number' ? item.roundNumber : acc.length + 1,
        finishedSeats: Array.isArray(item.finishedSeats) ? item.finishedSeats : [],
        winnerTeam: item.winnerTeam === 'teamA' || item.winnerTeam === 'teamB' ? item.winnerTeam : 'unknown',
        levelBefore: item.levelBefore,
        levelAfter: item.levelAfter,
        upgradeSteps: typeof item.upgradeSteps === 'number' ? item.upgradeSteps : 0,
        resultLabel: typeof item.resultLabel === 'string' ? item.resultLabel : '',
        tributeRequired: Boolean(item.tributeRequired),
        tributeGiverSeat: typeof item.tributeGiverSeat === 'number' ? item.tributeGiverSeat : undefined,
        tributeReceiverSeat: typeof item.tributeReceiverSeat === 'number' ? item.tributeReceiverSeat : undefined,
        antiTributeApplied: item.antiTributeApplied === true,
        antiTributeReason: typeof item.antiTributeReason === 'string' ? item.antiTributeReason : undefined,
      })
      return acc
    }, [])
    : [],
  tributeQueue: Array.isArray(payload?.tributeQueue)
    ? payload.tributeQueue
      .map((pair, index) => normalizeTributePairSummary(pair, index + 1))
      .filter((pair): pair is TributePairSummary => pair !== null)
    : [],
  pendingTribute:
    payload?.pendingTribute &&
    (payload.pendingTribute.phase === 'awaiting_tribute' || payload.pendingTribute.phase === 'awaiting_return')
      ? {
        exchangeIndex: typeof payload.pendingTribute.exchangeIndex === 'number' ? payload.pendingTribute.exchangeIndex : 0,
        totalExchanges: typeof payload.pendingTribute.totalExchanges === 'number' ? payload.pendingTribute.totalExchanges : 1,
        phase: payload.pendingTribute.phase,
        giverSeat: typeof payload.pendingTribute.giverSeat === 'number' ? payload.pendingTribute.giverSeat : -1,
        receiverSeat: typeof payload.pendingTribute.receiverSeat === 'number' ? payload.pendingTribute.receiverSeat : -1,
        tributeCard:
          payload.pendingTribute.tributeCard && typeof payload.pendingTribute.tributeCard.id === 'string'
            ? payload.pendingTribute.tributeCard
            : undefined,
        requiredAction:
          payload.pendingTribute.requiredAction === 'give' || payload.pendingTribute.requiredAction === 'return'
            ? payload.pendingTribute.requiredAction
            : undefined,
      }
      : null,
  turnEvents: Array.isArray(payload?.turnEvents)
    ? payload.turnEvents.map((event) => normalizeBattleTurnEvent(event))
    : [],
})

const normalizeBattleTimelineEntry = (payload: unknown): BattleTimelineEntry | null => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const raw = payload as Partial<BattleTimelineEntry>
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    stepNumber: typeof raw.stepNumber === 'number' ? raw.stepNumber : 0,
    playerId: typeof raw.playerId === 'string' ? raw.playerId : '',
    playerSeat: typeof raw.playerSeat === 'number' ? raw.playerSeat : -1,
    source: raw.source === 'player' ? 'player' : 'ai',
    action: raw.action === 'play' ? 'play' : 'pass',
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
    speech: typeof raw.speech === 'string' ? raw.speech : undefined,
    decisionInsight:
      raw.decisionInsight &&
      typeof raw.decisionInsight === 'object' &&
      (raw.decisionInsight.decisionMode === 'candidate' || raw.decisionInsight.decisionMode === 'legacy') &&
      (raw.decisionInsight.selectedAction === 'play' || raw.decisionInsight.selectedAction === 'pass')
        ? normalizeBattleTurnEvent({
          playerId: '',
          playerSeat: 0,
          action: 'pass',
          cards: [],
          reasoning: '',
          decisionInsight: raw.decisionInsight,
        }).decisionInsight
        : undefined,
    state: normalizeBattleStateSnapshot(raw.state ?? null),
  }
}

const normalizeBattleState = (payload: Partial<BattleState> | null): BattleState => ({
  ...normalizeBattleStateSnapshot(payload),
  timelineEntries: Array.isArray(payload?.timelineEntries)
    ? payload.timelineEntries
      .map((entry) => normalizeBattleTimelineEntry(entry))
      .filter((entry): entry is BattleTimelineEntry => entry !== null)
    : [],
})

const normalizeBattleSessionSummary = (payload: unknown): BattleSessionSummary | null => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const raw = payload as Partial<BattleSessionSummary>
  if (typeof raw.matchId !== 'string' || raw.matchId.trim() === '') {
    return null
  }

  return {
    matchId: raw.matchId,
    battleMode: raw.battleMode === 'ai_vs_ai' ? 'ai_vs_ai' : 'human_vs_ai',
    roundNumber: typeof raw.roundNumber === 'number' && raw.roundNumber > 0 ? raw.roundNumber : 1,
    roundPhase:
      raw.roundPhase === 'finished' || raw.roundPhase === 'awaiting_tribute' || raw.roundPhase === 'awaiting_return'
        ? raw.roundPhase
        : 'playing',
    antiTributeEnabled: raw.antiTributeEnabled !== false,
    doubleDownTributeEnabled: raw.doubleDownTributeEnabled !== false,
    returnTributeRule: raw.returnTributeRule === 'lowest_only' ? 'lowest_only' : 'any_lower',
    currentLevel: typeof raw.currentLevel === 'string' ? raw.currentLevel : '2',
    currentTurn: typeof raw.currentTurn === 'number' ? raw.currentTurn : 0,
    stepCount: typeof raw.stepCount === 'number' ? raw.stepCount : 0,
    finishedSeats: Array.isArray(raw.finishedSeats)
      ? raw.finishedSeats.filter((seat): seat is number => typeof seat === 'number')
      : [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    endedAt: typeof raw.endedAt === 'string' ? raw.endedAt : undefined,
    lastRoundSummary:
      raw.lastRoundSummary &&
      typeof raw.lastRoundSummary.levelBefore === 'string' &&
      typeof raw.lastRoundSummary.levelAfter === 'string'
        ? {
          roundNumber: typeof raw.lastRoundSummary.roundNumber === 'number' ? raw.lastRoundSummary.roundNumber : 1,
          finishedSeats: Array.isArray(raw.lastRoundSummary.finishedSeats) ? raw.lastRoundSummary.finishedSeats : [],
          winnerTeam:
            raw.lastRoundSummary.winnerTeam === 'teamA' || raw.lastRoundSummary.winnerTeam === 'teamB'
              ? raw.lastRoundSummary.winnerTeam
              : 'unknown',
          levelBefore: raw.lastRoundSummary.levelBefore,
          levelAfter: raw.lastRoundSummary.levelAfter,
          upgradeSteps: typeof raw.lastRoundSummary.upgradeSteps === 'number' ? raw.lastRoundSummary.upgradeSteps : 0,
          resultLabel: typeof raw.lastRoundSummary.resultLabel === 'string' ? raw.lastRoundSummary.resultLabel : '',
          tributeRequired: Boolean(raw.lastRoundSummary.tributeRequired),
          tributeGiverSeat:
            typeof raw.lastRoundSummary.tributeGiverSeat === 'number'
              ? raw.lastRoundSummary.tributeGiverSeat
              : undefined,
          tributeReceiverSeat:
            typeof raw.lastRoundSummary.tributeReceiverSeat === 'number'
              ? raw.lastRoundSummary.tributeReceiverSeat
              : undefined,
          antiTributeApplied: raw.lastRoundSummary.antiTributeApplied === true,
        antiTributeReason:
          typeof raw.lastRoundSummary.antiTributeReason === 'string'
            ? raw.lastRoundSummary.antiTributeReason
            : undefined,
          tributePairs: Array.isArray(raw.lastRoundSummary.tributePairs)
            ? raw.lastRoundSummary.tributePairs
              .map((pair, index) => normalizeTributePairSummary(pair, index + 1))
              .filter((pair): pair is TributePairSummary => pair !== null)
            : undefined,
        }
        : null,
    lastAction:
      raw.lastAction &&
      typeof raw.lastAction === 'object' &&
      typeof raw.lastAction.playerId === 'string' &&
      typeof raw.lastAction.playerSeat === 'number' &&
      typeof raw.lastAction.stepNumber === 'number'
        ? {
          playerId: raw.lastAction.playerId,
          playerSeat: raw.lastAction.playerSeat,
          action: raw.lastAction.action === 'play' ? 'play' : 'pass',
          stepNumber: raw.lastAction.stepNumber,
        }
        : undefined,
  }
}

const normalizeBattleMetricsBucket = (payload: Partial<BattleMetricsBucket> | null): BattleMetricsBucket => ({
  turnCount: typeof payload?.turnCount === 'number' ? payload.turnCount : 0,
  llmCalls: typeof payload?.llmCalls === 'number' ? payload.llmCalls : 0,
  llmSuccesses: typeof payload?.llmSuccesses === 'number' ? payload.llmSuccesses : 0,
  fallbacks: typeof payload?.fallbacks === 'number' ? payload.fallbacks : 0,
  timeoutErrors: typeof payload?.timeoutErrors === 'number' ? payload.timeoutErrors : 0,
  parseErrors: typeof payload?.parseErrors === 'number' ? payload.parseErrors : 0,
  illegalOutputs: typeof payload?.illegalOutputs === 'number' ? payload.illegalOutputs : 0,
  totalLatencyMs: typeof payload?.totalLatencyMs === 'number' ? payload.totalLatencyMs : 0,
  avgLatencyMs: typeof payload?.avgLatencyMs === 'number' ? payload.avgLatencyMs : 0,
  llmSuccessRate: typeof payload?.llmSuccessRate === 'number' ? payload.llmSuccessRate : 0,
  fallbackRate: typeof payload?.fallbackRate === 'number' ? payload.fallbackRate : 0,
  timeoutRate: typeof payload?.timeoutRate === 'number' ? payload.timeoutRate : 0,
  parseErrorRate: typeof payload?.parseErrorRate === 'number' ? payload.parseErrorRate : 0,
  illegalOutputRate: typeof payload?.illegalOutputRate === 'number' ? payload.illegalOutputRate : 0,
})

const normalizeBattleMetricsSnapshot = (payload: Partial<BattleMetricsSnapshot> | null): BattleMetricsSnapshot => ({
  success: payload?.success ?? true,
  generatedAt: typeof payload?.generatedAt === 'string' ? payload.generatedAt : '',
  totals: normalizeBattleMetricsBucket(payload?.totals ?? null),
  byDecisionMode:
    payload?.byDecisionMode && typeof payload.byDecisionMode === 'object'
      ? Object.fromEntries(
        Object.entries(payload.byDecisionMode).map(([key, value]) => [key, normalizeBattleMetricsBucket(value)]),
      )
      : {},
  byPersonality:
    payload?.byPersonality && typeof payload.byPersonality === 'object'
      ? Object.fromEntries(
        Object.entries(payload.byPersonality).map(([key, value]) => [key, normalizeBattleMetricsBucket(value)]),
      )
      : {},
  byModel:
    payload?.byModel && typeof payload.byModel === 'object'
      ? Object.fromEntries(
        Object.entries(payload.byModel).map(([key, value]) => [key, normalizeBattleMetricsBucket(value)]),
      )
      : {},
  battleOutcomes: {
    totalFinished: typeof payload?.battleOutcomes?.totalFinished === 'number' ? payload.battleOutcomes.totalFinished : 0,
    teamAWins: typeof payload?.battleOutcomes?.teamAWins === 'number' ? payload.battleOutcomes.teamAWins : 0,
    teamBWins: typeof payload?.battleOutcomes?.teamBWins === 'number' ? payload.battleOutcomes.teamBWins : 0,
    unknown: typeof payload?.battleOutcomes?.unknown === 'number' ? payload.battleOutcomes.unknown : 0,
  },
})

function parseSSEBlock(block: string): { event: string; data: string } | null {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')

  if (lines.length === 0) {
    return null
  }

  let event = 'message'
  const dataParts: string[] = []

  for (const line of lines) {
    if (line.startsWith(':')) {
      continue
    }
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataParts.push(line.slice(5).trimStart())
    }
  }

  if (dataParts.length === 0) {
    return null
  }

  return {
    event,
    data: dataParts.join('\n'),
  }
}

function normalizeBattleStreamEvent(eventName: string, payload: unknown): BattlePlayStreamEvent | null {
  const raw = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}

  switch (eventName) {
    case 'ready':
      return {
        type: 'ready',
        success: raw.success !== false,
        matchId: typeof raw.matchId === 'string' ? raw.matchId : '',
      }
    case 'player_action_applied':
      return {
        type: 'player_action_applied',
        action: raw.action === 'play' ? 'play' : 'pass',
        cards: Array.isArray(raw.cards) ? raw.cards as RuntimeCard[] : [],
        state: normalizeBattleState(raw.state as Partial<BattleState> | null),
      }
    case 'ai_turn_start':
      return {
        type: 'ai_turn_start',
        playerId: typeof raw.playerId === 'string' ? raw.playerId : '',
        playerSeat: typeof raw.playerSeat === 'number' ? raw.playerSeat : -1,
        state: normalizeBattleState(raw.state as Partial<BattleState> | null),
      }
    case 'ai_turn_event':
      return {
        type: 'ai_turn_event',
        event: normalizeBattleTurnEvent(raw.event),
        state: normalizeBattleState(raw.state as Partial<BattleState> | null),
      }
    case 'complete':
      return {
        type: 'complete',
        state: normalizeBattleState(raw as Partial<BattleState> | null),
      }
    case 'error':
      return {
        type: 'error',
        success: false,
        message: typeof raw.message === 'string' ? raw.message : 'battle stream failed',
      }
    default:
      return null
  }
}

async function consumeBattleStreamResponse(
  response: Response,
  onEvent: (event: BattlePlayStreamEvent) => void | Promise<void>,
): Promise<BattleState> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('battle stream unavailable')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let finalState: BattleState | null = null

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    const segments = buffer.split(/\r?\n\r?\n/)
    buffer = segments.pop() ?? ''

    for (const segment of segments) {
      const parsed = parseSSEBlock(segment)
      if (!parsed) {
        continue
      }

      let payload: unknown
      try {
        payload = JSON.parse(parsed.data)
      } catch {
        continue
      }

      const normalized = normalizeBattleStreamEvent(parsed.event, payload)
      if (!normalized) {
        continue
      }

      await onEvent(normalized)

      if (normalized.type === 'error') {
        throw new Error(normalized.message)
      }
      if (normalized.type === 'complete') {
        finalState = normalized.state
      }
    }

    if (done) {
      break
    }
  }

  if (!finalState) {
    throw new Error('battle stream ended without final state')
  }

  return finalState
}

export async function createMatch(initialHands: RuntimeCard[][]): Promise<string> {
  const response = await fetch(buildUrl('/matches'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({ initialHands }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(`createMatch failed: ${detail}`)
  }

  const payload = (await response.json()) as CreateMatchResponse
  if (!payload.success || !payload.matchId) {
    throw new Error(payload.message ?? 'createMatch failed: missing matchId')
  }

  return payload.matchId
}

export async function fetchInitialHands(matchId: string, playerId: string = DEFAULT_PLAYER_ID): Promise<RuntimeCard[]> {
  const playerParam = encodeURIComponent(playerId)
  const response = await fetch(buildUrl(`/matches/${encodeURIComponent(matchId)}/hands/initial?playerId=${playerParam}`), {
    method: 'GET',
    headers: buildRequestHeaders({
      Accept: 'application/json',
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(`fetchInitialHands failed: ${detail}`)
  }

  const payload = (await response.json()) as InitialHandsResponse
  const cards = normalizeHandPayload(payload)

  if (cards.length !== 27) {
    throw new Error(`expected 27 cards, received ${cards.length}`)
  }

  return cards
}

export async function submitPlay(
  matchId: string,
  cards: RuntimeCard[],
  playerId: string = DEFAULT_PLAYER_ID,
): Promise<SubmitPlayResult> {
  const response = await fetch(buildUrl(`/matches/${encodeURIComponent(matchId)}/play`), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({
      playerId,
      cards,
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const payload = (await response.json()) as Partial<SubmitPlayResult> | null
  return {
    success: payload?.success ?? true,
    message: payload?.message,
    nextTurnPlayerId: payload?.nextTurnPlayerId,
  }
}

export async function startBattle(playerId: string = DEFAULT_PLAYER_ID): Promise<BattleState> {
  return startBattleWithMode('human_vs_ai', playerId)
}

export async function startBattleWithMode(
  battleMode: BattleMode,
  playerId: string = DEFAULT_PLAYER_ID,
  options?: BattleRequestOptions,
): Promise<BattleState> {
  const response = await fetch(buildUrl('/battle/start'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }, options?.llmOverride),
    signal: options?.signal,
    body: JSON.stringify({ playerId, battleMode }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const payload = (await response.json()) as Partial<BattleState> | null
  const state = normalizeBattleState(payload)
  if (!state.matchId || state.handCards.length === 0) {
    throw new Error(state.message ?? 'startBattle failed')
  }

  return state
}

export async function fetchBattleState(matchId: string, playerId: string = DEFAULT_PLAYER_ID): Promise<BattleState> {
  const matchParam = encodeURIComponent(matchId)
  const playerParam = encodeURIComponent(playerId)
  const response = await fetch(buildUrl(`/battle/state?matchId=${matchParam}&playerId=${playerParam}`), {
    method: 'GET',
    headers: buildRequestHeaders({
      Accept: 'application/json',
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const payload = (await response.json()) as Partial<BattleState> | null
  const state = normalizeBattleState(payload)
  if (!state.matchId) {
    throw new Error(state.message ?? 'fetchBattleState failed')
  }

  return state
}

export async function startNextBattleRound(
  matchId: string,
  playerId: string = DEFAULT_PLAYER_ID,
): Promise<BattleState> {
  const response = await fetch(buildUrl('/battle/next-round'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({
      matchId,
      playerId,
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const payload = (await response.json()) as Partial<BattleState> | null
  return normalizeBattleState(payload)
}

export async function submitBattleTribute(
  matchId: string,
  cardId: string,
  playerId: string = DEFAULT_PLAYER_ID,
): Promise<BattleState> {
  const response = await fetch(buildUrl('/battle/tribute'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({
      matchId,
      cardId,
      playerId,
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const payload = (await response.json()) as Partial<BattleState> | null
  return normalizeBattleState(payload)
}

export async function fetchBattleSessions(
  battleMode?: BattleMode,
  limit = 12,
): Promise<BattleSessionSummary[]> {
  const params = new URLSearchParams()
  if (battleMode) {
    params.set('battleMode', battleMode)
  }
  params.set('limit', Math.max(1, Math.min(limit, 30)).toString())

  const response = await fetch(buildUrl(`/battle/sessions?${params.toString()}`), {
    method: 'GET',
    headers: buildRequestHeaders({
      Accept: 'application/json',
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const payload = (await response.json()) as { sessions?: unknown[]; success?: boolean; message?: string } | null
  return Array.isArray(payload?.sessions)
    ? payload.sessions
      .map((entry) => normalizeBattleSessionSummary(entry))
      .filter((entry): entry is BattleSessionSummary => entry !== null)
    : []
}

export async function advanceBattle(
  matchId: string,
  playerId: string = DEFAULT_PLAYER_ID,
  options?: BattleRequestOptions & { cleanupWhenFinished?: boolean },
): Promise<BattleState> {
  const response = await fetch(buildUrl('/battle/advance'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }, options?.llmOverride),
    signal: options?.signal,
    body: JSON.stringify({
      matchId,
      playerId,
      cleanupWhenFinished: options?.cleanupWhenFinished === true,
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const payload = (await response.json()) as Partial<BattleState> | null
  return normalizeBattleState(payload)
}

export async function submitBattlePlay(
  matchId: string,
  cards: RuntimeCard[],
  playerId: string = DEFAULT_PLAYER_ID,
): Promise<BattleState> {
  const response = await fetch(buildUrl('/battle/play'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({
      matchId,
      cards,
      playerId,
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const payload = (await response.json()) as Partial<BattleState> | null
  return normalizeBattleState(payload)
}

export async function submitBattlePlayStream(
  matchId: string,
  cards: RuntimeCard[],
  onEvent: (event: BattlePlayStreamEvent) => void | Promise<void>,
  playerId: string = DEFAULT_PLAYER_ID,
  options?: BattleStreamOptions,
): Promise<BattleState> {
  const response = await fetch(buildUrl('/battle/play/stream'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }),
    signal: options?.signal,
    body: JSON.stringify({
      matchId,
      cards,
      playerId,
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  return consumeBattleStreamResponse(response, onEvent)
}

export async function advanceBattleStream(
  matchId: string,
  onEvent: (event: BattlePlayStreamEvent) => void | Promise<void>,
  playerId: string = DEFAULT_PLAYER_ID,
  options?: BattleStreamOptions,
): Promise<BattleState> {
  const response = await fetch(buildUrl('/battle/advance/stream'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }, options?.llmOverride),
    signal: options?.signal,
    body: JSON.stringify({
      matchId,
      playerId,
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  return consumeBattleStreamResponse(response, onEvent)
}

export async function fetchBattleMetrics(): Promise<BattleMetricsSnapshot> {
  const response = await fetch(buildUrl('/battle/metrics'), {
    method: 'GET',
    headers: buildRequestHeaders({
      Accept: 'application/json',
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const payload = (await response.json()) as Partial<BattleMetricsSnapshot> | null
  return normalizeBattleMetricsSnapshot(payload)
}

export async function resetBattleMetrics(): Promise<void> {
  const response = await fetch(buildUrl('/battle/metrics/reset'), {
    method: 'POST',
    headers: buildRequestHeaders({
      Accept: 'application/json',
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }
}

export async function pingLLMConnectivity(payload: {
  baseUrl: string
  apiKey: string
  model: string
}): Promise<LLMConnectivityResult> {
  const response = await fetch(buildUrl('/llm/ping'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      baseUrl: payload.baseUrl.trim(),
      apiKey: payload.apiKey.trim(),
      model: payload.model.trim(),
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(detail)
  }

  const raw = (await response.json()) as Partial<LLMConnectivityResult> | null
  const result: LLMConnectivityResult = {
    success: raw?.success ?? false,
    message: raw?.message ?? '',
    model: raw?.model ?? '',
    latencyMs: typeof raw?.latencyMs === 'number' ? raw.latencyMs : 0,
    statusCode: typeof raw?.statusCode === 'number' ? raw.statusCode : undefined,
    errorType: typeof raw?.errorType === 'string' ? raw.errorType : undefined,
  }

  if (!result.success) {
    throw new Error(result.message || '连通性测试失败')
  }

  return result
}

export async function validateTrainingGroups(groups: RuntimeCard[][]): Promise<ValidateTrainingGroupsResult> {
  const response = await fetch(buildUrl('/training/validate-groups'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({ groups }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(`validateTrainingGroups failed: ${detail}`)
  }

  const payload = (await response.json()) as Partial<ValidateTrainingGroupsResult> | null

  return {
    success: payload?.success ?? false,
    message: payload?.message,
    totalMoves: payload?.totalMoves,
    invalidGroupIndex: payload?.invalidGroupIndex,
    invalidGroup: payload?.invalidGroup,
    groupResults: payload?.groupResults,
  }
}

export async function autoGroupTraining(cards: RuntimeCard[]): Promise<AutoGroupTrainingResult> {
  const response = await fetch(buildUrl('/training/auto-group'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({ cards }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(`autoGroupTraining failed: ${detail}`)
  }

  const payload = (await response.json()) as Partial<AutoGroupTrainingResult> | null
  if (!payload?.success) {
    throw new Error(payload?.message ?? 'autoGroupTraining failed')
  }

  return {
    success: true,
    message: payload.message,
    groupedCards: Array.isArray(payload.groupedCards) ? payload.groupedCards : [],
    totalGroups: payload.totalGroups,
    allGroupings: Array.isArray(payload.allGroupings) ? payload.allGroupings : undefined,
  }
}

export async function autoGroupBattle(
  cards: RuntimeCard[],
  context?: BattleAutoGroupContext,
): Promise<AutoGroupTrainingResult> {
  const response = await fetch(buildUrl('/battle/auto-group'), {
    method: 'POST',
    headers: buildRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({ cards, context }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(`autoGroupBattle failed: ${detail}`)
  }

  const payload = (await response.json()) as Partial<AutoGroupTrainingResult> | null
  if (!payload?.success) {
    throw new Error(payload?.message ?? 'autoGroupBattle failed')
  }

  return {
    success: true,
    message: payload.message,
    groupedCards: Array.isArray(payload.groupedCards) ? payload.groupedCards : [],
    totalGroups: payload.totalGroups,
    allGroupings: Array.isArray(payload.allGroupings) ? payload.allGroupings : undefined,
  }
}

export async function fetchNewTrainingHand(): Promise<RuntimeCard[]> {
  const response = await fetch(buildUrl('/training/new-hand'), {
    method: 'GET',
    headers: buildRequestHeaders({
      Accept: 'application/json',
    }),
  })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    throw new Error(`fetchNewTrainingHand failed: ${detail}`)
  }

  const payload = (await response.json()) as InitialHandsResponse | NewTrainingHandResponse
  if (!Array.isArray(payload) && 'success' in payload && payload.success === false) {
    throw new Error(payload.message ?? 'fetchNewTrainingHand failed')
  }

  const cards = normalizeHandPayload(payload as InitialHandsResponse)
  if (cards.length !== 27) {
    throw new Error(`expected 27 cards, received ${cards.length}`)
  }

  return cards
}
