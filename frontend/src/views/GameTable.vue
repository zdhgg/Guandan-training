<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CardGroup from '../components/CardGroup.vue'
import PokerCard from '../components/PokerCard.vue'
import { useHandStore } from '../store/useHandStore'
import { useBattleStore } from '../store/useBattleStore'
import { useSettingsStore } from '../store/useSettingsStore'
import type { BattlePersonaPreset } from '../store/useSettingsStore'
import {
  advanceBattle,
  advanceBattleStream,
  autoGroupBattle,
  autoGroupTraining,
  fetchBattleSessions,
  fetchBattleMetrics,
  fetchBattleState,
  fetchNewTrainingHand,
  resetBattleMetrics,
  startBattle,
  startNextBattleRound,
  startBattleWithMode,
  submitBattleTribute,
  submitBattlePlayStream,
  validateTrainingGroups,
} from '../api/gameClient'
import type {
  BattleMode,
  BattlePendingTribute,
  BattleRoundSummary,
  BattleSessionSummary,
  BattleTimelineEntry as BattleTimelineApiEntry,
  BattleAutoGroupContext,
  BattleMetricsSnapshot,
  BattlePlayStreamEvent,
  BattleState,
  BattleTurnDecisionInsight,
  BattleTurnEvent,
} from '../api/gameClient'
import type { CardGroup as HandCardGroup, CardSuit, RuntimeCard } from '../types/cards'

type ToastType = 'success' | 'error' | 'info'
type BattleTimelineEntry = {
  id: string
  stepNumber?: number
  playerId: string
  playerSeat: number
  action: 'play' | 'pass'
  cards: RuntimeCard[]
  reasoning: string
  speech?: string
  decisionInsight?: BattleTurnDecisionInsight
  state: BattleState
  summary: string
  source: 'player' | 'ai'
}

type PersistedBattleTimelineSnapshot = {
  matchId: string
  entries: BattleTimelineEntry[]
}

type SeatBatchSummary = {
  totalRank: number
  firstCount: number
  secondCount: number
  thirdCount: number
  fourthCount: number
}

type BatchBattleSummary = {
  totalGames: number
  teamAWins: number
  teamBWins: number
  unknown: number
  seatStats: Record<number, SeatBatchSummary>
}

type BatchCompareResult = {
  presetAId: string
  presetBId: string
  totalGames: number
  summaryA: BatchBattleSummary
  summaryB: BatchBattleSummary
}

const handStore = useHandStore()
const battleStore = useBattleStore()
const settingsStore = useSettingsStore()
const route = useRoute()
const router = useRouter()

const activePlayerId = ref(import.meta.env.VITE_PLAYER_ID ?? 'player1')

const loadingHand = ref(false)
const submittingPlay = ref(false)
const submittingTribute = ref(false)
const isBroadcastingTurnEvents = ref(false)
const aiBattleAutoplaying = ref(false)
const smartGrouping = ref(false)
const refreshingHand = ref(false)
const startingNewBattle = ref(false)
const advancingBattleRound = ref(false)
const restoringBattleSession = ref(false)
const recentBattlePanelOpen = ref(false)
const loadingRecentBattleSessions = ref(false)
const recentBattleSessions = ref<BattleSessionSummary[]>([])
const recentBattleQuery = ref('')
const recentBattleShowActiveOnly = ref(false)
const copiedBattleMatchId = ref('')
const tableCards = ref<RuntimeCard[]>([])
const animatedTableCards = ref<RuntimeCard[] | null>(null)
const turnBroadcastText = ref('')
const broadcastLastPlaySeat = ref<number | null>(null)
const highlightedManualGroupId = ref<string | null>(null)
const groupRowRef = ref<HTMLElement | null>(null)
const toastMessage = ref('')
const toastType = ref<ToastType>('info')
const showToast = ref(false)
const lastErrorMessage = ref('')
const showSettlementModal = ref(false)
const settlementMoves = ref(0)
const invalidGroupId = ref<string | null>(null)
const pendingPlayCardIds = ref<string[]>([])
const aiThinkingSeat = ref<number | null>(null)
const battleTimelineEntries = ref<BattleTimelineEntry[]>([])
const reviewedTimelineIndex = ref<number | null>(null)
const batchRunCount = ref(20)
const batchRunCompleted = ref(0)
const batchRunTotal = ref(0)
const batchRunActive = ref(false)
const batchRunStopRequested = ref(false)
const backendMetricsSnapshot = ref<BattleMetricsSnapshot | null>(null)
const batchRunSummary = ref<BatchBattleSummary | null>(null)
const comparePresetAId = ref('')
const comparePresetBId = ref('')
const compareRunActive = ref(false)
const compareRunStopRequested = ref(false)
const compareRunCompleted = ref(0)
const compareRunTotal = ref(0)
const compareRunStage = ref<'presetA' | 'presetB' | null>(null)
const batchCompareResult = ref<BatchCompareResult | null>(null)
const restoringBattleMatchId = ref('')
const rivalBubbleTextMap = ref<Record<number, string>>({
  0: '',
  1: '',
  2: '',
  3: '',
})
const rivalBubbleVisibleMap = ref<Record<number, boolean>>({
  0: false,
  1: false,
  2: false,
  3: false,
})
const rivalBubbleFadingMap = ref<Record<number, boolean>>({
  0: false,
  1: false,
  2: false,
  3: false,
})
const currentBroadcastDecisionInsight = ref<BattleTurnDecisionInsight | null>(null)

const cachedAutoGroupings = ref<import('../api/gameClient').AutoGroupTrainingResult['allGroupings']>()
const currentGroupingIndex = ref(0)
const lastAutoGroupCardsHash = ref('')

let toastTimer: ReturnType<typeof setTimeout> | null = null
let manualGroupHighlightTimer: ReturnType<typeof setTimeout> | null = null
let settlementModalTimer: ReturnType<typeof setTimeout> | null = null
const rivalBubbleHideTimers = new Map<number, ReturnType<typeof setTimeout>>()
const rivalBubbleFadeTimers = new Map<number, ReturnType<typeof setTimeout>>()
const TOAST_DURATION_MS = 6000
const RIVAL_BUBBLE_SHOW_MS = 8000
const RIVAL_BUBBLE_FADE_MS = 280
const BATTLE_SETTLEMENT_DELAY_MS = 420
const AI_BATTLE_PLAYBACK_DELAY_MS = {
  slow: 1200,
  normal: 650,
  fast: 240,
  instant: 0,
} as const
const aiBattlePlaybackOptions = [
  { value: 'slow', label: '慢速' },
  { value: 'normal', label: '标准' },
  { value: 'fast', label: '快速' },
  { value: 'instant', label: '瞬时' },
] as const
let aiBattleStreamAbortController: AbortController | null = null
let batchRunAbortController: AbortController | null = null
let compareRunAbortController: AbortController | null = null

const canUseLocalStorage = (): boolean => typeof globalThis.localStorage !== 'undefined'
const resolveBattleSessionStorageKey = (): string =>
  isAiBattleMode.value ? 'guandan.training.battle.ai.session.v1' : 'guandan.training.battle.session.v1'
const resolveBattleTimelineStorageKey = (): string =>
  isAiBattleMode.value ? 'guandan.training.battle.ai.timeline.v1' : 'guandan.training.battle.timeline.v1'
const readPersistedBattleMatchId = (): string => {
  if (!canUseLocalStorage()) {
    return ''
  }

  try {
    const raw = globalThis.localStorage.getItem(resolveBattleSessionStorageKey())
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}
const persistBattleMatchId = (matchId: string): void => {
  if (!canUseLocalStorage()) {
    return
  }

  try {
    const normalized = matchId.trim()
    if (!normalized) {
      globalThis.localStorage.removeItem(resolveBattleSessionStorageKey())
      return
    }
    globalThis.localStorage.setItem(resolveBattleSessionStorageKey(), normalized)
  } catch {
    // ignore localStorage errors
  }
}
const clearPersistedBattleMatchId = (): void => {
  if (!canUseLocalStorage()) {
    return
  }
  try {
    globalThis.localStorage.removeItem(resolveBattleSessionStorageKey())
  } catch {
    // ignore localStorage errors
  }
}
const clearPersistedBattleTimeline = (): void => {
  if (!canUseLocalStorage()) {
    return
  }
  try {
    globalThis.localStorage.removeItem(resolveBattleTimelineStorageKey())
  } catch {
    // ignore localStorage errors
  }
}

const resolveModeQuery = (): string => {
  const queryMode = route.query.mode
  if (Array.isArray(queryMode)) {
    return queryMode[0] ?? ''
  }
  return queryMode ?? ''
}

const isLeastMovesMode = computed(() => resolveModeQuery() === 'least_moves')
const isBattleMode = computed(() => resolveModeQuery() === 'battle')
const isAiBattleMode = computed(() => resolveModeQuery() === 'battle_ai')
const isAnyBattleMode = computed(() => isBattleMode.value || isAiBattleMode.value)
const canUseArrangeTools = computed(() => isLeastMovesMode.value || isBattleMode.value)
const playActionLabel = computed(() => (isLeastMovesMode.value ? '提交方案' : '出牌 (Play)'))
const playButtonLabel = computed(() => {
  if (isBroadcastingTurnEvents.value) {
    return '播报中...'
  }
  if (!submittingPlay.value) {
    return playActionLabel.value
  }
  return isLeastMovesMode.value ? '提交中...' : '出牌中...'
})
const passButtonLabel = computed(() => {
  if (isBroadcastingTurnEvents.value) {
    return '播报中...'
  }
  return submittingPlay.value ? '处理中...' : '不出 (Pass)'
})
const newBattleButtonLabel = computed(() => (startingNewBattle.value ? '🆕 开局中...' : '🆕 新开一局'))
const tableTitle = computed(() => (isLeastMovesMode.value ? '理牌训练牌桌' : '当前回合出牌区'))
const activeTrainingGroups = computed(() => handStore.cardGroups.filter((group) => group.cards.length > 0))

const selectedCards = computed(() => handStore.selectedCards)
const pendingPlayCardIdSet = computed(() => new Set(pendingPlayCardIds.value))
const renderCardGroups = computed<HandCardGroup[]>(() => {
  if (pendingPlayCardIds.value.length === 0) {
    return handStore.cardGroups
  }

  return handStore.cardGroups
    .map((group) => ({
      ...group,
      cards: group.cards.filter((card) => !pendingPlayCardIdSet.value.has(card.id)),
    }))
    .filter((group) => group.cards.length > 0)
})
const visibleSelectedCount = computed(() => {
  if (pendingPlayCardIds.value.length === 0) {
    return selectedCards.value.length
  }
  return selectedCards.value.filter((card) => !pendingPlayCardIdSet.value.has(card.id)).length
})
const hasSelectedCards = computed(() => selectedCards.value.length > 0)
const currentAutoGrouping = computed(() => {
  const all = cachedAutoGroupings.value
  if (!all || all.length === 0) {
    return null
  }

  const normalizedIndex = Math.min(Math.max(currentGroupingIndex.value, 0), all.length - 1)
  return all[normalizedIndex] ?? all[0] ?? null
})
const autoGroupingReasonLabelMap: Record<string, string> = {
  objective_min_hands: '最少手数优先',
  objective_battle_balance: '实战均衡收益',
  enemy_sprint_risk: '对手冲刺防守',
  single_control_strict: '严格压缩散牌',
  invalid_group_penalty: '非法组牌惩罚',
}
const currentAutoGroupingReasons = computed(() => {
  const tags = currentAutoGrouping.value?.reasonTags
  if (!tags || tags.length === 0) {
    return []
  }
  return tags.map((tag) => autoGroupingReasonLabelMap[tag] ?? tag)
})
const isPrimarySeatTurn = computed(() => isAnyBattleMode.value && battleStore.currentTurn === 0)
const isPlayerTurn = computed(() => isBattleMode.value && battleStore.currentTurn === 0)
const baseActionDisabled = computed(
  () =>
    loadingHand.value ||
    submittingPlay.value ||
    isBroadcastingTurnEvents.value ||
    restoringBattleSession.value ||
    batchRunActive.value ||
    compareRunActive.value ||
    smartGrouping.value ||
    refreshingHand.value ||
    startingNewBattle.value,
)
const playerPendingTribute = computed<BattlePendingTribute | null>(() => battleStore.pendingTribute)
const playerPendingTributeAction = computed<'give' | 'return' | null>(
  () => playerPendingTribute.value?.requiredAction ?? null,
)
const battleActionDisabled = computed(
  () => baseActionDisabled.value || !isPlayerTurn.value || playerPendingTributeAction.value !== null,
)
const playerPendingTributeButtonLabel = computed(() => {
  if (submittingTribute.value) {
    return playerPendingTributeAction.value === 'return' ? '还贡中...' : '进贡中...'
  }
  return playerPendingTributeAction.value === 'return' ? '提交还贡' : '提交进贡'
})
const playerPendingTributeHint = computed(() => {
  if (!playerPendingTributeAction.value) {
    return ''
  }

  if (playerPendingTributeAction.value === 'give') {
    const stepIndex = (playerPendingTribute.value?.exchangeIndex ?? 0) + 1
    const totalSteps = playerPendingTribute.value?.totalExchanges ?? 1
    return `下一局已发牌，请从当前手牌中选择 1 张最大牌进贡给头游。当前步骤 ${stepIndex}/${totalSteps}。`
  }

  const tributeOwner = seatLabel(playerPendingTribute.value?.giverSeat ?? 0)
  const ruleText =
    battleStore.returnTributeRule === 'lowest_only'
      ? '当前规则要求还最小牌。'
      : '当前规则允许还任意较小牌；若没有更小牌，则还当前最小牌。'
  return `你已收到 ${tributeOwner} 的贡牌，请选择 1 张符合规则的牌还回去。${ruleText}`
})
const aiBattleControlDisabled = computed(() => {
  if (!isAiBattleMode.value) {
    return true
  }
  if (aiBattleAutoplaying.value) {
    return false
  }
  return (
    loadingHand.value ||
    startingNewBattle.value ||
    smartGrouping.value ||
    refreshingHand.value ||
    batchRunActive.value ||
    compareRunActive.value ||
    !battleStore.matchId
  )
})
const aiBattleControlLabel = computed(() => {
  if (aiBattleAutoplaying.value) {
    return '暂停观战'
  }
  if (battleGameOver.value) {
    return '进入下一局并继续'
  }
  return battleStore.matchId ? '继续观战' : '开始观战'
})
const currentSessionBattleMode = computed<BattleMode | null>(() => {
  if (isAiBattleMode.value) {
    return 'ai_vs_ai'
  }
  if (isBattleMode.value) {
    return 'human_vs_ai'
  }
  return null
})
const recentBattlePanelTitle = computed(() => {
  if (isAiBattleMode.value) {
    return '最近观战局'
  }
  if (isBattleMode.value) {
    return '最近实战局'
  }
  return '最近对局'
})
const filteredRecentBattleSessions = computed(() => {
  const keyword = recentBattleQuery.value.trim().toLowerCase()
  return recentBattleSessions.value.filter((session) => {
    if (recentBattleShowActiveOnly.value && session.endedAt) {
      return false
    }

    if (!keyword) {
      return true
    }

    const searchableText = [
      session.matchId,
      session.currentLevel,
      session.lastAction?.playerId ?? '',
      session.lastAction?.action ?? '',
    ]
      .join(' ')
      .toLowerCase()

    return searchableText.includes(keyword)
  })
})
const currentBattlePlaybackSpeed = computed(() => settingsStore.battlePlaybackSpeed ?? 'normal')
const battleStatusHintText = computed(() => {
  if (isAiBattleMode.value) {
    if (compareRunActive.value) {
      return compareRunProgressText.value || '正在执行双预设对比...'
    }
    if (batchRunActive.value) {
      return batchRunProgressText.value || '正在批量连打全 AI 对战...'
    }
    if (reviewedTimelineIndex.value !== null) {
      return '正在查看历史牌路，可返回实时继续观战'
    }
    if (aiBattleAutoplaying.value) {
      return '正在自动推进全 AI 对战...'
    }
    if (battleGameOver.value) {
      return '本局已结束，可进入下一局继续观战'
    }
    return '观战已暂停，可继续播放'
  }
  if (isBattleMode.value && playerPendingTributeHint.value) {
    return playerPendingTributeHint.value
  }
  if (isBattleMode.value && isBroadcastingTurnEvents.value) {
    return '正在逐手播报 AI 出牌...'
  }
  if (isBattleMode.value && submittingPlay.value) {
    return '正在处理你的出牌，并等待 AI 响应...'
  }
  if (isBattleMode.value && !isPlayerTurn.value) {
    return '等待其他玩家...'
  }
  return ''
})
const reviewedTimelineEntry = computed<BattleTimelineEntry | null>(() => {
  if (reviewedTimelineIndex.value === null) {
    return null
  }
  return battleTimelineEntries.value[reviewedTimelineIndex.value] ?? null
})
const isReviewingTimeline = computed(() => reviewedTimelineEntry.value !== null)
const displayDecisionInsight = computed(() => reviewedTimelineEntry.value?.decisionInsight ?? currentBroadcastDecisionInsight.value)
const reviewedTimelineCards = computed<RuntimeCard[]>(() => {
  const entry = reviewedTimelineEntry.value
  if (!entry) {
    return []
  }

  if (entry.action === 'play' && entry.cards.length > 0) {
    return entry.cards
  }

  return entry.state.lastPlay?.cards ?? []
})
const reviewedTimelineOwnerSeat = computed<number | null>(() => {
  const entry = reviewedTimelineEntry.value
  if (!entry) {
    return null
  }

  if (entry.action === 'play') {
    return entry.playerSeat
  }

  return typeof entry.state.lastPlay?.playerSeat === 'number' ? entry.state.lastPlay.playerSeat : null
})
const reviewedTimelineBroadcastText = computed(() => reviewedTimelineEntry.value?.summary ?? '')
const canReviewPreviousTimelineStep = computed(
  () => reviewedTimelineIndex.value !== null && reviewedTimelineIndex.value > 0,
)
const canReviewNextTimelineStep = computed(() => {
  if (reviewedTimelineIndex.value === null) {
    return false
  }
  return reviewedTimelineIndex.value < battleTimelineEntries.value.length - 1
})
const displayTableCards = computed(() => {
  if (isReviewingTimeline.value) {
    return reviewedTimelineCards.value
  }
  if (isAnyBattleMode.value) {
    return animatedTableCards.value ?? battleStore.lastPlay?.cards ?? []
  }
  return tableCards.value
})
const currentLevelText = computed(() => battleStore.currentLevel || '2')
const antiTributeRuleText = computed(() => (battleStore.antiTributeEnabled ? '双大王抗贡：开' : '双大王抗贡：关'))
const doubleDownTributeRuleText = computed(() => (battleStore.doubleDownTributeEnabled ? '双下双贡：开' : '双下双贡：关'))
const returnTributeRuleText = computed(() =>
  battleStore.returnTributeRule === 'lowest_only' ? '还贡规则：必须还最小牌' : '还贡规则：允许还任意较小牌',
)
const currentRoundPhaseLabel = computed(() => {
  switch (battleStore.roundPhase) {
    case 'finished':
      return '本局已结束'
    case 'awaiting_tribute':
      return '等待进贡'
    case 'awaiting_return':
      return '等待还贡'
    default:
      return '对局进行中'
  }
})
const seriesPanelCards = computed(() => {
  if (!isAnyBattleMode.value) {
    return []
  }

  const cards = [
    { label: '系列赛', value: `第 ${battleStore.roundNumber} 局` },
    { label: '局面状态', value: currentRoundPhaseLabel.value },
    { label: '当前级牌', value: battleStore.currentLevel || '2' },
    { label: '抗贡规则', value: battleStore.antiTributeEnabled ? '双大王抗贡开启' : '双大王抗贡关闭' },
    { label: '双贡规则', value: battleStore.doubleDownTributeEnabled ? '双下双贡开启' : '双下双贡关闭' },
    { label: '还贡限制', value: battleStore.returnTributeRule === 'lowest_only' ? '必须还最小牌' : '允许还任意较小牌' },
  ]

  if (battleStore.lastRoundSummary) {
    cards.push({
      label: '上一局结果',
      value: `${battleStore.lastRoundSummary.resultLabel} · 升 ${battleStore.lastRoundSummary.upgradeSteps} 级`,
    })
    cards.push({
      label: '升级变化',
      value: `${battleStore.lastRoundSummary.levelBefore} -> ${battleStore.lastRoundSummary.levelAfter}`,
    })
  }

  if (battleStore.lastRoundSummary?.antiTributeApplied) {
    cards.push({
      label: '抗贡结果',
      value: battleStore.lastRoundSummary.antiTributeReason ?? '本局已抗贡',
    })
  } else if (battleStore.pendingTribute) {
    const actionLabel = battleStore.pendingTribute.phase === 'awaiting_return' ? '待还贡' : '待进贡'
    cards.push({
      label: '交供流程',
      value: `${seatLabel(battleStore.pendingTribute.giverSeat)} -> ${seatLabel(battleStore.pendingTribute.receiverSeat)} · ${actionLabel} (${battleStore.pendingTribute.exchangeIndex + 1}/${battleStore.pendingTribute.totalExchanges})`,
    })
  }

  return cards
})
const currentSeriesHeadline = computed(() => {
  if (!isAnyBattleMode.value) {
    return ''
  }
  if (battleStore.lastRoundSummary?.antiTributeApplied) {
    return `${battleStore.lastRoundSummary.antiTributeReason ?? '已触发抗贡'}，当前直接进入第 ${battleStore.roundNumber} 局`
  }
  if (battleStore.pendingTribute) {
    return `${seatLabel(battleStore.pendingTribute.giverSeat)} 与 ${seatLabel(battleStore.pendingTribute.receiverSeat)} 正在处理交供`
  }
  if (battleStore.lastRoundSummary) {
    return `上一局 ${battleStore.lastRoundSummary.resultLabel}，当前继续第 ${battleStore.roundNumber} 局`
  }
  return `当前正在进行第 ${battleStore.roundNumber} 局`
})
const recentRoundHistoryEntries = computed(() => [...battleStore.roundHistory].slice(-6).reverse())
const describeRoundHistoryEntry = (summary: BattleRoundSummary): string => {
  const tributeTag =
    summary.tributePairs && summary.tributePairs.length > 1
      ? '双贡'
      : summary.tributeRequired
        ? '单贡'
        : '免贡'
  if (summary.antiTributeApplied) {
    return `${summary.resultLabel} · ${summary.levelBefore} -> ${summary.levelAfter} · ${tributeTag} · ${summary.antiTributeReason ?? '抗贡'}`
  }
  return `${summary.resultLabel} · ${summary.levelBefore} -> ${summary.levelAfter} · ${tributeTag}`
}
const seatLabel = (seat: number): string => {
  if (isAiBattleMode.value) {
    switch (seat) {
      case 0:
        return '一号位'
      case 1:
        return '二号位'
      case 2:
        return '三号位'
      case 3:
        return '四号位'
      default:
        return `座位 ${seat}`
    }
  }

  switch (seat) {
    case 0:
      return '你'
    case 1:
      return '下家'
    case 2:
      return '对家'
    case 3:
      return '上家'
    default:
      return `座位 ${seat}`
  }
}
const formatBattleSessionTime = (raw: string): string => {
  if (!raw) {
    return '--'
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
const describeBattleSessionStatus = (session: BattleSessionSummary): string => {
  if (session.roundPhase === 'finished') {
    return `第 ${session.roundNumber} 局已结算 · ${session.stepCount} 手`
  }
  if (session.roundPhase === 'awaiting_tribute') {
    return `第 ${session.roundNumber} 局待进贡 · 级牌 ${session.currentLevel}`
  }
  if (session.roundPhase === 'awaiting_return') {
    return `第 ${session.roundNumber} 局待还贡 · 级牌 ${session.currentLevel}`
  }
  if (session.endedAt) {
    return `第 ${session.roundNumber} 局已结束 · ${session.stepCount} 手`
  }
  return `第 ${session.roundNumber} 局进行中 · 第 ${session.stepCount} 手 · ${seatLabel(session.currentTurn)}行动`
}
const describeBattleSessionLastAction = (session: BattleSessionSummary): string => {
  if (session.lastRoundSummary?.antiTributeApplied) {
    return `最近结果：${session.lastRoundSummary.antiTributeReason ?? '已抗贡'}`
  }
  if (session.lastRoundSummary) {
    return `最近结果：${session.lastRoundSummary.resultLabel}，${session.lastRoundSummary.levelBefore} -> ${session.lastRoundSummary.levelAfter}`
  }
  if (!session.lastAction) {
    return '尚未产生出牌记录'
  }

  return `最近一步：${seatLabel(session.lastAction.playerSeat)} ${session.lastAction.action === 'play' ? '出牌' : '不出'}`
}
const currentTurnLabel = computed(() => {
  if (!isAnyBattleMode.value) {
    return ''
  }
  return seatLabel(battleStore.currentTurn)
})
const turnHintText = computed(() => {
  if (!isAnyBattleMode.value) {
    return ''
  }
  if (isReviewingTimeline.value && reviewedTimelineEntry.value) {
    return `回看第 ${reviewedTimelineIndex.value! + 1} 手`
  }
  if (playerPendingTributeAction.value === 'give') {
    return '等待你进贡'
  }
  if (playerPendingTributeAction.value === 'return') {
    return '等待你还贡'
  }
  if (battleStore.roundPhase === 'finished') {
    return '本局已结束，等待进入下一局'
  }
  if (submittingPlay.value && aiThinkingSeat.value !== null) {
    return `${seatLabel(aiThinkingSeat.value)}正在思考`
  }
  if (isAiBattleMode.value) {
    return battleGameOver.value ? '牌局已结束' : `等待${currentTurnLabel.value}行动`
  }
  return isPlayerTurn.value ? '轮到你出牌' : `等待${currentTurnLabel.value}出牌`
})
const tablePlaceholderText = computed(() => {
  if (!isAnyBattleMode.value) {
    return '等待出牌...'
  }

  if (isReviewingTimeline.value && reviewedTimelineEntry.value) {
    return reviewedTimelineEntry.value.action === 'pass'
      ? `${seatLabel(reviewedTimelineEntry.value.playerSeat)} 选择不出`
      : `${seatLabel(reviewedTimelineEntry.value.playerSeat)} 的历史出牌`
  }

  if (submittingPlay.value && aiThinkingSeat.value !== null) {
    return `${seatLabel(aiThinkingSeat.value)}正在思考...`
  }

  if (isBroadcastingTurnEvents.value && turnBroadcastText.value) {
    return turnBroadcastText.value
  }

  return `${turnHintText.value}...`
})
const tableCardsOwnerSeat = computed(() => {
  if (!isAnyBattleMode.value || displayTableCards.value.length === 0) {
    return null
  }

  if (isReviewingTimeline.value) {
    return reviewedTimelineOwnerSeat.value
  }

  if (animatedTableCards.value && broadcastLastPlaySeat.value !== null) {
    return broadcastLastPlaySeat.value
  }

  return typeof battleStore.lastPlay?.playerSeat === 'number' ? battleStore.lastPlay.playerSeat : null
})
const tableCardsOwnerLabel = computed(() => {
  if (tableCardsOwnerSeat.value === null) {
    return ''
  }
  return seatLabel(tableCardsOwnerSeat.value)
})
const tableCardsOwnerText = computed(() => {
  if (!isAnyBattleMode.value || displayTableCards.value.length === 0 || !tableCardsOwnerLabel.value) {
    return ''
  }

  if (isReviewingTimeline.value) {
    return `回看桌面：${tableCardsOwnerLabel.value}`
  }

  if (isBroadcastingTurnEvents.value) {
    return `出牌方：${tableCardsOwnerLabel.value}`
  }

  return `最后出牌：${tableCardsOwnerLabel.value}`
})
const isTopLastPlay = computed(() => isAnyBattleMode.value && tableCardsOwnerSeat.value === 2)
const isLeftLastPlay = computed(() => isAnyBattleMode.value && tableCardsOwnerSeat.value === 3)
const isRightLastPlay = computed(() => isAnyBattleMode.value && tableCardsOwnerSeat.value === 1)
const isSelfLastPlay = computed(() => isAnyBattleMode.value && tableCardsOwnerSeat.value === 0)
const leftOpponentCards = computed(() => battleStore.opponents.find((opponent) => opponent.seat === 3)?.cardsLeft ?? 27)
const topOpponentCards = computed(() => battleStore.opponents.find((opponent) => opponent.seat === 2)?.cardsLeft ?? 27)
const rightOpponentCards = computed(() => battleStore.opponents.find((opponent) => opponent.seat === 1)?.cardsLeft ?? 27)
const myRankText = computed(() => rankToText(battleStore.rank))
const leftOpponentRankText = computed(() => rankToText(battleStore.opponents.find((o) => o.seat === 3)?.rank))
const topOpponentRankText = computed(() => rankToText(battleStore.opponents.find((o) => o.seat === 2)?.rank))
const rightOpponentRankText = computed(() => rankToText(battleStore.opponents.find((o) => o.seat === 1)?.rank))
const battleGameOver = computed(() => isAnyBattleMode.value && battleStore.roundPhase !== 'playing')
const topSeatTitle = computed(() => seatLabel(2))
const leftSeatTitle = computed(() => seatLabel(3))
const rightSeatTitle = computed(() => seatLabel(1))
const primarySeatTitle = computed(() => (isAiBattleMode.value ? `${seatLabel(0)} 手牌观察区` : '你的手牌'))
const battlePlaybackSpeedLabel = computed(() => {
  switch (currentBattlePlaybackSpeed.value) {
    case 'slow':
      return '慢速'
    case 'fast':
      return '快速'
    case 'instant':
      return '瞬时'
    default:
      return '标准'
  }
})
const normalizedBatchRunCount = computed(() => Math.min(100, Math.max(1, Math.round(batchRunCount.value || 1))))
const batchRunProgressText = computed(() => {
  if (!batchRunActive.value) {
    return ''
  }
  return `批量连打中：${batchRunCompleted.value}/${batchRunTotal.value}`
})
const batchSeatStatRows = computed(() =>
  [0, 1, 2, 3].map((seat) => {
    const seatStats = batchRunSummary.value?.seatStats[seat] ?? createEmptySeatBatchSummary()
    const totalGames = batchRunSummary.value?.totalGames ?? 0
    return {
      seat,
      label: seatLabel(seat),
      avgRank: totalGames > 0 ? (seatStats.totalRank / totalGames).toFixed(2) : '--',
      firstCount: seatStats.firstCount,
      secondCount: seatStats.secondCount,
      thirdCount: seatStats.thirdCount,
      fourthCount: seatStats.fourthCount,
    }
  }),
)
const batchSummaryCards = computed(() => {
  const summary = batchRunSummary.value
  if (!summary || summary.totalGames === 0) {
    return null
  }
  return {
    totalGames: summary.totalGames,
    teamAWinRate: ((summary.teamAWins / summary.totalGames) * 100).toFixed(1),
    teamBWinRate: ((summary.teamBWins / summary.totalGames) * 100).toFixed(1),
    unknownRate: ((summary.unknown / summary.totalGames) * 100).toFixed(1),
  }
})
const personaPresetOptions = computed(() => settingsStore.battlePersonaPresets)
const compareRunProgressText = computed(() => {
  if (!compareRunActive.value) {
    return ''
  }
  const stageLabel = compareRunStage.value === 'presetA' ? '方案 A' : compareRunStage.value === 'presetB' ? '方案 B' : '准备中'
  return `双预设对比中：${stageLabel} ${compareRunCompleted.value}/${compareRunTotal.value}`
})
const comparePresetALabel = computed(
  () => personaPresetOptions.value.find((preset) => preset.id === comparePresetAId.value)?.name ?? '方案 A',
)
const comparePresetBLabel = computed(
  () => personaPresetOptions.value.find((preset) => preset.id === comparePresetBId.value)?.name ?? '方案 B',
)
const compareSummaryCards = computed(() => {
  const result = batchCompareResult.value
  if (!result || result.totalGames === 0) {
    return null
  }

  const toCard = (summary: BatchBattleSummary) => ({
    totalGames: summary.totalGames,
    teamAWinRate: ((summary.teamAWins / summary.totalGames) * 100).toFixed(1),
    teamBWinRate: ((summary.teamBWins / summary.totalGames) * 100).toFixed(1),
    avgSeat0Rank: ((summary.seatStats[0]?.totalRank ?? 0) / summary.totalGames).toFixed(2),
  })

  return {
    presetA: toCard(result.summaryA),
    presetB: toCard(result.summaryB),
  }
})
const compareSeatStatRows = computed(() => {
  const result = batchCompareResult.value
  if (!result) {
    return []
  }

  return [0, 1, 2, 3].map((seat) => {
    const seatA = result.summaryA.seatStats[seat] ?? createEmptySeatBatchSummary()
    const seatB = result.summaryB.seatStats[seat] ?? createEmptySeatBatchSummary()
    return {
      seat,
      label: seatLabel(seat),
      avgRankA: result.summaryA.totalGames > 0 ? (seatA.totalRank / result.summaryA.totalGames).toFixed(2) : '--',
      avgRankB: result.summaryB.totalGames > 0 ? (seatB.totalRank / result.summaryB.totalGames).toFixed(2) : '--',
      firstA: seatA.firstCount,
      firstB: seatB.firstCount,
    }
  })
})
const metricsCards = computed(() => {
  const snapshot = backendMetricsSnapshot.value
  if (!snapshot) {
    return null
  }
  const totalFinished = Math.max(1, snapshot.battleOutcomes.totalFinished)
  return {
    totalFinished: snapshot.battleOutcomes.totalFinished,
    teamAWinRate: ((snapshot.battleOutcomes.teamAWins / totalFinished) * 100).toFixed(1),
    teamBWinRate: ((snapshot.battleOutcomes.teamBWins / totalFinished) * 100).toFixed(1),
    avgLatencyMs: snapshot.totals.avgLatencyMs.toFixed(1),
    fallbackRate: (snapshot.totals.fallbackRate * 100).toFixed(1),
    llmSuccessRate: (snapshot.totals.llmSuccessRate * 100).toFixed(1),
    fallbacks: snapshot.totals.fallbacks,
    timeoutRate: (snapshot.totals.timeoutRate * 100).toFixed(1),
    parseErrorRate: (snapshot.totals.parseErrorRate * 100).toFixed(1),
    illegalOutputRate: (snapshot.totals.illegalOutputRate * 100).toFixed(1),
    timeoutErrors: snapshot.totals.timeoutErrors,
    parseErrors: snapshot.totals.parseErrors,
    illegalOutputs: snapshot.totals.illegalOutputs,
  }
})
const broadcastInsightTopCandidates = computed(() => displayDecisionInsight.value?.topCandidates?.slice(0, 3) ?? [])
const showStrategyPanel = computed(() => settingsStore.showBattleStrategyPanel)
const showBattleSpeechBubble = computed(() => settingsStore.showBattleSpeechBubble)
const showStrategyPanelDetails = ref(false)
const broadcastInsightSignalsText = computed(() => {
  const signals = displayDecisionInsight.value?.tacticalSignals
  if (!signals) {
    return ''
  }

  if (signals.lastPlayByOpponent && signals.opponentNearFinish) {
    return `对手压迫: 最少剩${signals.minOpponentCardsLeft ?? '?'}张，优先阻断`
  }
  if (signals.lastPlayByTeammate && signals.teammateNearFinish) {
    return `队友压迫: 队友仅剩${signals.teammateCardsLeft ?? '?'}张，优先让牌`
  }
  if (signals.lastPlayByTeammate) {
    return '局势稳定: 队友占先，倾向协作保先手'
  }
  if (signals.lastPlayByOpponent) {
    return '局势对抗: 对手占先，倾向争夺牌权'
  }
  return '首出轮: 争取建立本方主动权'
})
const hasStrategyPanelDetails = computed(
  () => Boolean(broadcastInsightSignalsText.value) || broadcastInsightTopCandidates.value.length > 0,
)
const formatInsightScore = (score?: number): string => (typeof score === 'number' ? score.toFixed(1) : '--')
const toggleStrategyPanelVisibility = (): void => {
  settingsStore.setSettings({
    showBattleStrategyPanel: !settingsStore.showBattleStrategyPanel,
  })
}
const toggleStrategyPanelDetails = (): void => {
  showStrategyPanelDetails.value = !showStrategyPanelDetails.value
}

const rankToText = (rank?: number): string => {
  switch (rank) {
    case 1:
      return '头游 🏆'
    case 2:
      return '二游 🥈'
    case 3:
      return '三游 🥉'
    case 4:
      return '末游 🐢'
    default:
      return ''
  }
}
const isRivalBubbleVisible = (seat: number): boolean => {
  const isThinking = aiThinkingSeat.value === seat && submittingPlay.value
  if (isThinking) {
    return true
  }
  return Boolean(rivalBubbleVisibleMap.value[seat] && rivalBubbleTextMap.value[seat])
}
const isRivalBubbleThinking = (seat: number): boolean =>
  aiThinkingSeat.value === seat && submittingPlay.value
const isRivalBubbleFading = (seat: number): boolean => Boolean(rivalBubbleFadingMap.value[seat])
const getRivalBubbleText = (seat: number): string =>
  isRivalBubbleThinking(seat) ? '正在思考中... 🤔' : rivalBubbleTextMap.value[seat] ?? ''

const clearRivalBubbleTimers = (seat: number): void => {
  const hideTimer = rivalBubbleHideTimers.get(seat)
  if (hideTimer) {
    clearTimeout(hideTimer)
    rivalBubbleHideTimers.delete(seat)
  }
  const fadeTimer = rivalBubbleFadeTimers.get(seat)
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    rivalBubbleFadeTimers.delete(seat)
  }
}
const resetRivalBubbles = (): void => {
  aiThinkingSeat.value = null
  for (const seat of [0, 1, 2, 3]) {
    clearRivalBubbleTimers(seat)
    rivalBubbleTextMap.value[seat] = ''
    rivalBubbleVisibleMap.value[seat] = false
    rivalBubbleFadingMap.value[seat] = false
  }
}
const showRivalReasoning = (seat: number, reasoning: string): void => {
  if (![0, 1, 2, 3].includes(seat)) {
    return
  }
  const normalized = reasoning.trim()
  if (!normalized) {
    return
  }
  aiThinkingSeat.value = null
  clearRivalBubbleTimers(seat)
  rivalBubbleTextMap.value[seat] = normalized
  rivalBubbleVisibleMap.value[seat] = true
  rivalBubbleFadingMap.value[seat] = false

  const hideTimer = setTimeout(() => {
    rivalBubbleFadingMap.value[seat] = true
    const fadeTimer = setTimeout(() => {
      rivalBubbleVisibleMap.value[seat] = false
      rivalBubbleFadingMap.value[seat] = false
      rivalBubbleTextMap.value[seat] = ''
      rivalBubbleFadeTimers.delete(seat)
    }, RIVAL_BUBBLE_FADE_MS)
    rivalBubbleFadeTimers.set(seat, fadeTimer)
    rivalBubbleHideTimers.delete(seat)
  }, RIVAL_BUBBLE_SHOW_MS)
  rivalBubbleHideTimers.set(seat, hideTimer)
}
const predictFirstAiSeatAfterPlayerAction = (action: 'play' | 'pass'): number | null => {
  if (!isBattleMode.value) {
    return null
  }

  if (action === 'play') {
    return 1
  }

  if (!battleStore.lastPlay) {
    return 1
  }

  const nextPassCount = battleStore.passCount + 1
  if (nextPassCount >= 3) {
    const restartSeat = battleStore.lastPlay.playerSeat
    return restartSeat >= 1 && restartSeat <= 3 ? restartSeat : null
  }

  return 1
}

const resetAutoGroupingCache = (): void => {
  cachedAutoGroupings.value = undefined
  currentGroupingIndex.value = 0
  lastAutoGroupCardsHash.value = ''
  invalidGroupId.value = null
}

const cloneBattleStateSnapshot = (state: BattleState): BattleState => ({
  success: state.success,
  message: state.message,
  matchId: state.matchId,
  playerId: state.playerId,
  battleMode: state.battleMode,
  roundNumber: state.roundNumber,
  roundPhase: state.roundPhase,
  antiTributeEnabled: state.antiTributeEnabled,
  doubleDownTributeEnabled: state.doubleDownTributeEnabled,
  returnTributeRule: state.returnTributeRule,
  currentLevel: state.currentLevel,
  currentTurn: state.currentTurn,
  passCount: state.passCount,
  handCards: state.handCards.map((card) => ({ ...card })),
  opponents: state.opponents.map((opponent) => ({ ...opponent })),
  lastPlay: state.lastPlay
    ? {
      ...state.lastPlay,
      cards: state.lastPlay.cards.map((card) => ({ ...card })),
    }
    : null,
  finishedSeats: [...state.finishedSeats],
  rank: state.rank,
  lastRoundSummary: state.lastRoundSummary
    ? {
      ...state.lastRoundSummary,
      finishedSeats: [...state.lastRoundSummary.finishedSeats],
    }
    : null,
  roundHistory: state.roundHistory.map((summary) => ({
    ...summary,
    finishedSeats: [...summary.finishedSeats],
    tributePairs: summary.tributePairs?.map((pair) => ({
      ...pair,
      tributeCard: pair.tributeCard ? { ...pair.tributeCard } : undefined,
    })),
  })),
  tributeQueue: state.tributeQueue.map((pair) => ({
    ...pair,
    tributeCard: pair.tributeCard ? { ...pair.tributeCard } : undefined,
  })),
  pendingTribute: state.pendingTribute
    ? {
      ...state.pendingTribute,
      tributeCard: state.pendingTribute.tributeCard ? { ...state.pendingTribute.tributeCard } : undefined,
    }
    : null,
  turnEvents: state.turnEvents?.map((event) => ({
    ...event,
    cards: event.cards.map((card) => ({ ...card })),
    decisionInsight: event.decisionInsight
      ? {
        ...event.decisionInsight,
        tacticalSignals: event.decisionInsight.tacticalSignals
          ? { ...event.decisionInsight.tacticalSignals }
          : undefined,
        topCandidates: event.decisionInsight.topCandidates?.map((candidate) => ({
          ...candidate,
          cardIds: [...candidate.cardIds],
          tacticHints: candidate.tacticHints ? [...candidate.tacticHints] : undefined,
        })),
      }
      : undefined,
  })),
})

const cloneDecisionInsight = (insight?: BattleTurnDecisionInsight): BattleTurnDecisionInsight | undefined =>
  insight
    ? {
      ...insight,
      tacticalSignals: insight.tacticalSignals ? { ...insight.tacticalSignals } : undefined,
      topCandidates: insight.topCandidates?.map((candidate) => ({
        ...candidate,
        cardIds: [...candidate.cardIds],
        tacticHints: candidate.tacticHints ? [...candidate.tacticHints] : undefined,
      })),
    }
    : undefined

const persistBattleTimeline = (matchId: string = battleStore.matchId): void => {
  if (!canUseLocalStorage()) {
    return
  }

  const normalizedMatchId = matchId.trim()
  if (!normalizedMatchId || battleTimelineEntries.value.length === 0) {
    clearPersistedBattleTimeline()
    return
  }

  const payload: PersistedBattleTimelineSnapshot = {
    matchId: normalizedMatchId,
    entries: battleTimelineEntries.value.map((entry) => ({
      ...entry,
      cards: entry.cards.map((card) => ({ ...card })),
      decisionInsight: cloneDecisionInsight(entry.decisionInsight),
      state: cloneBattleStateSnapshot(entry.state),
    })),
  }

  try {
    globalThis.localStorage.setItem(resolveBattleTimelineStorageKey(), JSON.stringify(payload))
  } catch {
    // ignore localStorage errors
  }
}

const restorePersistedBattleTimeline = (matchId: string): void => {
  if (!canUseLocalStorage()) {
    return
  }

  try {
    const raw = globalThis.localStorage.getItem(resolveBattleTimelineStorageKey())
    if (!raw) {
      return
    }

    const parsed = JSON.parse(raw) as Partial<PersistedBattleTimelineSnapshot> | null
    if (!parsed || parsed.matchId?.trim() !== matchId.trim() || !Array.isArray(parsed.entries)) {
      clearPersistedBattleTimeline()
      return
    }

    battleTimelineEntries.value = parsed.entries.reduce<BattleTimelineEntry[]>((acc, item) => {
      if (!item || typeof item !== 'object' || !item.state || typeof item.state !== 'object') {
        return acc
      }

      const entry = item as BattleTimelineEntry
      if ((entry.action !== 'play' && entry.action !== 'pass') || (entry.source !== 'player' && entry.source !== 'ai')) {
        return acc
      }

      acc.push({
        ...entry,
        cards: Array.isArray(entry.cards) ? entry.cards.map((card) => ({ ...card })) : [],
        speech: typeof entry.speech === 'string' && entry.speech.trim() ? entry.speech.trim() : undefined,
        decisionInsight: cloneDecisionInsight(entry.decisionInsight),
        state: cloneBattleStateSnapshot(entry.state),
      })
      return acc
    }, [])
    reviewedTimelineIndex.value = null
  } catch {
    clearPersistedBattleTimeline()
  }
}

const applyRestoredBattleTimeline = (entries: BattleTimelineApiEntry[], matchId: string): void => {
  battleTimelineEntries.value = entries
    .filter((entry) => entry.state.matchId === matchId)
    .map<BattleTimelineEntry>((entry) => ({
      id: entry.id,
      stepNumber: entry.stepNumber,
      playerId: entry.playerId,
      playerSeat: entry.playerSeat,
      action: entry.action,
      cards: entry.cards.map((card) => ({ ...card, isSelected: false })),
      reasoning: entry.reasoning,
      speech: entry.speech?.trim() || undefined,
      decisionInsight: cloneDecisionInsight(entry.decisionInsight),
      state: cloneBattleStateSnapshot(entry.state),
      summary: `${seatLabel(entry.playerSeat)} ${entry.action === 'play' ? '出牌' : '不出'}`,
      source: entry.source,
    }))
  reviewedTimelineIndex.value = null
  persistBattleTimeline(matchId)
}

const clearBattleTimeline = (clearPersisted = true): void => {
  battleTimelineEntries.value = []
  reviewedTimelineIndex.value = null
  if (clearPersisted) {
    clearPersistedBattleTimeline()
  }
}

const createEmptySeatBatchSummary = (): SeatBatchSummary => ({
  totalRank: 0,
  firstCount: 0,
  secondCount: 0,
  thirdCount: 0,
  fourthCount: 0,
})

const cloneSeatBatchSummary = (summary?: SeatBatchSummary): SeatBatchSummary => ({
  totalRank: summary?.totalRank ?? 0,
  firstCount: summary?.firstCount ?? 0,
  secondCount: summary?.secondCount ?? 0,
  thirdCount: summary?.thirdCount ?? 0,
  fourthCount: summary?.fourthCount ?? 0,
})

const createEmptyBatchSummary = (): BatchBattleSummary => ({
  totalGames: 0,
  teamAWins: 0,
  teamBWins: 0,
  unknown: 0,
  seatStats: {
    0: createEmptySeatBatchSummary(),
    1: createEmptySeatBatchSummary(),
    2: createEmptySeatBatchSummary(),
    3: createEmptySeatBatchSummary(),
  },
})

const resolveWinnerTeamFromBattleState = (state: BattleState): 'teamA' | 'teamB' | 'unknown' => {
  const finished = state.finishedSeats
  if (finished.includes(0) && finished.includes(2)) {
    return 'teamA'
  }
  if (finished.includes(1) && finished.includes(3)) {
    return 'teamB'
  }

  if (finished.length >= 2) {
    const topTwo = finished.slice(0, 2)
    if (topTwo.every((seat) => seat === 0 || seat === 2)) {
      return 'teamA'
    }
    if (topTwo.every((seat) => seat === 1 || seat === 3)) {
      return 'teamB'
    }
  }

  return 'unknown'
}

const buildSeatRankMap = (state: BattleState): Record<number, number> => {
  const rankMap: Record<number, number> = {}
  state.finishedSeats.forEach((seat, index) => {
    rankMap[seat] = index + 1
  })

  if (state.finishedSeats.length === 3) {
    const lastSeat = [0, 1, 2, 3].find((seat) => !state.finishedSeats.includes(seat))
    if (typeof lastSeat === 'number') {
      rankMap[lastSeat] = 4
    }
  }

  return rankMap
}

const accumulateBatchSummary = (summary: BatchBattleSummary, state: BattleState): BatchBattleSummary => {
  const seatStats: Record<number, SeatBatchSummary> = {
    0: cloneSeatBatchSummary(summary.seatStats[0]),
    1: cloneSeatBatchSummary(summary.seatStats[1]),
    2: cloneSeatBatchSummary(summary.seatStats[2]),
    3: cloneSeatBatchSummary(summary.seatStats[3]),
  }
  const next: BatchBattleSummary = {
    totalGames: summary.totalGames + 1,
    teamAWins: summary.teamAWins,
    teamBWins: summary.teamBWins,
    unknown: summary.unknown,
    seatStats,
  }

  const winner = resolveWinnerTeamFromBattleState(state)
  if (winner === 'teamA') {
    next.teamAWins += 1
  } else if (winner === 'teamB') {
    next.teamBWins += 1
  } else {
    next.unknown += 1
  }

  const rankMap = buildSeatRankMap(state)
  for (const seat of [0, 1, 2, 3] as const) {
    const seatSummary = next.seatStats[seat] ?? createEmptySeatBatchSummary()
    next.seatStats[seat] = seatSummary
    const rank = rankMap[seat] ?? 4
    seatSummary.totalRank += rank
    if (rank === 1) seatSummary.firstCount += 1
    if (rank === 2) seatSummary.secondCount += 1
    if (rank === 3) seatSummary.thirdCount += 1
    if (rank === 4) seatSummary.fourthCount += 1
  }

  return next
}

const appendBattleTimelineEntry = (
  source: 'player' | 'ai',
  event: Pick<BattleTurnEvent, 'playerId' | 'playerSeat' | 'action' | 'cards' | 'reasoning' | 'speech' | 'decisionInsight'>,
  state: BattleState,
): void => {
  const clonedCards = event.cards.map((card) => ({ ...card, isSelected: false }))
  const entry: BattleTimelineEntry = {
    id: `${source}-${event.playerSeat}-${battleTimelineEntries.value.length}-${Date.now()}`,
    playerId: event.playerId,
    playerSeat: event.playerSeat,
    action: event.action,
    cards: clonedCards,
    reasoning: event.reasoning,
    speech: event.speech?.trim() || undefined,
    decisionInsight: cloneDecisionInsight(event.decisionInsight),
    state: cloneBattleStateSnapshot(state),
    summary: `${seatLabel(event.playerSeat)} ${event.action === 'play' ? '出牌' : '不出'}`,
    source,
  }
  battleTimelineEntries.value = [...battleTimelineEntries.value, entry]
  persistBattleTimeline(state.matchId)
}

const reviewBattleTimelineEntry = (index: number): void => {
  if (index < 0 || index >= battleTimelineEntries.value.length) {
    return
  }
  reviewedTimelineIndex.value = index
}

const exitBattleTimelineReview = (): void => {
  reviewedTimelineIndex.value = null
}

const stepBattleTimelineReview = (delta: number): void => {
  if (reviewedTimelineIndex.value === null) {
    if (battleTimelineEntries.value.length === 0) {
      return
    }
    reviewBattleTimelineEntry(delta >= 0 ? 0 : battleTimelineEntries.value.length - 1)
    return
  }

  const nextIndex = reviewedTimelineIndex.value + delta
  if (nextIndex < 0 || nextIndex >= battleTimelineEntries.value.length) {
    return
  }
  reviewBattleTimelineEntry(nextIndex)
}

const onSelectBattleTimelineEntry = (index: number): void => {
  if (aiBattleAutoplaying.value) {
    abortAiBattleAutoplay()
  }
  reviewBattleTimelineEntry(index)
}

const applyRealtimeBattleState = (state: BattleState, syncHand = false): void => {
  battleStore.applyBattleState(state)
  persistBattleMatchId(state.matchId)

  if (!syncHand) {
    return
  }

  handStore.syncHandPreserveGrouping(state.handCards)
  handStore.clearSelection()
  resetAutoGroupingCache()
}

const handleRealtimeBattleEvent = async (streamEvent: BattlePlayStreamEvent): Promise<void> => {
  switch (streamEvent.type) {
    case 'ready':
      return
    case 'player_action_applied':
      applyRealtimeBattleState(streamEvent.state, true)
      appendBattleTimelineEntry(
        'player',
        {
          playerId: streamEvent.state.playerId,
          playerSeat: 0,
          action: streamEvent.action,
          cards: streamEvent.cards,
          reasoning: streamEvent.action === 'play' ? '玩家手动出牌' : '玩家选择不出',
        },
        streamEvent.state,
      )
      pendingPlayCardIds.value = []
      currentBroadcastDecisionInsight.value = null
      if (streamEvent.action === 'pass') {
        animatedTableCards.value = null
        broadcastLastPlaySeat.value = typeof streamEvent.state.lastPlay?.playerSeat === 'number' ? streamEvent.state.lastPlay.playerSeat : null
        turnBroadcastText.value = '你 不出'
      } else {
        turnBroadcastText.value = '你 出牌'
      }
      return
    case 'ai_turn_start':
      applyRealtimeBattleState(streamEvent.state)
      aiThinkingSeat.value = streamEvent.playerSeat
      currentBroadcastDecisionInsight.value = null
      turnBroadcastText.value = `${seatLabel(streamEvent.playerSeat)} 正在思考`
      return
    case 'ai_turn_event': {
      const { event, state } = streamEvent
      applyRealtimeBattleState(state)
      appendBattleTimelineEntry('ai', event, state)
      aiThinkingSeat.value = null
      currentBroadcastDecisionInsight.value = event.decisionInsight ?? null

      const speech = (event.speech ?? event.reasoning).trim()
      if (showBattleSpeechBubble.value && event.playerSeat >= 0 && event.playerSeat <= 3 && speech) {
        showRivalReasoning(event.playerSeat, speech)
      }

      if (event.action === 'play' && event.cards.length > 0) {
        animatedTableCards.value = event.cards.map((card) => ({ ...card, isSelected: false }))
        broadcastLastPlaySeat.value = event.playerSeat
        turnBroadcastText.value = `${seatLabel(event.playerSeat)} 出牌`
      } else {
        animatedTableCards.value = null
        broadcastLastPlaySeat.value = typeof state.lastPlay?.playerSeat === 'number' ? state.lastPlay.playerSeat : null
        turnBroadcastText.value = `${seatLabel(event.playerSeat)} 不出`
      }
      return
    }
    case 'complete':
      applyRealtimeBattleState(streamEvent.state, true)
      aiThinkingSeat.value = null
      animatedTableCards.value = null
      broadcastLastPlaySeat.value = null
      currentBroadcastDecisionInsight.value = null
      turnBroadcastText.value = ''
      return
    case 'error':
      throw new Error(streamEvent.message)
  }
}

const suits: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds']
const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']

const pushToast = (message: string, type: ToastType = 'info'): void => {
  toastMessage.value = message
  toastType.value = type
  showToast.value = true
  if (type === 'error') {
    lastErrorMessage.value = message
  }

  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastTimer = setTimeout(() => {
    showToast.value = false
  }, TOAST_DURATION_MS)
}

const clearLastError = (): void => {
  lastErrorMessage.value = ''
}

const clearSettlementModalTimer = (): void => {
  if (!settlementModalTimer) {
    return
  }
  clearTimeout(settlementModalTimer)
  settlementModalTimer = null
}

const resetTurnBroadcastVisuals = (): void => {
  turnBroadcastText.value = ''
  animatedTableCards.value = null
  broadcastLastPlaySeat.value = null
  aiThinkingSeat.value = null
  currentBroadcastDecisionInsight.value = null
}

const stopTurnBroadcast = (): void => {
  isBroadcastingTurnEvents.value = false
  resetTurnBroadcastVisuals()
}

const createAbortError = (): Error => {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

const waitForDelay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (ms <= 0) {
      resolve()
      return
    }

    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(createAbortError())
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'

const setBattlePlaybackSpeed = (speed: typeof aiBattlePlaybackOptions[number]['value']): void => {
  settingsStore.setSettings({
    battlePlaybackSpeed: speed,
  })
}

const resolveAiBattlePlaybackDelay = (event: BattlePlayStreamEvent): number => {
  const baseDelay = AI_BATTLE_PLAYBACK_DELAY_MS[currentBattlePlaybackSpeed.value]

  if (baseDelay <= 0) {
    return 0
  }

  switch (event.type) {
    case 'ai_turn_start':
      return Math.max(90, Math.round(baseDelay * 0.45))
    case 'ai_turn_event':
      return baseDelay
    case 'complete':
      return Math.max(80, Math.round(baseDelay * 0.35))
    default:
      return 0
  }
}

const abortAiBattleAutoplay = (): void => {
  if (!aiBattleStreamAbortController) {
    return
  }
  aiBattleStreamAbortController.abort()
  aiBattleStreamAbortController = null
}

const isLegacyAiBattleMismatchError = (message: string): boolean =>
  message.includes('当前轮到真人玩家，无法自动推进')

const rebuildAiBattleSession = async (resumeSpectate = false): Promise<void> => {
  clearPersistedBattleMatchId()
  clearBattleTimeline()
  resetRivalBubbles()
  stopTurnBroadcast()
  const snapshot = await startBattleWithMode('ai_vs_ai', activePlayerId.value)
  battleStore.applyBattleState(snapshot)
  persistBattleMatchId(snapshot.matchId)
  handStore.initHand(snapshot.handCards)
  handStore.clearSelection()
  tableCards.value = []
  pushToast('检测到旧版全 AI 对局已失效，已为你重建新牌局', 'info')
  if (resumeSpectate) {
    await startAiBattleAutoplay(true)
  }
}

const startAiBattleAutoplay = async (silent = false): Promise<void> => {
  if (!isAiBattleMode.value || aiBattleAutoplaying.value) {
    return
  }

  if (!battleStore.matchId) {
    if (!silent) {
      pushToast('对局尚未初始化，请稍后重试', 'error')
    }
    return
  }

  if (battleGameOver.value) {
    try {
      const prepared = await startNextBattleRound(battleStore.matchId, activePlayerId.value)
      applyInterRoundBattleState(prepared)
      showSettlementModal.value = false
      if (prepared.roundPhase !== 'playing') {
        if (!silent) {
          pushToast(prepared.message ?? '下一局已准备，但仍需人工处理交供', 'info')
        }
        return
      }
    } catch (error) {
      if (!silent) {
        const reason = error instanceof Error ? error.message : '未知错误'
        pushToast(`进入下一局失败: ${reason}`, 'error')
      }
      return
    }
  }

  const controller = new AbortController()
  aiBattleStreamAbortController = controller
  exitBattleTimelineReview()
  aiBattleAutoplaying.value = true
  submittingPlay.value = true
  isBroadcastingTurnEvents.value = true
  let shouldRebuildSession = false

  try {
    const result = await advanceBattleStream(
      battleStore.matchId,
      async (event) => {
        const delayMs = resolveAiBattlePlaybackDelay(event)
        await waitForDelay(delayMs, controller.signal)
        await handleRealtimeBattleEvent(event)
      },
      activePlayerId.value,
      { signal: controller.signal },
    )

    if (!silent) {
      pushToast(result.message ?? '全 AI 对战已完成', 'success')
    }
  } catch (error) {
    if (isAbortError(error)) {
      // user paused playback or navigated away
    } else {
      const reason = error instanceof Error ? error.message : '未知错误'
      if (isLegacyAiBattleMismatchError(reason)) {
        shouldRebuildSession = true
      }
      pushToast(`全 AI 对战推进失败: ${reason}`, 'error')
    }
  } finally {
    if (aiBattleStreamAbortController === controller) {
      aiBattleStreamAbortController = null
    }
    aiBattleAutoplaying.value = false
    submittingPlay.value = false
    stopTurnBroadcast()
    if (shouldRebuildSession) {
      await rebuildAiBattleSession(true)
    }
  }
}

const onToggleAiBattleAutoplay = async (): Promise<void> => {
  if (!isAiBattleMode.value) {
    return
  }

  if (aiBattleAutoplaying.value) {
    abortAiBattleAutoplay()
    return
  }

  await startAiBattleAutoplay()
}

const refreshBattleMetricsSnapshot = async (silent = false): Promise<void> => {
  try {
    backendMetricsSnapshot.value = await fetchBattleMetrics()
  } catch (error) {
    if (!silent) {
      const reason = error instanceof Error ? error.message : '未知错误'
      pushToast(`刷新指标失败: ${reason}`, 'error')
    }
  }
}

const onResetBattleMetrics = async (): Promise<void> => {
  if (batchRunActive.value) {
    return
  }

  try {
    await resetBattleMetrics()
    backendMetricsSnapshot.value = await fetchBattleMetrics()
    batchRunSummary.value = null
    batchRunCompleted.value = 0
    batchRunTotal.value = 0
    pushToast('批量统计与后端指标已重置', 'success')
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`重置指标失败: ${reason}`, 'error')
  }
}

const stopBatchRun = (): void => {
  batchRunStopRequested.value = true
  batchRunAbortController?.abort()
}

const stopCompareRun = (): void => {
  compareRunStopRequested.value = true
  compareRunAbortController?.abort()
}

const buildPresetOverride = (preset: BattlePersonaPreset) => ({
  seatPersonalities: {
    0: preset.seat0Personality,
    1: preset.seat1Personality,
    2: preset.seat2Personality,
    3: preset.seat3Personality,
  },
})

const runAiBattleBatchForPreset = async (
  preset: BattlePersonaPreset,
  rounds: number,
  hooks?: {
    onRoundComplete?: (completed: number, total: number, finished: BattleState) => void
    shouldStop?: () => boolean
    signalRef?: (controller: AbortController | null) => void
  },
): Promise<BatchBattleSummary> => {
  let summary = createEmptyBatchSummary()

  for (let index = 0; index < rounds; index += 1) {
    if (hooks?.shouldStop?.()) {
      break
    }

    const controller = new AbortController()
    hooks?.signalRef?.(controller)

    const started = await startBattleWithMode('ai_vs_ai', activePlayerId.value, {
      signal: controller.signal,
      llmOverride: buildPresetOverride(preset),
    })
    const finished = await advanceBattle(started.matchId, activePlayerId.value, {
      signal: controller.signal,
      cleanupWhenFinished: true,
      llmOverride: buildPresetOverride(preset),
    })

    summary = accumulateBatchSummary(summary, finished)
    hooks?.onRoundComplete?.(index + 1, rounds, finished)
  }

  hooks?.signalRef?.(null)
  return summary
}

const onStartBatchRun = async (): Promise<void> => {
  if (!isAiBattleMode.value || batchRunActive.value || compareRunActive.value) {
    return
  }

  abortAiBattleAutoplay()
  clearBattleTimeline()
  exitBattleTimelineReview()
  showSettlementModal.value = false
  batchRunStopRequested.value = false
  batchRunActive.value = true
  batchRunCompleted.value = 0
  batchRunTotal.value = normalizedBatchRunCount.value
  batchRunSummary.value = createEmptyBatchSummary()

  try {
    await resetBattleMetrics()
    const activePreset = {
      id: 'current-settings',
      name: '当前设置',
      seat0Personality: settingsStore.seat0Personality,
      seat1Personality: settingsStore.seat1Personality,
      seat2Personality: settingsStore.seat2Personality,
      seat3Personality: settingsStore.seat3Personality,
    } satisfies BattlePersonaPreset

    batchRunSummary.value = await runAiBattleBatchForPreset(activePreset, batchRunTotal.value, {
      shouldStop: () => batchRunStopRequested.value,
      signalRef: (controller) => {
        batchRunAbortController = controller
      },
      onRoundComplete: (completed, _total, finished) => {
        batchRunCompleted.value = completed
        battleStore.applyBattleState(finished)
        handStore.initHand(finished.handCards)
        handStore.clearSelection()
        clearPersistedBattleMatchId()
        tableCards.value = []
      },
    })

    await refreshBattleMetricsSnapshot(true)
    if (batchRunStopRequested.value) {
      pushToast(`已停止批量连打，完成 ${batchRunCompleted.value} 局`, 'info')
    } else {
      pushToast(`批量连打完成，共 ${batchRunCompleted.value} 局`, 'success')
    }
  } catch (error) {
    if (isAbortError(error)) {
      await refreshBattleMetricsSnapshot(true)
      pushToast(`已停止批量连打，完成 ${batchRunCompleted.value} 局`, 'info')
    } else {
      const reason = error instanceof Error ? error.message : '未知错误'
      pushToast(`批量连打失败: ${reason}`, 'error')
    }
  } finally {
    batchRunAbortController = null
    batchRunActive.value = false
    batchRunStopRequested.value = false
  }
}

const onStartPresetCompare = async (): Promise<void> => {
  if (!isAiBattleMode.value || compareRunActive.value || batchRunActive.value) {
    return
  }

  const presetA = personaPresetOptions.value.find((preset) => preset.id === comparePresetAId.value)
  const presetB = personaPresetOptions.value.find((preset) => preset.id === comparePresetBId.value)
  if (!presetA || !presetB) {
    pushToast('请先选择两套有效预设', 'info')
    return
  }
  if (presetA.id === presetB.id) {
    pushToast('请为 A/B 选择两套不同预设', 'info')
    return
  }

  abortAiBattleAutoplay()
  clearBattleTimeline()
  exitBattleTimelineReview()
  showSettlementModal.value = false
  compareRunActive.value = true
  compareRunStopRequested.value = false
  compareRunCompleted.value = 0
  compareRunTotal.value = normalizedBatchRunCount.value
  compareRunStage.value = 'presetA'
  batchCompareResult.value = null

  try {
    const summaryA = await runAiBattleBatchForPreset(presetA, compareRunTotal.value, {
      shouldStop: () => compareRunStopRequested.value,
      signalRef: (controller) => {
        compareRunAbortController = controller
      },
      onRoundComplete: (completed, _total, finished) => {
        compareRunCompleted.value = completed
        battleStore.applyBattleState(finished)
        handStore.initHand(finished.handCards)
        handStore.clearSelection()
        clearPersistedBattleMatchId()
        tableCards.value = []
      },
    })

    if (compareRunStopRequested.value) {
      batchCompareResult.value = {
        presetAId: presetA.id,
        presetBId: presetB.id,
        totalGames: compareRunCompleted.value,
        summaryA,
        summaryB: createEmptyBatchSummary(),
      }
      pushToast(`已停止双预设对比，方案 A 完成 ${compareRunCompleted.value} 局`, 'info')
      return
    }

    compareRunStage.value = 'presetB'
    compareRunCompleted.value = 0

    const summaryB = await runAiBattleBatchForPreset(presetB, compareRunTotal.value, {
      shouldStop: () => compareRunStopRequested.value,
      signalRef: (controller) => {
        compareRunAbortController = controller
      },
      onRoundComplete: (completed, _total, finished) => {
        compareRunCompleted.value = completed
        battleStore.applyBattleState(finished)
        handStore.initHand(finished.handCards)
        handStore.clearSelection()
        clearPersistedBattleMatchId()
        tableCards.value = []
      },
    })

    batchCompareResult.value = {
      presetAId: presetA.id,
      presetBId: presetB.id,
      totalGames: compareRunTotal.value,
      summaryA,
      summaryB,
    }

    if (compareRunStopRequested.value) {
      pushToast(`已停止双预设对比，方案 B 完成 ${compareRunCompleted.value} 局`, 'info')
    } else {
      pushToast(`双预设对比完成，每组 ${compareRunTotal.value} 局`, 'success')
    }
  } catch (error) {
    if (isAbortError(error)) {
      pushToast('已停止双预设对比', 'info')
    } else {
      const reason = error instanceof Error ? error.message : '未知错误'
      pushToast(`双预设对比失败: ${reason}`, 'error')
    }
  } finally {
    compareRunAbortController = null
    compareRunActive.value = false
    compareRunStopRequested.value = false
    compareRunStage.value = null
  }
}

const applyRestoredBattleSnapshot = async (
  restoredSnapshot: BattleState,
  options?: {
    autoplayIfNeeded?: boolean
    toastMessage?: string
  },
): Promise<void> => {
  battleStore.applyBattleState(restoredSnapshot)
  persistBattleMatchId(restoredSnapshot.matchId)
  if (Array.isArray(restoredSnapshot.timelineEntries)) {
    applyRestoredBattleTimeline(restoredSnapshot.timelineEntries, restoredSnapshot.matchId)
  } else {
    restorePersistedBattleTimeline(restoredSnapshot.matchId)
  }
  handStore.initHand(restoredSnapshot.handCards)
  handStore.clearSelection()
  tableCards.value = []
  reviewedTimelineIndex.value = null
  if (isAiBattleMode.value) {
    await refreshBattleMetricsSnapshot(true)
  }
  if (options?.toastMessage) {
    pushToast(options.toastMessage, 'success')
  }
  if (options?.autoplayIfNeeded && isAiBattleMode.value && !battleGameOver.value) {
    void startAiBattleAutoplay(true)
  }
}

const prepareBattleSessionRestore = (): void => {
  abortAiBattleAutoplay()
  stopBatchRun()
  stopCompareRun()
  clearBattleTimeline(false)
  exitBattleTimelineReview()
  resetRivalBubbles()
  stopTurnBroadcast()
  clearSettlementModalTimer()
  showSettlementModal.value = false
  highlightedManualGroupId.value = null
  invalidGroupId.value = null
  lastErrorMessage.value = ''
  recentBattlePanelOpen.value = false
  if (manualGroupHighlightTimer) {
    clearTimeout(manualGroupHighlightTimer)
    manualGroupHighlightTimer = null
  }
}

const fetchRecentBattleSessionList = async (silent = false): Promise<void> => {
  const battleMode = currentSessionBattleMode.value
  if (!battleMode) {
    recentBattleSessions.value = []
    return
  }

  loadingRecentBattleSessions.value = true
  try {
    recentBattleSessions.value = await fetchBattleSessions(battleMode, 12)
    copiedBattleMatchId.value = ''
  } catch (error) {
    recentBattleSessions.value = []
    if (!silent) {
      const reason = error instanceof Error ? error.message : '未知错误'
      pushToast(`拉取最近对局失败: ${reason}`, 'error')
    }
  } finally {
    loadingRecentBattleSessions.value = false
  }
}

const onToggleRecentBattlePanel = async (): Promise<void> => {
  if (!isAnyBattleMode.value) {
    return
  }

  const nextOpen = !recentBattlePanelOpen.value
  recentBattlePanelOpen.value = nextOpen
  if (nextOpen) {
    recentBattleQuery.value = ''
    recentBattleShowActiveOnly.value = false
    copiedBattleMatchId.value = ''
    await fetchRecentBattleSessionList()
  }
}

const copyBattleMatchId = async (matchId: string): Promise<void> => {
  if (!matchId) {
    return
  }

  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(matchId)
    } else if (typeof document !== 'undefined') {
      const input = document.createElement('textarea')
      input.value = matchId
      input.setAttribute('readonly', 'true')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    } else {
      throw new Error('当前环境不支持复制')
    }

    copiedBattleMatchId.value = matchId
    pushToast('对局 ID 已复制', 'success')
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`复制失败: ${reason}`, 'error')
  }
}

const onRestoreBattleSession = async (matchId: string): Promise<void> => {
  if (!matchId || restoringBattleSession.value) {
    return
  }

  restoringBattleSession.value = true
  restoringBattleMatchId.value = matchId
  abortAiBattleAutoplay()
  stopBatchRun()
  stopCompareRun()

  try {
    const restoredSnapshot = await fetchBattleState(matchId, activePlayerId.value)
    prepareBattleSessionRestore()
    await applyRestoredBattleSnapshot(restoredSnapshot, {
      autoplayIfNeeded: true,
      toastMessage: isAiBattleMode.value ? '已从最近对局恢复观战局' : '已从最近对局恢复实战局',
    })
    await fetchRecentBattleSessionList(true)
  } catch (error) {
    clearPersistedBattleMatchId()
    clearPersistedBattleTimeline()
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`恢复最近对局失败: ${reason}`, 'error')
  } finally {
    restoringBattleSession.value = false
    restoringBattleMatchId.value = ''
  }
}

const buildSeedCard = (
  id: string,
  suit: CardSuit,
  rank: string,
  deckIndex: number,
  options: { logicValue?: number; isWildcard?: boolean } = {},
): RuntimeCard => {
  const suitBonus: Record<CardSuit, number> = {
    hearts: 4,
    diamonds: 3,
    clubs: 2,
    spades: 1,
    joker: 0,
  }

  const rankOrder: Record<string, number> = {
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

  return {
    id,
    suit,
    rank,
    deckIndex,
    logicValue: options.logicValue ?? (rankOrder[rank] ?? 0) * 10 + suitBonus[suit],
    isWildcard: options.isWildcard ?? (suit === 'hearts' && rank === '8'),
    isSelected: false,
  }
}

const buildDemoInitialHands = (): RuntimeCard[][] => {
  const fullDeck: RuntimeCard[] = []
  let serial = 0

  for (let deckIndex = 0; deckIndex < 2; deckIndex += 1) {
    for (const suit of suits) {
      for (const rank of ranks) {
        fullDeck.push(buildSeedCard(`seed-${serial++}`, suit, rank, deckIndex))
      }
    }
    fullDeck.push(buildSeedCard(`seed-${serial++}`, 'joker', 'JOKER', deckIndex, { logicValue: 160, isWildcard: false }))
    fullDeck.push(buildSeedCard(`seed-${serial++}`, 'joker', 'JOKER', deckIndex, { logicValue: 170, isWildcard: false }))
  }

  return Array.from({ length: 4 }, (_, playerIndex) =>
    fullDeck
      .filter((_, index) => index % 4 === playerIndex)
      .slice(0, 27)
      .map((card) => ({ ...card, id: `${card.id}-p${playerIndex + 1}` })),
  )
}

const loadInitialHand = async (): Promise<void> => {
  loadingHand.value = true
  abortAiBattleAutoplay()
  clearBattleTimeline(false)
  resetRivalBubbles()
  stopTurnBroadcast()
  clearSettlementModalTimer()
  highlightedManualGroupId.value = null
  if (manualGroupHighlightTimer) {
    clearTimeout(manualGroupHighlightTimer)
    manualGroupHighlightTimer = null
  }

  try {
    if (isLeastMovesMode.value) {
      const cards = await fetchNewTrainingHand()
      handStore.initHand(cards)
      pushToast('训练新手牌已加载', 'success')
      return
    }

    if (isAnyBattleMode.value) {
      const cachedMatchId = readPersistedBattleMatchId()
      if (cachedMatchId) {
        try {
          const restoredSnapshot = await fetchBattleState(cachedMatchId, activePlayerId.value)
          await applyRestoredBattleSnapshot(restoredSnapshot, {
            autoplayIfNeeded: true,
            toastMessage: isAiBattleMode.value ? '已恢复上次全 AI 对局' : '已恢复上次对局',
          })
          await fetchRecentBattleSessionList(true)
          return
        } catch (restoreError) {
          clearPersistedBattleMatchId()
          clearPersistedBattleTimeline()
          const reason = restoreError instanceof Error ? restoreError.message : '未知错误'
          pushToast(`历史对局恢复失败，已新开局: ${reason}`, 'info')
        }
      }

      clearPersistedBattleTimeline()
      const snapshot = isAiBattleMode.value
        ? await startBattleWithMode('ai_vs_ai', activePlayerId.value)
        : await startBattle(activePlayerId.value)
      battleStore.applyBattleState(snapshot)
      persistBattleMatchId(snapshot.matchId)
      handStore.initHand(snapshot.handCards)
      handStore.clearSelection()
      tableCards.value = []
      if (isAiBattleMode.value) {
        await refreshBattleMetricsSnapshot(true)
      }
      await fetchRecentBattleSessionList(true)
      pushToast(isAiBattleMode.value ? '全 AI 对局已初始化' : '实战对局已初始化', 'success')
      if (isAiBattleMode.value) {
        void startAiBattleAutoplay(true)
      }
      return
    }

    handStore.initHand(buildDemoInitialHands()[0] ?? [])
    pushToast('已加载本地演示手牌', 'info')
  } catch (error) {
    const fallback = buildDemoInitialHands()[0] ?? []
    battleStore.resetBattleState()
    handStore.initHand(fallback)
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`后端拉牌失败，已切换本地手牌: ${reason}`, 'error')
  } finally {
    loadingHand.value = false
  }
}

const handleCardMove = (payload: { cardId: string; fromGroupId: string; toGroupId: string; newIndex: number }): void => {
  handStore.moveCard(payload.cardId, payload.fromGroupId, payload.toGroupId, payload.newIndex)
  invalidGroupId.value = null
  cachedAutoGroupings.value = undefined
}

const handleCardToggle = (cardId: string): void => {
  handStore.toggleCardSelection(cardId)
  cachedAutoGroupings.value = undefined
}

const closeSettlementModal = (): void => {
  if (isAnyBattleMode.value && battleStore.roundPhase === 'finished') {
    pushToast('请先选择进入下一局，或直接重新开始新系列', 'info')
    return
  }
  showSettlementModal.value = false
}

const submitLeastMovesPlan = async (): Promise<void> => {
  const trainingGroups = activeTrainingGroups.value
  if (trainingGroups.length === 0) {
    pushToast('请先整理牌堆后再提交方案', 'info')
    return
  }

  submittingPlay.value = true
  invalidGroupId.value = null

  try {
    const groupsPayload = trainingGroups.map((group) =>
      group.cards.map((card) => ({
        ...card,
        isSelected: false,
      })),
    )

    const validation = await validateTrainingGroups(groupsPayload)

    if (!validation.success) {
      const invalidIndex = validation.invalidGroupIndex
      if (typeof invalidIndex === 'number' && invalidIndex >= 0 && invalidIndex < trainingGroups.length) {
        invalidGroupId.value = trainingGroups[invalidIndex]?.groupId ?? null
      }

      pushToast('提交失败，存在不符合规则的牌型组合，请检查！', 'error')
      return
    }

    settlementMoves.value = validation.totalMoves ?? trainingGroups.length
    showSettlementModal.value = true
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`提交失败: ${reason}`, 'error')
  } finally {
    submittingPlay.value = false
  }
}

const getCardsHash = (cards: RuntimeCard[]) => cards.map(c => c.id).sort().join(',')

const buildBattleAutoGroupContext = (cards: RuntimeCard[]): BattleAutoGroupContext => {
  const players: BattleAutoGroupContext['players'] = [
    {
      seat: 0,
      cardsLeft: cards.length,
      isTeammate: false,
      rank: battleStore.rank,
    },
    ...battleStore.opponents.map((opponent) => ({
      seat: opponent.seat,
      cardsLeft: opponent.cardsLeft,
      isTeammate: opponent.seat === 2,
      rank: opponent.rank,
    })),
  ]

  return {
    players,
    currentTurn: battleStore.currentTurn,
    currentLevel: battleStore.currentLevel,
    lastPlay: battleStore.lastPlay
      ? {
        ...battleStore.lastPlay,
        cards: battleStore.lastPlay.cards.map((card) => ({ ...card, isSelected: false })),
      }
      : null,
  }
}

const onAutoGroup = async (): Promise<void> => {
  if (
    !canUseArrangeTools.value ||
    loadingHand.value ||
    submittingPlay.value ||
    isBroadcastingTurnEvents.value ||
    smartGrouping.value ||
    refreshingHand.value
  ) {
    return
  }

  const currentCards = handStore.cardGroups.flatMap((group) => group.cards)
  if (currentCards.length === 0) {
    pushToast('当前没有可理牌的手牌', 'info')
    return
  }

  const currentHash = getCardsHash(currentCards)

  if (cachedAutoGroupings.value && cachedAutoGroupings.value.length > 0 && lastAutoGroupCardsHash.value === currentHash) {
    currentGroupingIndex.value = (currentGroupingIndex.value + 1) % cachedAutoGroupings.value.length
    const nextGroup = cachedAutoGroupings.value[currentGroupingIndex.value]
    if (!nextGroup) return

    handStore.applySmartGrouping(nextGroup.groups)
    pushToast(`已切换为【${nextGroup.strategyName}】评分:${nextGroup.score} (${currentGroupingIndex.value + 1}/${cachedAutoGroupings.value.length})`, 'success')
    return
  }

  smartGrouping.value = true
  invalidGroupId.value = null
  pushToast('AI 正在思考多种理牌方案...', 'info')

  try {
    const cardsPayload = currentCards.map((card) => ({ ...card, isSelected: false }))
    const result = isBattleMode.value
      ? await autoGroupBattle(cardsPayload, buildBattleAutoGroupContext(cardsPayload))
      : await autoGroupTraining(cardsPayload)
    
    if (result.allGroupings && result.allGroupings.length > 0) {
      cachedAutoGroupings.value = result.allGroupings
      currentGroupingIndex.value = 0
      lastAutoGroupCardsHash.value = currentHash
      
      const best = result.allGroupings[0]
      if (best) {
        handStore.applySmartGrouping(best.groups)
        const modeText = isBattleMode.value ? '实战' : '训练'
        const hasMore = result.allGroupings.length > 1
        pushToast(`${modeText}采用【${best.strategyName}】方案${hasMore ? ' (再次点击切换其他解法)' : ''}`, 'success')
      }
    } else {
      handStore.applySmartGrouping(result.groupedCards)
      pushToast(`智能理牌完成，共 ${result.groupedCards.length} 组`, 'success')
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误'
    const modeText = isBattleMode.value ? '实战' : '训练'
    pushToast(`${modeText}智能理牌失败: ${reason}`, 'error')
  } finally {
    smartGrouping.value = false
  }
}

const onFetchNewTrainingHand = async (): Promise<void> => {
  if (
    !isLeastMovesMode.value ||
    loadingHand.value ||
    submittingPlay.value ||
    isBroadcastingTurnEvents.value ||
    smartGrouping.value ||
    refreshingHand.value ||
    startingNewBattle.value
  ) {
    return
  }

  refreshingHand.value = true
  invalidGroupId.value = null

  try {
    const cards = await fetchNewTrainingHand()
    handStore.initHand(cards)
    handStore.clearSelection()
    tableCards.value = []
    showSettlementModal.value = false
    pushToast('新手牌已发放，开始下一轮训练', 'success')
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`重新发牌失败: ${reason}`, 'error')
  } finally {
    refreshingHand.value = false
  }
}

const onStartNewBattle = async (): Promise<void> => {
  if (
    !isAnyBattleMode.value ||
    loadingHand.value ||
    submittingPlay.value ||
    isBroadcastingTurnEvents.value ||
    smartGrouping.value ||
    refreshingHand.value ||
    startingNewBattle.value
  ) {
    return
  }

  const message = '确认新开一局吗？当前对局进度将不再恢复。'
  if (typeof globalThis.confirm === 'function' && !globalThis.confirm(message)) {
    return
  }

  startingNewBattle.value = true
  abortAiBattleAutoplay()
  clearBattleTimeline()
  clearSettlementModalTimer()
  resetRivalBubbles()
  stopTurnBroadcast()
  highlightedManualGroupId.value = null
  invalidGroupId.value = null
  showSettlementModal.value = false
  if (manualGroupHighlightTimer) {
    clearTimeout(manualGroupHighlightTimer)
    manualGroupHighlightTimer = null
  }

  try {
    const snapshot = isAiBattleMode.value
      ? await startBattleWithMode('ai_vs_ai', activePlayerId.value)
      : await startBattle(activePlayerId.value)
    battleStore.applyBattleState(snapshot)
    persistBattleMatchId(snapshot.matchId)
    handStore.initHand(snapshot.handCards)
    handStore.clearSelection()
    tableCards.value = []
    if (isAiBattleMode.value) {
      await refreshBattleMetricsSnapshot(true)
    }
    await fetchRecentBattleSessionList(true)
    pushToast(isAiBattleMode.value ? '已新开一局全 AI 对战' : '已新开一局', 'success')
    if (isAiBattleMode.value) {
      void startAiBattleAutoplay(true)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`新开对局失败: ${reason}`, 'error')
  } finally {
    startingNewBattle.value = false
  }
}

const applyInterRoundBattleState = (state: BattleState): void => {
  battleStore.applyBattleState(state)
  persistBattleMatchId(state.matchId)
  handStore.initHand(state.handCards)
  handStore.clearSelection()
  reviewedTimelineIndex.value = null
  resetAutoGroupingCache()
  tableCards.value = []
  animatedTableCards.value = null
  broadcastLastPlaySeat.value = null
  turnBroadcastText.value = ''
}

const onStartNextRound = async (): Promise<void> => {
  if (!isAnyBattleMode.value || !battleStore.matchId || advancingBattleRound.value || submittingTribute.value) {
    return
  }
  if (battleStore.roundPhase === 'playing') {
    pushToast('当前已经在进行下一局了', 'info')
    return
  }
  if (battleStore.roundPhase === 'awaiting_tribute' || battleStore.roundPhase === 'awaiting_return') {
    pushToast('请先完成当前交供步骤', 'info')
    return
  }

  advancingBattleRound.value = true
  abortAiBattleAutoplay()
  pendingPlayCardIds.value = []
  isBroadcastingTurnEvents.value = false
  currentBroadcastDecisionInsight.value = null

  try {
    const state = await startNextBattleRound(battleStore.matchId, activePlayerId.value)
    applyInterRoundBattleState(state)
    showSettlementModal.value = false
    if (state.pendingTribute?.requiredAction) {
      pushToast(state.message ?? '下一局已发牌，请先完成交供', 'info')
      return
    }
    pushToast(state.message ?? '已进入下一局', 'success')
    if (isAiBattleMode.value) {
      void startAiBattleAutoplay(true)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`进入下一局失败: ${reason}`, 'error')
  } finally {
    advancingBattleRound.value = false
  }
}

const onSubmitPendingTribute = async (): Promise<void> => {
  if (!isBattleMode.value || !battleStore.matchId || !playerPendingTributeAction.value) {
    return
  }
  if (submittingTribute.value || advancingBattleRound.value) {
    return
  }
  if (selectedCards.value.length !== 1) {
    pushToast('请先选择 1 张牌后再提交交供', 'info')
    return
  }

  submittingTribute.value = true
  try {
    const selectedCard = selectedCards.value[0]
    if (!selectedCard) {
      pushToast('请先选择 1 张牌后再提交交供', 'info')
      return
    }

    const state = await submitBattleTribute(battleStore.matchId, selectedCard.id, activePlayerId.value)
    applyInterRoundBattleState(state)
    showSettlementModal.value = false
    if (state.pendingTribute?.requiredAction) {
      pushToast(state.message ?? '请继续完成交供步骤', 'info')
      return
    }
    pushToast(state.message ?? '交供完成，下一局开始', 'success')
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`提交交供失败: ${reason}`, 'error')
  } finally {
    submittingTribute.value = false
  }
}

const onResetGrouping = (): void => {
  if (
    !canUseArrangeTools.value ||
    loadingHand.value ||
    submittingPlay.value ||
    isBroadcastingTurnEvents.value ||
    smartGrouping.value ||
    refreshingHand.value ||
    startingNewBattle.value
  ) {
    return
  }

  handStore.resetGrouping()
  invalidGroupId.value = null
  pushToast('已打散为初始单组', 'success')
}

const onExtractSelectedToNewGroup = (): void => {
  if (
    !canUseArrangeTools.value ||
    loadingHand.value ||
    submittingPlay.value ||
    isBroadcastingTurnEvents.value ||
    smartGrouping.value ||
    refreshingHand.value ||
    startingNewBattle.value
  ) {
    return
  }

  if (!hasSelectedCards.value) {
    return
  }

  const selectedCount = selectedCards.value.length
  const newGroupId = handStore.extractSelectedToNewGroup()
  if (!newGroupId) {
    return
  }

  invalidGroupId.value = null
  highlightedManualGroupId.value = newGroupId

  void nextTick(() => {
    const target = groupRowRef.value?.querySelector<HTMLElement>(`[data-group-id="${newGroupId}"]`)
    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  })

  if (manualGroupHighlightTimer) {
    clearTimeout(manualGroupHighlightTimer)
  }
  manualGroupHighlightTimer = setTimeout(() => {
    highlightedManualGroupId.value = null
    manualGroupHighlightTimer = null
  }, 1400)

  pushToast(`已提取 ${selectedCount} 张牌到新牌组`, 'success')
}

const onPlay = async (): Promise<void> => {
  if (isLeastMovesMode.value) {
    await submitLeastMovesPlan()
    return
  }

  if (!isBattleMode.value) {
    return
  }

  if (battleActionDisabled.value) {
    if (!isPlayerTurn.value) {
      pushToast('等待其他玩家出牌...', 'info')
    }
    return
  }

  if (!battleStore.matchId) {
    pushToast('对局尚未初始化，请稍后重试', 'error')
    return
  }

  const cardsToPlay = selectedCards.value
  if (cardsToPlay.length === 0) {
    pushToast('请先选择要出的牌', 'info')
    return
  }

  const payloadCards = cardsToPlay.map((card) => ({ ...card, isSelected: false }))
  pendingPlayCardIds.value = payloadCards.map((card) => card.id)
  exitBattleTimelineReview()
  handStore.clearSelection()
  submittingPlay.value = true
  isBroadcastingTurnEvents.value = true
  aiThinkingSeat.value = predictFirstAiSeatAfterPlayerAction('play')
  animatedTableCards.value = payloadCards.map((card) => ({ ...card }))
  broadcastLastPlaySeat.value = 0
  turnBroadcastText.value = '你 出牌'

  try {
    const result = await submitBattlePlayStream(
      battleStore.matchId,
      payloadCards,
      async (event) => {
        await handleRealtimeBattleEvent(event)
      },
      activePlayerId.value,
    )
    aiThinkingSeat.value = null
    pushToast(result.message ?? '出牌成功', 'success')
  } catch (error) {
    aiThinkingSeat.value = null
    handStore.clearSelection()
    turnBroadcastText.value = ''
    animatedTableCards.value = null
    broadcastLastPlaySeat.value = null
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`出牌失败: ${reason}`, 'error')
  } finally {
    aiThinkingSeat.value = null
    pendingPlayCardIds.value = []
    submittingPlay.value = false
    isBroadcastingTurnEvents.value = false
  }
}

const onPass = async (): Promise<void> => {
  if (!isBattleMode.value) {
    return
  }

  if (battleActionDisabled.value) {
    if (!isPlayerTurn.value) {
      pushToast('等待其他玩家出牌...', 'info')
    }
    return
  }

  if (!battleStore.matchId) {
    pushToast('对局尚未初始化，请稍后重试', 'error')
    return
  }

  submittingPlay.value = true
  exitBattleTimelineReview()
  isBroadcastingTurnEvents.value = true
  aiThinkingSeat.value = predictFirstAiSeatAfterPlayerAction('pass')
  try {
    const result = await submitBattlePlayStream(
      battleStore.matchId,
      [],
      async (event) => {
        await handleRealtimeBattleEvent(event)
      },
      activePlayerId.value,
    )
    aiThinkingSeat.value = null
    pushToast(result.message ?? '本轮选择不出', 'info')
  } catch (error) {
    aiThinkingSeat.value = null
    const reason = error instanceof Error ? error.message : '未知错误'
    pushToast(`不出失败: ${reason}`, 'error')
  } finally {
    aiThinkingSeat.value = null
    submittingPlay.value = false
    isBroadcastingTurnEvents.value = false
  }
}

const goHome = (): void => {
  void router.push('/')
}

onBeforeUnmount(() => {
  abortAiBattleAutoplay()
  stopBatchRun()
  stopCompareRun()
  resetRivalBubbles()
  clearSettlementModalTimer()
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  if (manualGroupHighlightTimer) {
    clearTimeout(manualGroupHighlightTimer)
  }
})

onMounted(() => {
  void loadInitialHand()
})

watch(
  () => resolveModeQuery(),
  () => {
    abortAiBattleAutoplay()
    stopBatchRun()
    stopCompareRun()
    recentBattlePanelOpen.value = false
    recentBattleSessions.value = []
    if (isLeastMovesMode.value) {
      battleStore.resetBattleState()
      tableCards.value = []
    }
    void loadInitialHand()
  },
)

watch(isLeastMovesMode, () => {
  invalidGroupId.value = null
  showSettlementModal.value = false
})

watch(
  () => settingsStore.showBattleSpeechBubble,
  (enabled) => {
    if (!enabled) {
      resetRivalBubbles()
    }
  },
)

watch(
  personaPresetOptions,
  (presets) => {
    if (presets.length === 0) {
      comparePresetAId.value = ''
      comparePresetBId.value = ''
      return
    }

    if (!presets.some((preset) => preset.id === comparePresetAId.value)) {
      comparePresetAId.value = presets[0]?.id ?? ''
    }
    if (!presets.some((preset) => preset.id === comparePresetBId.value)) {
      comparePresetBId.value = presets[1]?.id ?? presets[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch([battleGameOver, isBroadcastingTurnEvents, isAnyBattleMode, () => battleStore.roundPhase], ([isOver, isBroadcasting, isBattle, roundPhase]) => {
  clearSettlementModalTimer()

  if (!isBattle || !isOver) {
    if (!isOver) {
      showSettlementModal.value = false
    }
    return
  }

  if (isBroadcasting) {
    return
  }
  if (roundPhase !== 'finished') {
    return
  }

  settlementModalTimer = setTimeout(() => {
    settlementModalTimer = null
    if (!isAnyBattleMode.value || !battleGameOver.value || isBroadcastingTurnEvents.value || battleStore.roundPhase !== 'finished') {
      return
    }
    if (isAiBattleMode.value) {
      aiBattleAutoplaying.value = false
    }
    resetRivalBubbles()
    stopTurnBroadcast()
    showSettlementModal.value = true
  }, BATTLE_SETTLEMENT_DELAY_MS)
})
</script>

<template>
  <main class="game-table" :class="{ 'solo-mode': isLeastMovesMode }">
    <section class="top-actions">
      <button
        v-if="isLeastMovesMode"
        class="new-hand-btn"
        :disabled="baseActionDisabled"
        @click="onFetchNewTrainingHand"
      >
        {{ refreshingHand ? '🔄 发牌中...' : '🔄 重新发牌' }}
      </button>
      <button
        v-if="isAnyBattleMode"
        class="new-hand-btn"
        :disabled="baseActionDisabled"
        @click="onStartNewBattle"
      >
        {{ newBattleButtonLabel }}
      </button>
      <button
        v-if="isAiBattleMode"
        class="back-home-btn"
        :disabled="aiBattleControlDisabled"
        @click="onToggleAiBattleAutoplay"
      >
        {{ aiBattleControlLabel }}
      </button>
      <div v-if="isAiBattleMode" class="speed-toolbar" aria-label="观战播放速度">
        <span class="speed-toolbar-label">速度：{{ battlePlaybackSpeedLabel }}</span>
        <button
          v-for="option in aiBattlePlaybackOptions"
          :key="option.value"
          type="button"
          class="speed-pill"
          :class="{ active: currentBattlePlaybackSpeed === option.value }"
          @click="setBattlePlaybackSpeed(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <div v-if="isAnyBattleMode" class="recent-battle-wrap">
        <button
          type="button"
          class="back-home-btn"
          :disabled="loadingHand || restoringBattleSession"
          @click="onToggleRecentBattlePanel"
        >
          {{ recentBattlePanelOpen ? '收起最近对局' : recentBattlePanelTitle }}
        </button>
        <div
          v-if="recentBattlePanelOpen"
          class="recent-battle-panel"
          role="dialog"
          :aria-label="recentBattlePanelTitle"
        >
          <div class="recent-battle-panel-head">
            <strong>{{ recentBattlePanelTitle }}</strong>
            <button type="button" class="timeline-btn" :disabled="loadingRecentBattleSessions" @click="fetchRecentBattleSessionList()">
              {{ loadingRecentBattleSessions ? '刷新中...' : '刷新列表' }}
            </button>
          </div>
          <p class="recent-battle-panel-subtitle">支持手动恢复最近 12 局，同模式优先展示。</p>
          <div class="recent-battle-toolbar">
            <input
              v-model.trim="recentBattleQuery"
              class="recent-battle-search"
              type="search"
              placeholder="搜索 matchId / 玩家 / 级牌"
            />
            <label class="recent-battle-filter">
              <input v-model="recentBattleShowActiveOnly" type="checkbox" />
              <span>仅看未结束</span>
            </label>
          </div>
          <div v-if="loadingRecentBattleSessions" class="recent-battle-empty">正在读取最近对局...</div>
          <div v-else-if="recentBattleSessions.length === 0" class="recent-battle-empty">当前还没有可恢复的最近对局。</div>
          <div v-else-if="filteredRecentBattleSessions.length === 0" class="recent-battle-empty">没有匹配到符合条件的对局。</div>
          <div v-else class="recent-battle-list">
            <article
              v-for="session in filteredRecentBattleSessions"
              :key="session.matchId"
              class="recent-battle-item"
            >
              <span class="recent-battle-item-title">
                {{ session.matchId }}
                <span v-if="session.matchId === battleStore.matchId" class="recent-battle-badge">当前</span>
                <span v-if="copiedBattleMatchId === session.matchId" class="recent-battle-badge">已复制</span>
              </span>
              <span class="recent-battle-item-meta">
                {{ describeBattleSessionStatus(session) }} · 级牌 {{ session.currentLevel }} · {{ session.antiTributeEnabled ? '抗贡开' : '抗贡关' }}
              </span>
              <span class="recent-battle-item-meta">
                创建 {{ formatBattleSessionTime(session.createdAt) }} · 更新 {{ formatBattleSessionTime(session.updatedAt) }}
              </span>
              <span class="recent-battle-item-meta">
                {{ describeBattleSessionLastAction(session) }}
              </span>
              <div class="recent-battle-item-actions">
                <button
                  type="button"
                  class="timeline-btn"
                  :disabled="restoringBattleSession"
                  @click="copyBattleMatchId(session.matchId)"
                >
                  复制 ID
                </button>
                <button
                  type="button"
                  class="timeline-btn timeline-btn-strong"
                  :disabled="restoringBattleSession"
                  @click="onRestoreBattleSession(session.matchId)"
                >
                  {{
                    restoringBattleMatchId === session.matchId && restoringBattleSession
                      ? '恢复中...'
                      : '恢复这局'
                  }}
                </button>
              </div>
            </article>
          </div>
        </div>
      </div>
      <button class="back-home-btn" @click="goHome">返回主页</button>
    </section>

    <transition name="toast-fade">
      <div v-if="showToast" class="toast" :class="toastType">{{ toastMessage }}</div>
    </transition>

    <transition name="modal-fade">
      <div v-if="showSettlementModal" class="settlement-overlay" @click.self="closeSettlementModal">
        <div class="settlement-modal" role="dialog" aria-modal="true" aria-label="游戏结算">
          <div v-if="isLeastMovesMode">
            <p class="settlement-title">🎉 恭喜！你成功将手牌整理为 {{ settlementMoves }} 手！</p>
          </div>
          <div v-else class="battle-results">
            <p class="settlement-title">🏁 对局结束！名次如下：</p>
            <div
              v-for="seat in battleStore.finishedSeats"
              :key="seat"
              class="result-item"
              :class="{ highlight: seat === 0 }"
            >
              <span class="result-name">{{ seatLabel(seat) }}</span>
              <span class="result-rank">{{ rankToText(battleStore.finishedSeats.indexOf(seat) + 1) }}</span>
            </div>
            <!-- 处理末游 -->
            <div v-if="battleStore.finishedSeats.length === 3" class="result-item">
              <span class="result-name">{{ seatLabel([0,1,2,3].find(s => !battleStore.finishedSeats.includes(s))!) }}</span>
              <span class="result-rank">{{ rankToText(4) }}</span>
            </div>
            <div v-if="battleStore.lastRoundSummary" class="settlement-summary">
              <p>升级结果：{{ battleStore.lastRoundSummary.resultLabel }}，升 {{ battleStore.lastRoundSummary.upgradeSteps }} 级</p>
              <p>级牌变化：{{ battleStore.lastRoundSummary.levelBefore }} → {{ battleStore.lastRoundSummary.levelAfter }}</p>
              <p v-if="battleStore.lastRoundSummary.tributePairs && battleStore.lastRoundSummary.tributePairs.length > 0">
                交供安排：
                {{
                  battleStore.lastRoundSummary.tributePairs
                    .map((pair) => `${seatLabel(pair.giverSeat)} -> ${seatLabel(pair.receiverSeat)}`)
                    .join('；')
                }}
              </p>
              <p v-else-if="battleStore.lastRoundSummary.tributeRequired">
                交供安排：{{ seatLabel(battleStore.lastRoundSummary.tributeGiverSeat ?? 0) }} 向
                {{ seatLabel(battleStore.lastRoundSummary.tributeReceiverSeat ?? 0) }} 进贡 1 张
              </p>
            </div>
          </div>

          <div class="settlement-actions">
            <button
              v-if="isLeastMovesMode"
              class="settlement-btn settlement-new-hand-btn"
              :disabled="loadingHand || submittingPlay || smartGrouping || refreshingHand"
              @click="onFetchNewTrainingHand"
            >
              {{ refreshingHand ? '🔄 发牌中...' : '🔄 重新发牌' }}
            </button>
            <button
              v-if="isAnyBattleMode && battleStore.roundPhase === 'finished'"
              class="settlement-btn settlement-new-hand-btn"
              :disabled="advancingBattleRound"
              @click="onStartNextRound"
            >
              {{ advancingBattleRound ? '⏭️ 准备中...' : '⏭️ 进入下一局' }}
            </button>
            <button
              v-if="isAnyBattleMode"
              class="settlement-btn settlement-new-hand-btn"
              :disabled="startingNewBattle"
              @click="onStartNewBattle"
            >
              {{ startingNewBattle ? '🆕 开局中...' : isAiBattleMode ? '🆕 重新开始观战局' : '🆕 重新开始新系列' }}
            </button>
            <button v-if="!isAnyBattleMode || battleStore.roundPhase !== 'finished'" class="settlement-btn" @click="closeSettlementModal">关闭</button>
          </div>
        </div>
      </div>
    </transition>

    <section
      v-if="!isLeastMovesMode"
      class="rival rival-top"
      :class="{ 'turn-active': isAnyBattleMode && battleStore.currentTurn === 2, 'last-play-active': isTopLastPlay }"
    >
      <h3>{{ topSeatTitle }}</h3>
      <p v-if="!topOpponentRankText">剩余手牌：{{ topOpponentCards }}</p>
      <div v-else class="rank-badge">{{ topOpponentRankText }}</div>
      <transition name="rival-bubble-fade">
        <div
          v-if="isAnyBattleMode && showBattleSpeechBubble && isRivalBubbleVisible(2)"
          class="reasoning-bubble"
          :class="{ 'is-thinking': isRivalBubbleThinking(2), 'is-fading': isRivalBubbleFading(2) }"
        >
          {{ getRivalBubbleText(2) }}
        </div>
      </transition>
    </section>

    <section
      v-if="!isLeastMovesMode"
      class="rival rival-left"
      :class="{ 'turn-active': isAnyBattleMode && battleStore.currentTurn === 3, 'last-play-active': isLeftLastPlay }"
    >
      <h3>{{ leftSeatTitle }}</h3>
      <p v-if="!leftOpponentRankText">剩余手牌：{{ leftOpponentCards }}</p>
      <div v-else class="rank-badge">{{ leftOpponentRankText }}</div>
      <transition name="rival-bubble-fade">
        <div
          v-if="isAnyBattleMode && showBattleSpeechBubble && isRivalBubbleVisible(3)"
          class="reasoning-bubble"
          :class="{ 'is-thinking': isRivalBubbleThinking(3), 'is-fading': isRivalBubbleFading(3) }"
        >
          {{ getRivalBubbleText(3) }}
        </div>
      </transition>
    </section>

    <section
      v-if="!isLeastMovesMode"
      class="rival rival-right"
      :class="{ 'turn-active': isAnyBattleMode && battleStore.currentTurn === 1, 'last-play-active': isRightLastPlay }"
    >
      <h3>{{ rightSeatTitle }}</h3>
      <p v-if="!rightOpponentRankText">剩余手牌：{{ rightOpponentCards }}</p>
      <div v-else class="rank-badge">{{ rightOpponentRankText }}</div>
      <transition name="rival-bubble-fade">
        <div
          v-if="isAnyBattleMode && showBattleSpeechBubble && isRivalBubbleVisible(1)"
          class="reasoning-bubble"
          :class="{ 'is-thinking': isRivalBubbleThinking(1), 'is-fading': isRivalBubbleFading(1) }"
        >
          {{ getRivalBubbleText(1) }}
        </div>
      </transition>
    </section>

    <section class="table-center">
      <p v-if="isLeastMovesMode" class="mode-banner">当前模式：理牌训练 - 目标：用最少的手数组合手牌</p>
      <p v-if="isBattleMode" class="mode-banner">当前模式：实战模拟 - 1 人对抗 3 AI</p>
      <p v-if="isAiBattleMode" class="mode-banner">当前模式：全 AI 对战观战 - 自动推进四家出牌</p>
      <p v-if="isAnyBattleMode" class="level-badge">🃏 当前打：{{ currentLevelText }}</p>
      <p v-if="isAnyBattleMode" class="mode-banner mode-banner-subtle">
        {{ antiTributeRuleText }} · {{ doubleDownTributeRuleText }} · {{ returnTributeRuleText }}
      </p>
      <section v-if="isAnyBattleMode" class="series-panel" aria-label="系列赛总览">
        <div class="series-panel-head">
          <div>
            <p class="series-panel-title">系列赛总览</p>
            <p class="series-panel-subtitle">{{ currentSeriesHeadline }}</p>
          </div>
          <span class="series-phase-badge">{{ currentRoundPhaseLabel }}</span>
        </div>
        <div class="series-panel-grid">
          <article
            v-for="item in seriesPanelCards"
            :key="`${item.label}-${item.value}`"
            class="series-panel-card"
          >
            <span class="series-panel-card-label">{{ item.label }}</span>
            <strong class="series-panel-card-value">{{ item.value }}</strong>
          </article>
        </div>
        <div v-if="recentRoundHistoryEntries.length > 0" class="series-history">
          <div class="series-history-head">
            <span class="series-history-title">最近战绩轨迹</span>
            <span class="series-history-subtitle">按最近结算倒序显示</span>
          </div>
          <div class="series-history-list">
            <article
              v-for="summary in recentRoundHistoryEntries"
              :key="`round-history-${summary.roundNumber}-${summary.levelAfter}`"
              class="series-history-item"
            >
              <span class="series-history-round">第 {{ summary.roundNumber }} 局</span>
              <strong class="series-history-main">{{ describeRoundHistoryEntry(summary) }}</strong>
            </article>
          </div>
        </div>
      </section>
      <p v-if="isAnyBattleMode" class="turn-banner" :class="{ 'self-turn': isPrimarySeatTurn }">
        当前行动方：{{ currentTurnLabel }}（{{ turnHintText }}）
      </p>
      <p v-if="playerPendingTributeHint" class="turn-callout tribute-callout">
        {{ playerPendingTributeHint }}
      </p>
      <button
        v-if="isAnyBattleMode"
        type="button"
        class="strategy-toggle-btn"
        @click="toggleStrategyPanelVisibility"
      >
        策略面板：{{ showStrategyPanel ? '开' : '关' }}
      </button>
      <p v-if="isAnyBattleMode && (reviewedTimelineBroadcastText || turnBroadcastText)" class="turn-callout">
        {{ reviewedTimelineBroadcastText || turnBroadcastText }}
      </p>
      <div
        v-if="isAnyBattleMode && showStrategyPanel && displayDecisionInsight"
        class="strategy-panel"
        role="status"
        aria-live="polite"
      >
        <div class="strategy-panel-head">
          <span class="strategy-panel-title">AI 决策面板</span>
          <div class="strategy-panel-head-actions">
            <span class="strategy-panel-mode">{{ displayDecisionInsight.decisionMode }}</span>
            <button
              v-if="hasStrategyPanelDetails"
              type="button"
              class="strategy-panel-detail-btn"
              @click="toggleStrategyPanelDetails"
            >
              {{ showStrategyPanelDetails ? '收起详情' : '展开详情' }}
            </button>
          </div>
        </div>
        <p class="strategy-panel-summary">
          当前选择:
          {{ displayDecisionInsight.selectedAction === 'play' ? '出牌' : '不出' }}
          <template v-if="displayDecisionInsight.selectedSummary">
            · {{ displayDecisionInsight.selectedSummary }}
          </template>
          <template v-if="typeof displayDecisionInsight.selectedScore === 'number'">
            · 评分 {{ formatInsightScore(displayDecisionInsight.selectedScore) }}
          </template>
        </p>
        <div v-if="showStrategyPanelDetails">
          <p v-if="broadcastInsightSignalsText" class="strategy-panel-signal">{{ broadcastInsightSignalsText }}</p>
          <div v-if="broadcastInsightTopCandidates.length > 0" class="strategy-panel-candidates">
            <div class="strategy-candidates-title">候选对比 (Top {{ broadcastInsightTopCandidates.length }})</div>
            <div
              v-for="candidate in broadcastInsightTopCandidates"
              :key="`${candidate.index}-${candidate.summary}`"
              class="strategy-candidate-row"
              :class="{ selected: candidate.index === displayDecisionInsight.selectedCandidateIndex }"
            >
              <span class="strategy-candidate-main">
                #{{ candidate.index }} {{ candidate.action === 'play' ? '出牌' : '不出' }} · {{ candidate.summary }}
              </span>
              <span class="strategy-candidate-score">评分 {{ formatInsightScore(candidate.score) }}</span>
            </div>
          </div>
        </div>
      </div>
      <p v-if="isAnyBattleMode && tableCardsOwnerText" class="last-play-banner">{{ tableCardsOwnerText }}</p>
      <h2>{{ tableTitle }}</h2>
      <div v-if="displayTableCards.length === 0" class="table-placeholder">{{ tablePlaceholderText }}</div>
      <div v-else class="table-cards">
        <PokerCard v-for="card in displayTableCards" :key="card.id" :card="{ ...card, isSelected: false }" />
      </div>
      <section v-if="isAiBattleMode && battleTimelineEntries.length > 0" class="timeline-panel" aria-label="牌路回看">
        <div class="timeline-panel-head">
          <div>
            <p class="timeline-panel-title">牌路时间轴</p>
            <p class="timeline-panel-subtitle">
              已记录 {{ battleTimelineEntries.length }} 手
              <template v-if="reviewedTimelineIndex !== null">
                · 当前回看第 {{ reviewedTimelineIndex + 1 }} 手
              </template>
            </p>
          </div>
          <div class="timeline-panel-actions">
            <button
              type="button"
              class="timeline-btn"
              :disabled="aiBattleAutoplaying || !canReviewPreviousTimelineStep"
              @click="stepBattleTimelineReview(-1)"
            >
              上一步
            </button>
            <button
              type="button"
              class="timeline-btn"
              :disabled="aiBattleAutoplaying || !canReviewNextTimelineStep"
              @click="stepBattleTimelineReview(1)"
            >
              下一步
            </button>
            <button
              type="button"
              class="timeline-btn timeline-btn-strong"
              :disabled="reviewedTimelineIndex === null"
              @click="exitBattleTimelineReview"
            >
              返回实时
            </button>
          </div>
        </div>
        <div class="timeline-list">
          <button
            v-for="(entry, index) in battleTimelineEntries"
            :key="entry.id"
            type="button"
            class="timeline-entry"
            :class="{ active: reviewedTimelineIndex === index }"
            @click="onSelectBattleTimelineEntry(index)"
          >
            <span class="timeline-entry-index">#{{ index + 1 }}</span>
            <span class="timeline-entry-main">
              {{ seatLabel(entry.playerSeat) }} {{ entry.action === 'play' ? '出牌' : '不出' }}
              <template v-if="entry.action === 'play' && entry.cards.length > 0">
                · {{ entry.cards.length }} 张
              </template>
            </span>
            <span class="timeline-entry-side">
              {{ entry.decisionInsight?.selectedSummary || entry.speech || entry.reasoning }}
            </span>
          </button>
        </div>
      </section>
    </section>

    <section class="player-hand" :class="{ 'turn-active': isPrimarySeatTurn, 'last-play-active': isSelfLastPlay }">
      <div v-if="myRankText" class="rank-badge center-badge">{{ myRankText }}</div>
      <h3 class="player-hand-title">{{ primarySeatTitle }}</h3>
      <div class="action-row">
        <button
          v-if="isBattleMode && playerPendingTributeAction"
          class="action-btn tribute"
          :disabled="baseActionDisabled || submittingTribute"
          @click="onSubmitPendingTribute"
        >
          {{ playerPendingTributeButtonLabel }}
        </button>
        <button
          v-else-if="!isAiBattleMode"
          class="action-btn play"
          :disabled="isBattleMode ? battleActionDisabled : baseActionDisabled"
          @click="onPlay"
        >
          {{ playButtonLabel }}
        </button>
        <button
          v-if="isBattleMode && !playerPendingTributeAction"
          class="action-btn pass"
          :disabled="battleActionDisabled"
          @click="onPass"
        >
          {{ passButtonLabel }}
        </button>
        <button
          v-if="isAiBattleMode"
          class="action-btn autoplay"
          :disabled="aiBattleControlDisabled"
          @click="onToggleAiBattleAutoplay"
        >
          {{ aiBattleControlLabel }}
        </button>
        <button
          v-if="canUseArrangeTools"
          class="action-btn smart"
          :disabled="baseActionDisabled"
          @click="onAutoGroup"
        >
          {{ smartGrouping ? 'AI 正在思考中...' : '💡 一键智能理牌' }}
        </button>
        <button
          v-if="canUseArrangeTools"
          class="action-btn manual"
          :disabled="baseActionDisabled || !hasSelectedCards"
          @click="onExtractSelectedToNewGroup"
        >
          🗂️ 手动组牌
        </button>
        <button
          v-if="isLeastMovesMode"
          class="action-btn deal"
          :disabled="baseActionDisabled"
          @click="onFetchNewTrainingHand"
        >
          {{ refreshingHand ? '🔄 发牌中...' : '🔄 重新发牌' }}
        </button>
        <button
          v-if="canUseArrangeTools"
          class="action-btn reset"
          :disabled="baseActionDisabled"
          @click="onResetGrouping"
        >
          🌪️ 一键打散
        </button>
      </div>

      <section v-if="isAiBattleMode" class="batch-panel" aria-label="批量统计">
        <div class="batch-panel-head">
          <div>
            <p class="batch-panel-title">多局自动连打</p>
            <p class="batch-panel-subtitle">用当前四家人格配置批量跑盘，并统计胜率与名次。</p>
          </div>
          <div class="batch-panel-actions">
            <label class="batch-count-field">
              <span>局数</span>
              <input v-model.number="batchRunCount" type="number" min="1" max="100" step="1" :disabled="batchRunActive" />
            </label>
            <button class="timeline-btn timeline-btn-strong" type="button" :disabled="batchRunActive" @click="onStartBatchRun">
              连打 {{ normalizedBatchRunCount }} 局
            </button>
            <button class="timeline-btn" type="button" :disabled="!batchRunActive" @click="stopBatchRun">
              停止
            </button>
            <button class="timeline-btn" type="button" :disabled="batchRunActive" @click="refreshBattleMetricsSnapshot()">
              刷新指标
            </button>
            <button class="timeline-btn" type="button" :disabled="batchRunActive" @click="onResetBattleMetrics">
              重置指标
            </button>
          </div>
        </div>

        <p v-if="batchRunProgressText" class="batch-progress-text">{{ batchRunProgressText }}</p>

        <div v-if="batchSummaryCards" class="batch-summary-grid">
          <article class="batch-summary-card">
            <span class="batch-summary-label">本轮总局数</span>
            <strong>{{ batchSummaryCards.totalGames }}</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">Team A 胜率</span>
            <strong>{{ batchSummaryCards.teamAWinRate }}%</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">Team B 胜率</span>
            <strong>{{ batchSummaryCards.teamBWinRate }}%</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">未知结果</span>
            <strong>{{ batchSummaryCards.unknownRate }}%</strong>
          </article>
        </div>

        <div v-if="batchSummaryCards" class="batch-seat-table">
          <div class="batch-seat-table-head">
            <span>座位</span>
            <span>平均名次</span>
            <span>头游</span>
            <span>二游</span>
            <span>三游</span>
            <span>末游</span>
          </div>
          <div v-for="row in batchSeatStatRows" :key="row.seat" class="batch-seat-table-row">
            <span>{{ row.label }}</span>
            <span>{{ row.avgRank }}</span>
            <span>{{ row.firstCount }}</span>
            <span>{{ row.secondCount }}</span>
            <span>{{ row.thirdCount }}</span>
            <span>{{ row.fourthCount }}</span>
          </div>
        </div>

        <section v-if="personaPresetOptions.length >= 2" class="compare-panel" aria-label="双预设对比">
          <div class="compare-panel-head">
            <div>
              <p class="batch-panel-title">双预设 A/B 对比</p>
              <p class="batch-panel-subtitle">分别用两套预设各跑 {{ normalizedBatchRunCount }} 局，直接比较胜率和名次。</p>
            </div>
            <div class="batch-panel-actions">
              <select v-model="comparePresetAId" :disabled="compareRunActive || batchRunActive">
                <option v-for="preset in personaPresetOptions" :key="`compare-a-${preset.id}`" :value="preset.id">
                  A: {{ preset.name }}
                </option>
              </select>
              <select v-model="comparePresetBId" :disabled="compareRunActive || batchRunActive">
                <option v-for="preset in personaPresetOptions" :key="`compare-b-${preset.id}`" :value="preset.id">
                  B: {{ preset.name }}
                </option>
              </select>
              <button class="timeline-btn timeline-btn-strong" type="button" :disabled="compareRunActive || batchRunActive" @click="onStartPresetCompare">
                开始 A/B 对比
              </button>
              <button class="timeline-btn" type="button" :disabled="!compareRunActive" @click="stopCompareRun">
                停止对比
              </button>
            </div>
          </div>

          <p v-if="compareRunProgressText" class="batch-progress-text">{{ compareRunProgressText }}</p>

          <div v-if="compareSummaryCards" class="compare-summary-grid">
            <article class="compare-summary-card">
              <span class="batch-summary-label">{{ comparePresetALabel }}</span>
              <strong>{{ compareSummaryCards.presetA.teamAWinRate }}%</strong>
              <small>Team A 胜率 · 平均一号位名次 {{ compareSummaryCards.presetA.avgSeat0Rank }}</small>
            </article>
            <article class="compare-summary-card">
              <span class="batch-summary-label">{{ comparePresetBLabel }}</span>
              <strong>{{ compareSummaryCards.presetB.teamAWinRate }}%</strong>
              <small>Team A 胜率 · 平均一号位名次 {{ compareSummaryCards.presetB.avgSeat0Rank }}</small>
            </article>
          </div>

          <div v-if="compareSummaryCards" class="batch-seat-table">
            <div class="compare-seat-table-head">
              <span>座位</span>
              <span>{{ comparePresetALabel }} 平均名次</span>
              <span>{{ comparePresetBLabel }} 平均名次</span>
              <span>{{ comparePresetALabel }} 头游</span>
              <span>{{ comparePresetBLabel }} 头游</span>
            </div>
            <div v-for="row in compareSeatStatRows" :key="`compare-${row.seat}`" class="compare-seat-table-row">
              <span>{{ row.label }}</span>
              <span>{{ row.avgRankA }}</span>
              <span>{{ row.avgRankB }}</span>
              <span>{{ row.firstA }}</span>
              <span>{{ row.firstB }}</span>
            </div>
          </div>
        </section>

        <div v-if="metricsCards" class="metrics-summary-grid">
          <article class="batch-summary-card">
            <span class="batch-summary-label">后端累计对局</span>
            <strong>{{ metricsCards.totalFinished }}</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">累计 Team A 胜率</span>
            <strong>{{ metricsCards.teamAWinRate }}%</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">累计 Team B 胜率</span>
            <strong>{{ metricsCards.teamBWinRate }}%</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">平均 AI 延迟</span>
            <strong>{{ metricsCards.avgLatencyMs }}ms</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">Fallback 比例</span>
            <strong>{{ metricsCards.fallbackRate }}%</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">超时比例</span>
            <strong>{{ metricsCards.timeoutRate }}%</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">LLM 成功率</span>
            <strong>{{ metricsCards.llmSuccessRate }}%</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">解析失败比例</span>
            <strong>{{ metricsCards.parseErrorRate }}%</strong>
          </article>
          <article class="batch-summary-card">
            <span class="batch-summary-label">非法动作比例</span>
            <strong>{{ metricsCards.illegalOutputRate }}%</strong>
          </article>
        </div>

        <div v-if="metricsCards" class="batch-seat-table">
          <div class="batch-seat-table-head">
            <span>指标</span>
            <span>次数</span>
            <span>说明</span>
            <span>指标</span>
            <span>次数</span>
            <span>说明</span>
          </div>
          <div class="batch-seat-table-row">
            <span>超时</span>
            <span>{{ metricsCards.timeoutErrors }}</span>
            <span>模型没在超时前返回</span>
            <span>解析失败</span>
            <span>{{ metricsCards.parseErrors }}</span>
            <span>返回 JSON/字段不合规</span>
          </div>
          <div class="batch-seat-table-row">
            <span>非法动作</span>
            <span>{{ metricsCards.illegalOutputs }}</span>
            <span>返回动作不符合规则</span>
            <span>Fallback</span>
            <span>{{ metricsCards.fallbacks }}</span>
            <span>总降级次数</span>
          </div>
        </div>
      </section>

      <p v-if="isAnyBattleMode && battleStatusHintText" class="turn-waiting">{{ battleStatusHintText }}</p>
      <div
        v-if="isAiBattleMode && showBattleSpeechBubble && isRivalBubbleVisible(0)"
        class="player-seat-thought"
        :class="{ 'is-thinking': isRivalBubbleThinking(0), 'is-fading': isRivalBubbleFading(0) }"
      >
        {{ getRivalBubbleText(0) }}
      </div>
      <div v-if="isAnyBattleMode && lastErrorMessage" class="last-error-banner" role="status" aria-live="polite">
        <span>最近错误：{{ lastErrorMessage }}</span>
        <button class="last-error-close" type="button" @click="clearLastError">清除</button>
      </div>

      <div class="hint-row">
        <span v-if="!isAiBattleMode">当前分组：{{ renderCardGroups.length }}</span>
        <span v-if="!isAiBattleMode">已选中：{{ visibleSelectedCount }}</span>
        <span v-if="isAiBattleMode">主视角：{{ seatLabel(0) }}</span>
        <span v-if="isAnyBattleMode">当前行动方：{{ currentTurnLabel }}</span>
      </div>
      <div v-if="canUseArrangeTools && currentAutoGrouping" class="grouping-insight">
        <span class="grouping-insight-title">
          当前方案：{{ currentAutoGrouping.strategyName }}
          ({{ (currentGroupingIndex % (cachedAutoGroupings?.length || 1)) + 1 }}/{{ cachedAutoGroupings?.length || 1 }})
        </span>
        <span class="grouping-insight-score">评分：{{ currentAutoGrouping.score }}</span>
        <span v-if="currentAutoGrouping.scoreBreakdown" class="grouping-insight-breakdown">
          组合收益：{{ currentAutoGrouping.scoreBreakdown.patternContribution }} ·
          手数惩罚：{{ currentAutoGrouping.scoreBreakdown.handCountPenalty }} ·
          态势修正：{{ currentAutoGrouping.scoreBreakdown.contextAdjustment }}
        </span>
        <span v-if="currentAutoGroupingReasons.length > 0" class="grouping-insight-reasons">
          策略依据：{{ currentAutoGroupingReasons.join('、') }}
        </span>
      </div>

      <div ref="groupRowRef" class="group-row">
        <div
          v-for="group in renderCardGroups"
          :key="group.groupId"
          class="group-shell"
          :data-group-id="group.groupId"
          :class="{
            'group-shell-error': isLeastMovesMode && group.groupId === invalidGroupId,
            'group-shell-manual-highlight': group.groupId === highlightedManualGroupId,
          }"
        >
          <CardGroup :group="group" @card-move="handleCardMove" @card-toggle="handleCardToggle" />
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.game-table {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 180px;
  grid-template-rows: 90px 1fr auto;
  gap: 14px;
  padding: 18px;
  background:
    radial-gradient(circle at 25% 18%, rgba(255, 255, 255, 0.18), transparent 32%),
    radial-gradient(circle at 82% 12%, rgba(255, 255, 255, 0.16), transparent 30%),
    linear-gradient(144deg, #11673f 0%, #0d4d34 52%, #0a3f2b 100%);
}

.top-actions {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 30;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.recent-battle-wrap {
  position: relative;
}

.recent-battle-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(420px, calc(100vw - 32px));
  max-height: min(70vh, 560px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(216, 242, 226, 0.26);
  background:
    linear-gradient(180deg, rgba(8, 46, 31, 0.96), rgba(5, 30, 20, 0.94));
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
}

.recent-battle-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #f2fff6;
}

.recent-battle-panel-subtitle {
  margin: 8px 0 0;
  color: rgba(220, 244, 229, 0.78);
  font-size: 12px;
  line-height: 1.5;
}

.recent-battle-toolbar {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.recent-battle-search {
  width: 100%;
  border: 1px solid rgba(216, 242, 226, 0.24);
  border-radius: 10px;
  padding: 9px 11px;
  background: rgba(8, 43, 29, 0.72);
  color: #effff4;
  font-size: 13px;
}

.recent-battle-search::placeholder {
  color: rgba(220, 244, 229, 0.52);
}

.recent-battle-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(236, 252, 242, 0.88);
  font-size: 12px;
  font-weight: 700;
}

.recent-battle-empty {
  margin-top: 12px;
  padding: 14px;
  border-radius: 12px;
  border: 1px dashed rgba(214, 241, 224, 0.24);
  color: rgba(226, 246, 233, 0.82);
  background: rgba(9, 43, 29, 0.42);
  font-size: 13px;
}

.recent-battle-list {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.recent-battle-item {
  width: 100%;
  border: 1px solid rgba(212, 239, 222, 0.2);
  border-radius: 14px;
  padding: 12px;
  background: rgba(10, 53, 35, 0.58);
  color: #effff4;
  text-align: left;
  display: grid;
  gap: 6px;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.recent-battle-item:hover {
  transform: translateY(-1px);
  border-color: rgba(168, 231, 199, 0.46);
  background: rgba(13, 64, 43, 0.72);
}

.recent-battle-item-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  font-weight: 800;
  color: #f6fff9;
  overflow-wrap: anywhere;
}

.recent-battle-item-meta {
  font-size: 12px;
  line-height: 1.45;
  color: rgba(220, 244, 229, 0.82);
}

.recent-battle-item-cta {
  margin-top: 2px;
  color: #ffe89f;
  font-size: 12px;
  font-weight: 800;
}

.recent-battle-item-actions {
  margin-top: 4px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.recent-battle-badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(240, 192, 62, 0.18);
  border: 1px solid rgba(244, 216, 110, 0.5);
  color: #ffefbf;
  font-size: 11px;
  font-weight: 800;
}

.speed-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 8px;
  border-radius: 12px;
  border: 1px solid rgba(214, 242, 224, 0.24);
  background: rgba(6, 39, 26, 0.52);
}

.speed-toolbar-label {
  color: #e8fff0;
  font-size: 12px;
  font-weight: 700;
}

.speed-pill {
  border: 1px solid rgba(226, 247, 234, 0.22);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(10, 58, 37, 0.62);
  color: #ecfff2;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    background-color 0.16s ease,
    border-color 0.16s ease;
}

.speed-pill:hover {
  transform: translateY(-1px);
  background: rgba(16, 74, 49, 0.72);
}

.speed-pill.active {
  border-color: rgba(246, 220, 108, 0.7);
  background: rgba(90, 75, 18, 0.72);
  color: #ffefbe;
}

.back-home-btn {
  border: 1px solid rgba(242, 255, 245, 0.42);
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 700;
  color: #effff1;
  background: rgba(8, 48, 32, 0.55);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background-color 0.18s ease;
}

.new-hand-btn {
  border: 1px solid rgba(207, 237, 255, 0.46);
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 700;
  color: #e7f5ff;
  background: rgba(23, 73, 109, 0.6);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background-color 0.18s ease;
}

.new-hand-btn:hover {
  transform: translateY(-1px);
  background: rgba(35, 103, 152, 0.78);
}

.new-hand-btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
  transform: none;
}

.back-home-btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
  transform: none;
}

.back-home-btn:hover {
  transform: translateY(-1px);
  background: rgba(13, 74, 48, 0.72);
}

.settlement-modal {
  width: 90%;
  max-width: 520px;
  background:
    radial-gradient(circle at top right, rgba(29, 114, 86, 0.4), transparent 45%),
    #114b30;
  border-radius: 18px;
  padding: 30px;
  border: 2px solid rgba(235, 255, 239, 0.3);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  color: #effff1;
}

.settlement-title {
  margin: 0 0 24px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
}

.battle-results {
  margin: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settlement-summary {
  margin-top: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(214, 245, 223, 0.2);
  background: rgba(6, 35, 23, 0.38);
  color: rgba(236, 255, 242, 0.9);
  font-size: 14px;
  line-height: 1.5;
}

.settlement-summary p {
  margin: 0;
}

.settlement-summary p + p {
  margin-top: 6px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.result-item.highlight {
  background: rgba(236, 191, 72, 0.15);
  border-color: rgba(236, 191, 72, 0.5);
}

.result-name {
  font-weight: 700;
  font-size: 16px;
}

.result-rank {
  font-size: 18px;
}

.rival {
  position: relative;
  overflow: visible;
  z-index: 2;
  border-radius: 14px;
  padding: 12px;
  background: rgba(6, 41, 27, 0.64);
  border: 1px solid rgba(243, 253, 244, 0.2);
  color: #effff1;
}

.rival h3 {
  margin: 0 0 6px;
  font-size: 16px;
}

.rival p {
  margin: 0;
  font-size: 13px;
}

.reasoning-bubble {
  position: absolute;
  top: 50%;
  --bubble-base-shift: -50%;
  min-width: 136px;
  max-width: 200px;
  width: max-content;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(236, 245, 255, 0.28);
  background: rgba(0, 0, 0, 0.62);
  color: #f2f8ff;
  font-size: 12px;
  line-height: 1.4;
  letter-spacing: 0.2px;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: normal;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
  z-index: 18;
  pointer-events: none;
  animation: rival-bubble-float 2.6s ease-in-out infinite;
  transform: translateY(var(--bubble-base-shift));
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}

.reasoning-bubble::after {
  content: '';
  position: absolute;
}

.rival-top .reasoning-bubble {
  top: calc(100% + 10px);
  left: 16px;
  --bubble-base-shift: 0px;
}

.rival-top .reasoning-bubble::after {
  top: -8px;
  left: 20px;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 8px solid rgba(0, 0, 0, 0.62);
}

.rival-left .reasoning-bubble {
  left: calc(100% + 16px);
}

.rival-left .reasoning-bubble::after {
  top: calc(50% - 7px);
  left: -8px;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-right: 8px solid rgba(0, 0, 0, 0.62);
}

.rival-right .reasoning-bubble {
  right: calc(100% + 16px);
}

.rival-right .reasoning-bubble::after {
  top: calc(50% - 7px);
  right: -8px;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 8px solid rgba(0, 0, 0, 0.62);
}

.reasoning-bubble.is-thinking {
  border-color: rgba(214, 235, 255, 0.42);
  background: rgba(12, 24, 38, 0.7);
}

.reasoning-bubble.is-fading {
  opacity: 0;
}

.rival.turn-active {
  border-color: rgba(129, 228, 186, 0.9);
  box-shadow:
    0 0 0 2px rgba(129, 228, 186, 0.32),
    0 0 24px rgba(63, 168, 123, 0.4);
}

.rival.last-play-active {
  border-color: rgba(255, 212, 99, 0.9);
  box-shadow:
    0 0 0 2px rgba(255, 212, 99, 0.3),
    0 0 20px rgba(255, 194, 66, 0.28);
}

.rival.turn-active.last-play-active {
  box-shadow:
    0 0 0 2px rgba(129, 228, 186, 0.32),
    0 0 0 5px rgba(255, 212, 99, 0.24),
    0 0 26px rgba(97, 193, 148, 0.42);
}

.rival-top {
  grid-column: 2;
}

.rival-left {
  grid-column: 1;
  grid-row: 2;
}

.rival-right {
  grid-column: 3;
  grid-row: 2;
}

.rank-badge {
  display: inline-flex;
  margin: 6px 0;
  padding: 5px 12px;
  border-radius: 8px;
  background: rgba(255, 194, 66, 0.22);
  border: 1px solid rgba(255, 194, 66, 0.6);
  color: #fff2cf;
  font-weight: 700;
  font-size: 14px;
  box-shadow: 0 0 10px rgba(255, 194, 66, 0.15);
  animation: rank-badge-shine 2s infinite ease-in-out;
}

@keyframes rank-badge-shine {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.2); }
}

.center-badge {
  display: flex;
  margin: 0 auto 10px;
  width: fit-content;
}

.table-center {
  grid-column: 2;
  grid-row: 2;
  min-width: 0;
  border-radius: 16px;
  padding: 18px;
  background: rgba(8, 54, 34, 0.6);
  border: 1px solid rgba(239, 255, 242, 0.17);
  color: #f4fff6;
}

.table-center h2 {
  margin: 0 0 12px;
  font-size: 20px;
}

.level-badge {
  display: inline-flex;
  margin: 0 0 10px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 241, 195, 0.68);
  background: rgba(240, 191, 59, 0.18);
  color: #fff5ce;
  font-size: 13px;
  font-weight: 700;
}

.turn-banner {
  margin: 0 0 12px;
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(216, 234, 255, 0.6);
  background: rgba(70, 124, 186, 0.22);
  color: #e7f2ff;
  font-size: 13px;
  font-weight: 700;
}

.turn-banner.self-turn {
  border-color: rgba(137, 235, 193, 0.7);
  background: rgba(29, 125, 77, 0.32);
  color: #d9fbe8;
}

.strategy-toggle-btn {
  margin: 0 0 10px;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(186, 233, 255, 0.62);
  border-radius: 999px;
  padding: 5px 12px;
  background: rgba(24, 82, 120, 0.3);
  color: #dff3ff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.strategy-toggle-btn:hover {
  background: rgba(35, 101, 146, 0.42);
}

.turn-callout {
  margin: 0 0 10px;
  display: inline-flex;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 233, 170, 0.72);
  background: rgba(222, 181, 57, 0.24);
  color: #fff7d9;
  font-size: 13px;
  font-weight: 700;
}

.tribute-callout {
  border-color: rgba(160, 228, 195, 0.76);
  background: rgba(46, 144, 104, 0.24);
  color: #dfffee;
}

.strategy-panel {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(196, 232, 255, 0.5);
  background: rgba(15, 62, 93, 0.34);
  color: #e6f5ff;
  font-size: 12px;
}

.strategy-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.strategy-panel-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.strategy-panel-title {
  font-weight: 700;
  color: #f2fbff;
}

.strategy-panel-mode {
  text-transform: uppercase;
  border-radius: 999px;
  padding: 2px 8px;
  border: 1px solid rgba(208, 238, 255, 0.46);
  background: rgba(89, 145, 193, 0.26);
  color: #dbf2ff;
  font-size: 11px;
  font-weight: 700;
}

.strategy-panel-detail-btn {
  border: 1px solid rgba(206, 234, 252, 0.42);
  border-radius: 999px;
  padding: 2px 8px;
  color: #dff4ff;
  background: rgba(14, 55, 79, 0.48);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.strategy-panel-detail-btn:hover {
  background: rgba(20, 72, 101, 0.72);
}

.strategy-panel-summary,
.strategy-panel-signal {
  margin: 7px 0 0;
  line-height: 1.4;
}

.strategy-panel-signal {
  color: #c7ecff;
}

.strategy-panel-candidates {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.strategy-candidates-title {
  color: #d9f1ff;
  font-weight: 700;
}

.strategy-candidate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(185, 226, 255, 0.26);
  background: rgba(4, 30, 48, 0.26);
}

.strategy-candidate-row.selected {
  border-color: rgba(255, 228, 126, 0.8);
  background: rgba(92, 72, 10, 0.24);
}

.strategy-candidate-main {
  flex: 1;
  min-width: 0;
}

.strategy-candidate-score {
  color: #ffe59c;
  font-weight: 700;
  white-space: nowrap;
}

.last-play-banner {
  margin: 0 0 12px;
  display: inline-flex;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 212, 99, 0.8);
  background: rgba(255, 181, 43, 0.2);
  color: #ffefb9;
  font-size: 13px;
  font-weight: 700;
}

.mode-banner {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(239, 255, 242, 0.28);
  background: rgba(239, 255, 241, 0.08);
  color: #f0fff2;
  font-size: 14px;
  line-height: 1.4;
}

.mode-banner-subtle {
  margin-top: -4px;
  background: rgba(239, 255, 241, 0.04);
  color: rgba(235, 255, 241, 0.84);
}

.series-panel {
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(229, 255, 238, 0.18);
  background:
    linear-gradient(160deg, rgba(10, 53, 35, 0.74) 0%, rgba(6, 31, 21, 0.78) 100%),
    radial-gradient(circle at 88% 10%, rgba(239, 255, 241, 0.08), transparent 30%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.series-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.series-panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #f4fff7;
}

.series-panel-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(219, 246, 229, 0.84);
}

.series-phase-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(246, 220, 108, 0.34);
  background: rgba(82, 68, 18, 0.42);
  color: #ffefbf;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.series-panel-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.series-panel-card {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(214, 241, 224, 0.14);
  background: rgba(255, 255, 255, 0.05);
  display: grid;
  gap: 4px;
}

.series-panel-card-label {
  font-size: 11px;
  font-weight: 700;
  color: rgba(220, 246, 229, 0.72);
}

.series-panel-card-value {
  font-size: 14px;
  line-height: 1.35;
  color: #f2fff6;
}

.series-history {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(214, 241, 224, 0.12);
}

.series-history-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.series-history-title {
  font-size: 13px;
  font-weight: 800;
  color: #f0fff4;
}

.series-history-subtitle {
  font-size: 11px;
  color: rgba(220, 246, 229, 0.7);
}

.series-history-list {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.series-history-item {
  min-width: 220px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(214, 241, 224, 0.12);
  background: rgba(255, 255, 255, 0.04);
  display: grid;
  gap: 5px;
}

.series-history-round {
  font-size: 11px;
  font-weight: 800;
  color: #ffe59c;
}

.series-history-main {
  font-size: 13px;
  line-height: 1.4;
  color: #f4fff7;
}

.table-placeholder {
  min-height: 180px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px dashed rgba(238, 255, 240, 0.42);
  background: rgba(255, 255, 255, 0.07);
  color: rgba(243, 255, 245, 0.8);
}

.table-cards {
  min-height: 180px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.timeline-panel {
  margin-top: 14px;
  min-width: 0;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(208, 235, 220, 0.22);
  background: rgba(5, 31, 21, 0.46);
}

.timeline-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.timeline-panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #f1fff6;
}

.timeline-panel-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(220, 246, 229, 0.82);
}

.timeline-panel-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.timeline-btn {
  border: 1px solid rgba(220, 247, 231, 0.24);
  border-radius: 999px;
  padding: 5px 10px;
  background: rgba(10, 59, 39, 0.56);
  color: #eafdf0;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.timeline-btn:hover:enabled {
  background: rgba(16, 78, 52, 0.7);
}

.timeline-btn:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.timeline-btn-strong {
  border-color: rgba(246, 220, 108, 0.54);
  color: #ffefbf;
  background: rgba(82, 68, 18, 0.56);
}

.timeline-list {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  max-width: 100%;
  overflow-x: auto;
  padding-bottom: 4px;
}

.timeline-entry {
  min-width: 220px;
  max-width: 260px;
  border: 1px solid rgba(214, 241, 224, 0.2);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(7, 39, 27, 0.58);
  color: #ecfff2;
  text-align: left;
  display: grid;
  gap: 4px;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.timeline-entry:hover {
  transform: translateY(-1px);
  border-color: rgba(166, 230, 197, 0.44);
  background: rgba(10, 52, 35, 0.72);
}

.timeline-entry.active {
  border-color: rgba(245, 219, 118, 0.62);
  background: rgba(84, 70, 18, 0.62);
}

.timeline-entry-index {
  font-size: 11px;
  font-weight: 800;
  color: #ffe89f;
}

.timeline-entry-main {
  font-size: 13px;
  font-weight: 700;
  color: #f4fff7;
}

.timeline-entry-side {
  font-size: 12px;
  line-height: 1.45;
  color: rgba(222, 247, 230, 0.84);
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.player-hand {
  grid-column: 1 / 4;
  grid-row: 3;
  min-width: 0;
  border-radius: 16px;
  padding: 14px;
  background: rgba(4, 25, 16, 0.76);
  border: 1px solid rgba(236, 255, 239, 0.22);
}

.player-hand.turn-active {
  border-color: rgba(129, 228, 186, 0.86);
  box-shadow:
    0 0 0 2px rgba(129, 228, 186, 0.28),
    inset 0 0 0 1px rgba(129, 228, 186, 0.25);
}

.player-hand.last-play-active {
  box-shadow:
    0 0 0 2px rgba(255, 212, 99, 0.25),
    inset 0 0 0 1px rgba(255, 212, 99, 0.2);
}

.player-hand.turn-active.last-play-active {
  box-shadow:
    0 0 0 2px rgba(129, 228, 186, 0.28),
    0 0 0 5px rgba(255, 212, 99, 0.2),
    inset 0 0 0 1px rgba(129, 228, 186, 0.25);
}

.action-row {
  display: flex;
  gap: 10px;
}

.action-btn {
  border: none;
  border-radius: 10px;
  padding: 10px 18px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease;
}

.action-btn:hover {
  transform: translateY(-1px);
}

.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  transform: none;
}

.action-btn.play {
  background: #f5cf52;
  color: #19150b;
}

.action-btn.pass {
  background: #d8e1ec;
  color: #23344a;
}

.action-btn.tribute {
  background: #f0b86d;
  color: #2f1c07;
}

.action-btn.smart {
  background: #9ce6c4;
  color: #0e3c28;
}

.action-btn.manual {
  background: #88c7df;
  color: #0f3547;
}

.action-btn.deal {
  background: #8bc4f2;
  color: #143249;
}

.action-btn.reset {
  background: #9fd0f7;
  color: #163752;
}

.action-btn.autoplay {
  background: #8fe0b5;
  color: #103926;
}

.player-hand-title {
  margin: 0 0 12px;
  color: #f3fff5;
  font-size: 18px;
  font-weight: 700;
}

.batch-panel {
  margin-top: 14px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(212, 238, 222, 0.2);
  background: rgba(7, 34, 24, 0.48);
}

.batch-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.batch-panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #f1fff5;
}

.batch-panel-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(220, 246, 229, 0.8);
}

.batch-panel-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.batch-panel-actions select {
  min-width: 160px;
  border-radius: 999px;
  border: 1px solid rgba(214, 241, 224, 0.22);
  padding: 6px 10px;
  background: rgba(10, 58, 37, 0.58);
  color: #ecfff2;
  font-size: 12px;
}

.batch-count-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(214, 241, 224, 0.22);
  background: rgba(10, 58, 37, 0.52);
  color: #ecfff2;
  font-size: 12px;
  font-weight: 700;
}

.batch-count-field input {
  width: 72px;
  border: none;
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(4, 28, 19, 0.82);
  color: #f3fff5;
  font-size: 12px;
}

.batch-progress-text {
  margin: 10px 0 0;
  color: #ffe59c;
  font-size: 12px;
  font-weight: 700;
}

.batch-summary-grid,
.metrics-summary-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.batch-summary-card {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(213, 240, 223, 0.16);
  background: rgba(10, 46, 32, 0.58);
  display: grid;
  gap: 4px;
}

.batch-summary-card strong {
  color: #fff1b7;
  font-size: 18px;
  font-weight: 800;
}

.batch-summary-label {
  color: rgba(224, 248, 232, 0.82);
  font-size: 12px;
}

.batch-seat-table {
  margin-top: 12px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(214, 241, 224, 0.18);
}

.batch-seat-table-head,
.batch-seat-table-row {
  display: grid;
  grid-template-columns: 1.2fr repeat(5, 1fr);
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  align-items: center;
}

.batch-seat-table-head {
  background: rgba(12, 60, 40, 0.66);
  color: #f3fff6;
  font-weight: 800;
}

.batch-seat-table-row {
  background: rgba(7, 35, 24, 0.5);
  color: rgba(228, 249, 235, 0.88);
  border-top: 1px solid rgba(214, 241, 224, 0.1);
}

.compare-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed rgba(214, 241, 224, 0.18);
}

.compare-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.compare-summary-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.compare-summary-card {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(214, 241, 224, 0.18);
  background: rgba(9, 42, 29, 0.58);
  display: grid;
  gap: 4px;
}

.compare-summary-card strong {
  color: #fff1b7;
  font-size: 20px;
  font-weight: 800;
}

.compare-summary-card small {
  color: rgba(222, 248, 231, 0.8);
  font-size: 12px;
}

.compare-seat-table-head,
.compare-seat-table-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1fr 1fr;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  align-items: center;
}

.compare-seat-table-head {
  background: rgba(17, 68, 46, 0.68);
  color: #f3fff6;
  font-weight: 800;
}

.compare-seat-table-row {
  background: rgba(7, 35, 24, 0.5);
  color: rgba(228, 249, 235, 0.88);
  border-top: 1px solid rgba(214, 241, 224, 0.1);
}

.hint-row {
  margin-top: 10px;
  display: flex;
  gap: 16px;
  color: #e7fbe9;
  font-size: 13px;
}

.grouping-insight {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(193, 231, 206, 0.45);
  background: rgba(17, 76, 52, 0.32);
  color: #dff9e8;
  font-size: 12px;
}

.grouping-insight-title {
  font-weight: 700;
  color: #f8fff9;
}

.grouping-insight-score {
  color: #ffe38e;
  font-weight: 700;
}

.grouping-insight-breakdown {
  color: rgba(220, 247, 231, 0.92);
}

.grouping-insight-reasons {
  color: #b8f2d2;
}

.turn-waiting {
  margin: 10px 0 0;
  color: #f9e6a1;
  font-size: 13px;
  font-weight: 700;
}

.player-seat-thought {
  margin-top: 10px;
  width: fit-content;
  max-width: min(420px, 100%);
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(214, 235, 255, 0.34);
  background: rgba(5, 20, 16, 0.52);
  color: #eef9ff;
  font-size: 12px;
  line-height: 1.45;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}

.player-seat-thought.is-thinking {
  border-color: rgba(214, 235, 255, 0.42);
  background: rgba(12, 24, 38, 0.7);
}

.player-seat-thought.is-fading {
  opacity: 0;
}

.last-error-banner {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 156, 138, 0.72);
  background: rgba(156, 44, 34, 0.38);
  color: #ffe4dd;
  font-size: 13px;
  font-weight: 700;
}

.last-error-banner span {
  flex: 1;
  min-width: 0;
}

.last-error-close {
  border: 1px solid rgba(255, 208, 198, 0.56);
  border-radius: 8px;
  padding: 4px 8px;
  color: #fff2ee;
  background: rgba(79, 26, 20, 0.56);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.last-error-close:hover {
  background: rgba(102, 34, 26, 0.66);
}

.group-row {
  margin-top: 12px;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  align-items: stretch;
  padding-bottom: 8px;
}

.group-shell {
  border-radius: 14px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.group-shell-manual-highlight {
  box-shadow:
    0 0 0 2px rgba(255, 228, 121, 0.94),
    0 0 18px rgba(255, 196, 72, 0.36);
  animation: manual-group-pop 0.42s ease-out;
}

.group-shell-error {
  box-shadow:
    0 0 0 2px rgba(255, 104, 90, 0.94),
    0 0 16px rgba(235, 86, 72, 0.44);
  animation: group-error-pulse 0.6s ease-in-out infinite alternate;
}

@keyframes manual-group-pop {
  from {
    transform: translateY(-4px) scale(1.02);
  }
  to {
    transform: translateY(0) scale(1);
  }
}

@keyframes group-error-pulse {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-2px);
  }
}

@keyframes rival-bubble-float {
  0% {
    transform: translateY(var(--bubble-base-shift));
  }
  50% {
    transform: translateY(calc(var(--bubble-base-shift) - 2px));
  }
  100% {
    transform: translateY(var(--bubble-base-shift));
  }
}

.settlement-overlay {
  position: fixed;
  inset: 0;
  z-index: 45;
  padding: 20px;
  display: grid;
  place-items: center;
  background: rgba(5, 18, 12, 0.62);
}

.settlement-modal {
  width: min(560px, 100%);
  padding: 24px 22px;
  border-radius: 16px;
  text-align: center;
  background:
    radial-gradient(circle at 80% 12%, rgba(255, 255, 255, 0.2), transparent 36%),
    linear-gradient(150deg, #0f6640 0%, #0a432d 100%);
  border: 1px solid rgba(246, 255, 248, 0.28);
  box-shadow: 0 22px 42px rgba(0, 0, 0, 0.38);
}

.settlement-title {
  margin: 0;
  font-size: clamp(22px, 2.4vw, 30px);
  line-height: 1.4;
  color: #f4fff6;
}

.settlement-btn {
  margin-top: 18px;
  border: none;
  border-radius: 10px;
  padding: 10px 18px;
  font-size: 15px;
  font-weight: 700;
  color: #183a27;
  background: #f4d86e;
  cursor: pointer;
}

.settlement-btn:hover {
  transform: translateY(-1px);
}

.settlement-actions {
  margin-top: 18px;
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.settlement-actions .settlement-btn {
  margin-top: 0;
}

.settlement-new-hand-btn {
  color: #113148;
  background: #8ecaf7;
}

.toast {
  position: fixed;
  left: 50%;
  top: 24px;
  transform: translateX(-50%);
  z-index: 40;
  padding: 10px 16px;
  border-radius: 10px;
  color: #fff;
  font-size: 13px;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.23);
}

.toast.info {
  background: #3a587d;
}

.toast.success {
  background: #1d7c4b;
}

.toast.error {
  background: #b43b2f;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.rival-bubble-fade-enter-active,
.rival-bubble-fade-leave-active {
  transition: opacity 0.2s ease;
}

.rival-bubble-fade-enter-from,
.rival-bubble-fade-leave-to {
  opacity: 0;
}

.game-table.solo-mode {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr auto;
}

.game-table.solo-mode .table-center {
  grid-column: 1;
  grid-row: 1;
}

.game-table.solo-mode .player-hand {
  grid-column: 1;
  grid-row: 2;
}

@media (max-width: 980px) {
  .game-table {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(5, auto);
  }

  .rival-top,
  .rival-left,
  .rival-right,
  .table-center,
  .player-hand {
    grid-column: 1;
  }

  .rival-top {
    grid-row: 1;
  }

  .rival-left {
    grid-row: 2;
  }

  .rival-right {
    grid-row: 3;
  }

  .table-center {
    grid-row: 4;
  }

  .player-hand {
    grid-row: 5;
  }

  .reasoning-bubble,
  .rival-left .reasoning-bubble,
  .rival-right .reasoning-bubble,
  .rival-top .reasoning-bubble {
    position: relative;
    top: auto;
    left: auto;
    right: auto;
    transform: none;
    margin-top: 10px;
    max-width: 100%;
    animation: none;
  }

  .reasoning-bubble::after,
  .rival-left .reasoning-bubble::after,
  .rival-right .reasoning-bubble::after,
  .rival-top .reasoning-bubble::after {
    left: 16px;
    right: auto;
    top: -8px;
    border-top: none;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-bottom: 8px solid rgba(0, 0, 0, 0.62);
  }

  .timeline-panel-head {
    flex-direction: column;
    align-items: stretch;
  }

  .timeline-panel-actions {
    width: 100%;
  }

  .batch-panel-head {
    flex-direction: column;
    align-items: stretch;
  }

  .compare-panel-head {
    flex-direction: column;
    align-items: stretch;
  }

  .batch-panel-actions {
    justify-content: flex-start;
  }

  .batch-seat-table {
    overflow-x: auto;
  }

  .batch-seat-table-head,
  .batch-seat-table-row {
    min-width: 520px;
  }

  .compare-seat-table-head,
  .compare-seat-table-row {
    min-width: 540px;
  }
}
</style>
