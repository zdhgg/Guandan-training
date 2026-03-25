import { dealCards, generateDeck, RuntimeCard, CardRank, CardSuit } from '../core/cardEngine';
import { canBeat, identifyPattern } from '../core/ruleValidator';
import { ActionType } from '@prisma/client';
import { askLLMForNextPlay, buildAISpeech, calculateBattleNextPlay, LLM_BATTLE_TIMEOUT_MS } from './aiService';
import type { AIDecisionInsight, AIPlayerPersonality, LastPlayInput, LLMRequestConfig } from './aiService';
import { recordBattleOutcomeMetric } from './aiMetricsService';
import { prisma } from './gameService';

export type BattleMode = 'human_vs_ai' | 'ai_vs_ai';
export type BattleRoundPhase = 'playing' | 'finished' | 'awaiting_tribute' | 'awaiting_return';
export type ReturnTributeRule = 'any_lower' | 'lowest_only';

export interface TributePairSummary {
  order: number;
  giverSeat: number;
  receiverSeat: number;
  phase: 'planned' | 'awaiting_tribute' | 'awaiting_return' | 'completed' | 'skipped_anti_tribute';
  tributeCard?: RuntimeCard;
  antiTributeApplied?: boolean;
  antiTributeReason?: string;
}

export interface BattleRoundSummary {
  roundNumber: number;
  finishedSeats: number[];
  winnerTeam: 'teamA' | 'teamB' | 'unknown';
  levelBefore: string;
  levelAfter: string;
  upgradeSteps: number;
  resultLabel: string;
  tributeRequired: boolean;
  tributeGiverSeat?: number;
  tributeReceiverSeat?: number;
  antiTributeApplied?: boolean;
  antiTributeReason?: string;
  tributePairs?: TributePairSummary[];
}

export interface TributeExchangeState extends TributePairSummary {}

export interface PendingTributeState {
  exchangeIndex: number;
  totalExchanges: number;
  phase: 'awaiting_tribute' | 'awaiting_return';
  giverSeat: number;
  receiverSeat: number;
  tributeCard?: RuntimeCard;
}

export interface BattlePendingTributeView extends PendingTributeState {
  requiredAction?: 'give' | 'return';
}

export interface ActivePlayerState {
  id: string;
  seat: number;
  handCards: RuntimeCard[];
  isAI: boolean;
  lastThought: string;
  rank?: number; // 1: 头游, 2: 二游, 3: 三游, 4: 末游
}

export interface LastPlayRecord {
  playerId: string;
  playerSeat: number;
  cards: RuntimeCard[];
  reasoning: string;
  speech?: string;
}
export interface BattleTurnBroadcastEvent {
  playerId: string;
  playerSeat: number;
  action: 'play' | 'pass';
  cards: RuntimeCard[];
  reasoning: string;
  speech?: string;
  decisionInsight?: AIDecisionInsight;
}

export interface ActiveMatch {
  matchId: string;
  battleMode: BattleMode;
  roundNumber: number;
  roundPhase: BattleRoundPhase;
  antiTributeEnabled: boolean;
  doubleDownTributeEnabled: boolean;
  returnTributeRule: ReturnTributeRule;
  currentLevel: string;
  players: ActivePlayerState[];
  currentTurn: number;
  lastPlay: LastPlayRecord | null;
  passCount: number;
  finishedSeats: number[]; // 按出线顺序记录的玩家座位号
  lastRoundSummary: BattleRoundSummary | null;
  roundHistory: BattleRoundSummary[];
  tributeQueue: TributeExchangeState[];
  pendingTribute: PendingTributeState | null;
}

export interface BattleOpponentView {
  playerId: string;
  seat: number;
  cardsLeft: number;
  lastThought: string;
  rank?: number;
}

export interface BattleViewState {
  matchId: string;
  playerId: string;
  battleMode: BattleMode;
  roundNumber: number;
  roundPhase: BattleRoundPhase;
  antiTributeEnabled: boolean;
  doubleDownTributeEnabled: boolean;
  returnTributeRule: ReturnTributeRule;
  currentLevel: string;
  currentTurn: number;
  passCount: number;
  handCards: RuntimeCard[];
  opponents: BattleOpponentView[];
  lastPlay: LastPlayRecord | null;
  finishedSeats: number[];
  rank?: number;
  lastRoundSummary: BattleRoundSummary | null;
  roundHistory: BattleRoundSummary[];
  tributeQueue: TributePairSummary[];
  pendingTribute: BattlePendingTributeView | null;
}

export interface BattleTimelineViewEntry {
  id: string;
  stepNumber: number;
  playerId: string;
  playerSeat: number;
  source: 'player' | 'ai';
  action: 'play' | 'pass';
  cards: RuntimeCard[];
  reasoning: string;
  speech?: string;
  decisionInsight?: AIDecisionInsight;
  state: BattleViewState;
}

export interface BattleSessionSummary {
  matchId: string;
  battleMode: BattleMode;
  roundNumber: number;
  roundPhase: BattleRoundPhase;
  antiTributeEnabled: boolean;
  doubleDownTributeEnabled: boolean;
  returnTributeRule: ReturnTributeRule;
  currentLevel: string;
  currentTurn: number;
  stepCount: number;
  finishedSeats: number[];
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  lastRoundSummary: BattleRoundSummary | null;
  lastAction?: {
    playerId: string;
    playerSeat: number;
    action: 'play' | 'pass';
    stepNumber: number;
  };
}
export interface SubmitPlayOutcome {
  match: ActiveMatch;
  turnEvents: BattleTurnBroadcastEvent[];
}

export interface StartBattleOptions {
  battleMode?: BattleMode;
  antiTributeEnabled?: boolean;
  doubleDownTributeEnabled?: boolean;
  returnTributeRule?: ReturnTributeRule;
}

export interface BattlePlayProgressHooks {
  onPlayerActionApplied?: (payload: {
    action: 'play' | 'pass';
    cards: RuntimeCard[];
    match: ActiveMatch;
  }) => void | Promise<void>;
  onAiTurnStart?: (payload: {
    playerId: string;
    playerSeat: number;
    match: ActiveMatch;
  }) => void | Promise<void>;
  onAiTurnEvent?: (payload: {
    event: BattleTurnBroadcastEvent;
    match: ActiveMatch;
  }) => void | Promise<void>;
}

const ACTIVE_MATCHES = new Map<string, ActiveMatch>();
const TOTAL_SEATS = 4;
const DEFAULT_LEVEL = '2';
const DEFAULT_ANTI_TRIBUTE_ENABLED = true;
const DEFAULT_DOUBLE_DOWN_TRIBUTE_ENABLED = true;
const DEFAULT_RETURN_TRIBUTE_RULE: ReturnTributeRule = 'any_lower';
const LEVEL_SEQUENCE = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
let TEST_NEXT_ROUND_HANDS: RuntimeCard[][] | null = null;

function nextSeat(seat: number): number {
  return (seat + 1) % TOTAL_SEATS;
}

/**
 * 获取下一个还未出线的有效座号
 */
function getNextActiveSeat(currentSeat: number, finishedSeats: number[]): number {
  const finishedSet = new Set(finishedSeats);
  let next = nextSeat(currentSeat);
  while (finishedSet.has(next)) {
    next = nextSeat(next);
  }
  return next;
}

function createMatchId(): string {
  return `battle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloneCards(cards: RuntimeCard[]): RuntimeCard[] {
  return cards.map((card) => ({ ...card }));
}

const CARD_LOGIC_RANK_ORDER: Record<CardRank, number> = {
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
  JOKER: 14
};

const CARD_LOGIC_SUIT_BONUS: Record<CardSuit, number> = {
  hearts: 4,
  diamonds: 3,
  clubs: 2,
  spades: 1,
  joker: 0
};

function normalizeRuntimeCardForLevel(card: RuntimeCard, currentLevel: string): RuntimeCard {
  if (card.rank === 'JOKER' || card.suit === 'joker') {
    return {
      ...card,
      suit: 'joker',
      rank: 'JOKER',
      logicValue: card.logicValue > 165 ? 170 : 160,
      isWildcard: false
    };
  }

  const baseValue = card.rank === currentLevel ? 15 : CARD_LOGIC_RANK_ORDER[card.rank];
  return {
    ...card,
    logicValue: baseValue * 10 + CARD_LOGIC_SUIT_BONUS[card.suit],
    isWildcard: card.suit === 'hearts' && card.rank === currentLevel
  };
}

function normalizeCardCollectionForLevel(cards: RuntimeCard[], currentLevel: string): RuntimeCard[] {
  return cards.map((card) => normalizeRuntimeCardForLevel(card, currentLevel));
}

function normalizeSummaryCardsForLevel(summary: BattleRoundSummary | null, currentLevel: string): void {
  if (!summary?.tributePairs) {
    return;
  }

  for (const pair of summary.tributePairs) {
    if (pair.tributeCard) {
      pair.tributeCard = normalizeRuntimeCardForLevel(pair.tributeCard, currentLevel);
    }
  }
}

function cloneRoundSummary(summary: BattleRoundSummary | null): BattleRoundSummary | null {
  if (!summary) {
    return null;
  }

  return {
    ...summary,
    finishedSeats: [...summary.finishedSeats],
    tributePairs: summary.tributePairs ? cloneTributePairs(summary.tributePairs) : undefined
  };
}

function cloneRoundHistory(history: BattleRoundSummary[]): BattleRoundSummary[] {
  return history.map((item) => ({
    ...item,
    finishedSeats: [...item.finishedSeats]
  }));
}

function cloneTributePairs(pairs: TributePairSummary[]): TributePairSummary[] {
  return pairs.map((pair) => ({
    ...pair,
    tributeCard: pair.tributeCard ? { ...pair.tributeCard } : undefined
  }));
}

function clonePendingTribute(tribute: PendingTributeState | null): PendingTributeState | null {
  if (!tribute) {
    return null;
  }

  return {
    ...tribute,
    tributeCard: tribute.tributeCard ? { ...tribute.tributeCard } : undefined
  };
}

function cloneTributeQueue(queue: TributeExchangeState[]): TributeExchangeState[] {
  return queue.map((item) => ({
    ...item,
    tributeCard: item.tributeCard ? { ...item.tributeCard } : undefined
  }));
}

function cloneMatch(match: ActiveMatch): ActiveMatch {
  return {
    ...match,
    players: match.players.map((player) => ({
      ...player,
      handCards: cloneCards(player.handCards)
    })),
    lastPlay: match.lastPlay
      ? {
        ...match.lastPlay,
        cards: cloneCards(match.lastPlay.cards)
      }
      : null,
    finishedSeats: [...match.finishedSeats],
    lastRoundSummary: cloneRoundSummary(match.lastRoundSummary),
    roundHistory: cloneRoundHistory(match.roundHistory),
    tributeQueue: cloneTributeQueue(match.tributeQueue),
    pendingTribute: clonePendingTribute(match.pendingTribute)
  };
}

function cloneTurnEvents(events: BattleTurnBroadcastEvent[]): BattleTurnBroadcastEvent[] {
  return events.map((event) => ({
    ...event,
    cards: cloneCards(event.cards),
    decisionInsight: event.decisionInsight
      ? {
        ...event.decisionInsight,
        tacticalSignals: event.decisionInsight.tacticalSignals
          ? { ...event.decisionInsight.tacticalSignals }
          : undefined,
        topCandidates: event.decisionInsight.topCandidates?.map((candidate) => ({
          ...candidate,
          cardIds: [...candidate.cardIds],
          tacticHints: candidate.tacticHints ? [...candidate.tacticHints] : undefined
        }))
      }
      : undefined
  }));
}

function findCurrentTurnPlayer(match: ActiveMatch): ActivePlayerState {
  const currentPlayer = match.players.find((player) => player.seat === match.currentTurn);
  if (!currentPlayer) {
    throw new Error('当前轮次玩家不存在');
  }
  return currentPlayer;
}

function deserializeActiveMatch(raw: string): ActiveMatch | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveMatch> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.matchId !== 'string' || !Array.isArray(parsed.players)) {
      return null;
    }

    const players = parsed.players.reduce<ActivePlayerState[]>((acc, item) => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.seat !== 'number' || !Array.isArray(item.handCards)) {
        return acc;
      }

      acc.push({
        id: item.id,
        seat: item.seat,
        handCards: cloneCards(item.handCards as RuntimeCard[]),
        isAI: Boolean(item.isAI),
        lastThought: typeof item.lastThought === 'string' ? item.lastThought : '',
        rank: typeof item.rank === 'number' ? item.rank : undefined
      });
      return acc;
    }, []);

    if (players.length !== TOTAL_SEATS) {
      return null;
    }

    return {
      matchId: parsed.matchId,
      battleMode: parsed.battleMode === 'ai_vs_ai' ? 'ai_vs_ai' : 'human_vs_ai',
      roundNumber: typeof parsed.roundNumber === 'number' && parsed.roundNumber > 0 ? parsed.roundNumber : 1,
      roundPhase:
        parsed.roundPhase === 'finished' || parsed.roundPhase === 'awaiting_tribute' || parsed.roundPhase === 'awaiting_return'
          ? parsed.roundPhase
          : 'playing',
      antiTributeEnabled: typeof parsed.antiTributeEnabled === 'boolean' ? parsed.antiTributeEnabled : DEFAULT_ANTI_TRIBUTE_ENABLED,
      doubleDownTributeEnabled:
        typeof parsed.doubleDownTributeEnabled === 'boolean'
          ? parsed.doubleDownTributeEnabled
          : DEFAULT_DOUBLE_DOWN_TRIBUTE_ENABLED,
      returnTributeRule:
        parsed.returnTributeRule === 'lowest_only' || parsed.returnTributeRule === 'any_lower'
          ? parsed.returnTributeRule
          : DEFAULT_RETURN_TRIBUTE_RULE,
      currentLevel: typeof parsed.currentLevel === 'string' ? parsed.currentLevel : DEFAULT_LEVEL,
      players,
      currentTurn: typeof parsed.currentTurn === 'number' ? parsed.currentTurn : 0,
      lastPlay:
        parsed.lastPlay &&
        typeof parsed.lastPlay === 'object' &&
        typeof parsed.lastPlay.playerId === 'string' &&
        typeof parsed.lastPlay.playerSeat === 'number' &&
        Array.isArray(parsed.lastPlay.cards)
          ? {
            playerId: parsed.lastPlay.playerId,
            playerSeat: parsed.lastPlay.playerSeat,
            cards: cloneCards(parsed.lastPlay.cards as RuntimeCard[]),
            reasoning: typeof parsed.lastPlay.reasoning === 'string' ? parsed.lastPlay.reasoning : '',
            speech: typeof parsed.lastPlay.speech === 'string' ? parsed.lastPlay.speech : undefined
          }
          : null,
      passCount: typeof parsed.passCount === 'number' ? parsed.passCount : 0,
      finishedSeats: Array.isArray(parsed.finishedSeats)
        ? parsed.finishedSeats.filter((seat): seat is number => typeof seat === 'number')
        : [],
      lastRoundSummary:
        parsed.lastRoundSummary &&
        typeof parsed.lastRoundSummary === 'object' &&
        typeof parsed.lastRoundSummary.levelBefore === 'string' &&
        typeof parsed.lastRoundSummary.levelAfter === 'string'
          ? {
            winnerTeam:
              parsed.lastRoundSummary.winnerTeam === 'teamA' || parsed.lastRoundSummary.winnerTeam === 'teamB'
                ? parsed.lastRoundSummary.winnerTeam
                : 'unknown',
            levelBefore: parsed.lastRoundSummary.levelBefore,
            levelAfter: parsed.lastRoundSummary.levelAfter,
            upgradeSteps: typeof parsed.lastRoundSummary.upgradeSteps === 'number' ? parsed.lastRoundSummary.upgradeSteps : 0,
            resultLabel: typeof parsed.lastRoundSummary.resultLabel === 'string' ? parsed.lastRoundSummary.resultLabel : '',
            tributeRequired: Boolean(parsed.lastRoundSummary.tributeRequired),
            tributeGiverSeat:
              typeof parsed.lastRoundSummary.tributeGiverSeat === 'number'
                ? parsed.lastRoundSummary.tributeGiverSeat
                : undefined,
            tributeReceiverSeat:
              typeof parsed.lastRoundSummary.tributeReceiverSeat === 'number'
                ? parsed.lastRoundSummary.tributeReceiverSeat
                : undefined,
            antiTributeApplied: parsed.lastRoundSummary.antiTributeApplied === true,
            antiTributeReason:
              typeof parsed.lastRoundSummary.antiTributeReason === 'string'
                ? parsed.lastRoundSummary.antiTributeReason
                : undefined,
            tributePairs: Array.isArray(parsed.lastRoundSummary.tributePairs)
              ? parsed.lastRoundSummary.tributePairs.reduce<TributePairSummary[]>((pairAcc, pair) => {
                if (!pair || typeof pair !== 'object' || typeof pair.giverSeat !== 'number' || typeof pair.receiverSeat !== 'number') {
                  return pairAcc;
                }
                pairAcc.push({
                  order: typeof pair.order === 'number' ? pair.order : pairAcc.length + 1,
                  giverSeat: pair.giverSeat,
                  receiverSeat: pair.receiverSeat,
                  phase:
                    pair.phase === 'awaiting_tribute' ||
                    pair.phase === 'awaiting_return' ||
                    pair.phase === 'completed' ||
                    pair.phase === 'skipped_anti_tribute'
                      ? pair.phase
                      : 'planned',
                  tributeCard:
                    pair.tributeCard && typeof pair.tributeCard === 'object' && typeof pair.tributeCard.id === 'string'
                      ? { ...(pair.tributeCard as RuntimeCard) }
                      : undefined,
                  antiTributeApplied: pair.antiTributeApplied === true,
                  antiTributeReason: typeof pair.antiTributeReason === 'string' ? pair.antiTributeReason : undefined
                });
                return pairAcc;
              }, [])
              : undefined,
            roundNumber: typeof parsed.lastRoundSummary.roundNumber === 'number' ? parsed.lastRoundSummary.roundNumber : 1,
            finishedSeats: Array.isArray(parsed.lastRoundSummary.finishedSeats)
              ? parsed.lastRoundSummary.finishedSeats.filter((seat): seat is number => typeof seat === 'number')
              : []
          }
          : null,
      roundHistory: Array.isArray(parsed.roundHistory)
        ? parsed.roundHistory.reduce<BattleRoundSummary[]>((acc, item) => {
          if (
            !item ||
            typeof item !== 'object' ||
            typeof item.levelBefore !== 'string' ||
            typeof item.levelAfter !== 'string'
          ) {
            return acc;
          }

          acc.push({
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
            roundNumber: typeof item.roundNumber === 'number' ? item.roundNumber : acc.length + 1,
            finishedSeats: Array.isArray(item.finishedSeats)
              ? item.finishedSeats.filter((seat): seat is number => typeof seat === 'number')
              : []
          });
          return acc;
        }, [])
        : [],
      tributeQueue: Array.isArray(parsed.tributeQueue)
        ? parsed.tributeQueue.reduce<TributeExchangeState[]>((acc, item) => {
          if (!item || typeof item !== 'object' || typeof item.giverSeat !== 'number' || typeof item.receiverSeat !== 'number') {
            return acc;
          }
          acc.push({
            order: typeof item.order === 'number' ? item.order : acc.length + 1,
            giverSeat: item.giverSeat,
            receiverSeat: item.receiverSeat,
            phase:
              item.phase === 'awaiting_tribute' ||
              item.phase === 'awaiting_return' ||
              item.phase === 'completed' ||
              item.phase === 'skipped_anti_tribute'
                ? item.phase
                : 'planned',
            tributeCard:
              item.tributeCard && typeof item.tributeCard === 'object' && typeof item.tributeCard.id === 'string'
                ? { ...(item.tributeCard as RuntimeCard) }
                : undefined,
            antiTributeApplied: item.antiTributeApplied === true,
            antiTributeReason: typeof item.antiTributeReason === 'string' ? item.antiTributeReason : undefined
          });
          return acc;
        }, [])
        : [],
      pendingTribute:
        parsed.pendingTribute &&
        typeof parsed.pendingTribute === 'object' &&
        (parsed.pendingTribute.phase === 'awaiting_tribute' || parsed.pendingTribute.phase === 'awaiting_return') &&
        typeof parsed.pendingTribute.giverSeat === 'number' &&
        typeof parsed.pendingTribute.receiverSeat === 'number'
          ? {
            exchangeIndex:
              typeof parsed.pendingTribute.exchangeIndex === 'number' ? parsed.pendingTribute.exchangeIndex : 0,
            totalExchanges:
              typeof parsed.pendingTribute.totalExchanges === 'number' ? parsed.pendingTribute.totalExchanges : 1,
            phase: parsed.pendingTribute.phase,
            giverSeat: parsed.pendingTribute.giverSeat,
            receiverSeat: parsed.pendingTribute.receiverSeat,
            tributeCard:
              parsed.pendingTribute.tributeCard &&
              typeof parsed.pendingTribute.tributeCard === 'object' &&
              typeof parsed.pendingTribute.tributeCard.id === 'string'
                ? { ...(parsed.pendingTribute.tributeCard as RuntimeCard) }
                : undefined
          }
          : null
    };
  } catch {
    return null;
  }
}

function parseDecisionInsight(raw: string | null | undefined): AIDecisionInsight | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as AIDecisionInsight | null;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function persistableBattleMode(match: ActiveMatch): string {
  return match.battleMode;
}

function getInMemoryMatch(matchId: string): ActiveMatch | null {
  const match = ACTIVE_MATCHES.get(matchId);
  if (!match) {
    return null;
  }
  normalizeMatchPlayers(match);
  return match;
}

async function restorePersistedMatch(matchId: string): Promise<ActiveMatch | null> {
  const persisted = await prisma.battleMatchRecord.findUnique({
    where: { id: matchId },
    select: { currentState: true }
  });

  if (!persisted) {
    return null;
  }

  const restored = deserializeActiveMatch(persisted.currentState);
  if (!restored) {
    await prisma.battleMatchRecord.delete({ where: { id: matchId } }).catch(() => undefined);
    return null;
  }

  normalizeMatchPlayers(restored);
  ACTIVE_MATCHES.set(matchId, restored);
  return restored;
}

async function findMatchOrThrow(matchId: string): Promise<ActiveMatch> {
  const inMemory = getInMemoryMatch(matchId);
  if (inMemory) {
    return inMemory;
  }

  const restored = await restorePersistedMatch(matchId);
  if (restored) {
    return restored;
  }

  throw new Error('对局不存在或已结束');
}

async function persistBattleMatchSnapshot(match: ActiveMatch): Promise<void> {
  const snapshot = JSON.stringify(cloneMatch(match));
  await prisma.battleMatchRecord.upsert({
    where: { id: match.matchId },
    create: {
      id: match.matchId,
      battleMode: persistableBattleMode(match),
      currentState: snapshot,
      endedAt: null
    },
    update: {
      battleMode: persistableBattleMode(match),
      currentState: snapshot,
      endedAt: null
    }
  });
}

async function appendBattleTimelineRecord(
  match: ActiveMatch,
  source: 'player' | 'ai',
  event: BattleTurnBroadcastEvent
): Promise<void> {
  const matchSnapshot = JSON.stringify(cloneMatch(match));

  await prisma.$transaction(async (tx) => {
    const persistedMatch = await tx.battleMatchRecord.upsert({
      where: { id: match.matchId },
      create: {
        id: match.matchId,
        battleMode: persistableBattleMode(match),
        currentState: matchSnapshot,
        stepCount: 1,
        endedAt: null
      },
      update: {
        battleMode: persistableBattleMode(match),
        currentState: matchSnapshot,
        stepCount: {
          increment: 1
        },
        endedAt: null
      }
    });

    await tx.battleTimelineRecord.create({
      data: {
        matchId: match.matchId,
        stepNumber: persistedMatch.stepCount,
        playerId: event.playerId,
        playerSeat: event.playerSeat,
        source,
        actionType: event.action === 'play' ? ActionType.PLAY : ActionType.PASS,
        cards: JSON.stringify(cloneCards(event.cards)),
        reasoning: event.reasoning.trim(),
        speech: event.speech?.trim() || null,
        decisionInsight: event.decisionInsight ? JSON.stringify(event.decisionInsight) : null,
        stateSnapshot: matchSnapshot
      }
    });
  });
}

function normalizeMatchPlayers(match: ActiveMatch): void {
  for (const player of match.players) {
    const shouldBeAi = match.battleMode === 'ai_vs_ai' ? true : player.seat !== 0;
    player.isAI = shouldBeAi;
    player.handCards = normalizeCardCollectionForLevel(player.handCards, match.currentLevel);
  }

  if (match.lastPlay) {
    match.lastPlay.cards = normalizeCardCollectionForLevel(match.lastPlay.cards, match.currentLevel);
  }

  if (match.pendingTribute?.tributeCard) {
    match.pendingTribute.tributeCard = normalizeRuntimeCardForLevel(match.pendingTribute.tributeCard, match.currentLevel);
  }

  for (const exchange of match.tributeQueue) {
    if (exchange.tributeCard) {
      exchange.tributeCard = normalizeRuntimeCardForLevel(exchange.tributeCard, match.currentLevel);
    }
  }

  normalizeSummaryCardsForLevel(match.lastRoundSummary, match.currentLevel);
  for (const summary of match.roundHistory) {
    normalizeSummaryCardsForLevel(summary, match.currentLevel);
  }
}

function findPlayerOrThrow(match: ActiveMatch, playerId: string): ActivePlayerState {
  const player = match.players.find((item) => item.id === playerId);
  if (!player) {
    throw new Error('玩家不存在');
  }
  return player;
}

function getSeatRankMap(finishedSeats: number[]): Record<number, number> {
  const rankMap: Record<number, number> = {};
  finishedSeats.forEach((seat, index) => {
    rankMap[seat] = index + 1;
  });

  if (finishedSeats.length === TOTAL_SEATS - 1) {
    const fourthSeat = [0, 1, 2, 3].find((seat) => !finishedSeats.includes(seat));
    if (typeof fourthSeat === 'number') {
      rankMap[fourthSeat] = 4;
    }
  }

  return rankMap;
}

function getLevelIndex(level: string): number {
  const index = LEVEL_SEQUENCE.indexOf(level as (typeof LEVEL_SEQUENCE)[number]);
  return index >= 0 ? index : 0;
}

function advanceLevel(level: string, steps: number): string {
  const nextIndex = Math.min(LEVEL_SEQUENCE.length - 1, getLevelIndex(level) + Math.max(0, steps));
  return LEVEL_SEQUENCE[nextIndex];
}

function getHighestCards(cards: RuntimeCard[]): RuntimeCard[] {
  if (cards.length === 0) {
    return [];
  }

  const maxLogicValue = Math.max(...cards.map((card) => card.logicValue));
  return cards.filter((card) => card.logicValue === maxLogicValue);
}

function pickHighestCard(cards: RuntimeCard[]): RuntimeCard {
  const highest = [...cards].sort((left, right) => right.logicValue - left.logicValue || left.id.localeCompare(right.id))[0];
  if (!highest) {
    throw new Error('当前没有可用于进贡的手牌');
  }
  return { ...highest };
}

function pickLowestCard(cards: RuntimeCard[]): RuntimeCard {
  const lowest = [...cards].sort((left, right) => left.logicValue - right.logicValue || left.id.localeCompare(right.id))[0];
  if (!lowest) {
    throw new Error('当前没有可用于还贡的手牌');
  }
  return { ...lowest };
}

function getAllowedReturnCards(cards: RuntimeCard[], tributeCard: RuntimeCard | undefined, rule: ReturnTributeRule): RuntimeCard[] {
  const pool = [...cards]
    .filter((card) => !tributeCard || card.id !== tributeCard.id)
    .sort((left, right) => left.logicValue - right.logicValue || left.id.localeCompare(right.id));

  if (pool.length === 0) {
    return [];
  }

  if (rule === 'lowest_only') {
    const minValue = pool[0]!.logicValue;
    return pool.filter((card) => card.logicValue === minValue);
  }

  const lowerCards = tributeCard ? pool.filter((card) => card.logicValue < tributeCard.logicValue) : pool;
  return lowerCards.length > 0 ? lowerCards : [pool[0]!];
}

function pickReturnCardByRule(cards: RuntimeCard[], tributeCard: RuntimeCard | undefined, rule: ReturnTributeRule): RuntimeCard {
  const allowed = getAllowedReturnCards(cards, tributeCard, rule);
  const selected = allowed[0] ?? pickLowestCard(cards);
  return { ...selected };
}

function hasDoubleBigJokers(cards: RuntimeCard[]): boolean {
  return cards.filter((card) => card.rank === 'JOKER' && card.logicValue > 165).length >= 2;
}

function assignFourthRankIfNeeded(match: ActiveMatch): void {
  if (match.finishedSeats.length !== TOTAL_SEATS - 1) {
    return;
  }

  const fourthSeat = [0, 1, 2, 3].find((seat) => !match.finishedSeats.includes(seat));
  if (typeof fourthSeat !== 'number') {
    return;
  }

  const fourthPlayer = match.players.find((player) => player.seat === fourthSeat);
  if (fourthPlayer && !fourthPlayer.rank) {
    fourthPlayer.rank = 4;
  }
}

function buildRoundSummary(match: ActiveMatch): BattleRoundSummary {
  const winnerTeam = resolveWinnerTeam(match);
  const rankMap = getSeatRankMap(match.finishedSeats);
  const headSeat = match.finishedSeats[0];
  const secondSeat = Object.entries(rankMap).find(([, rank]) => rank === 2)?.[0];
  const thirdSeat = Object.entries(rankMap).find(([, rank]) => rank === 3)?.[0];
  const fourthSeat = Object.entries(rankMap).find(([, rank]) => rank === 4)?.[0];
  const teammateSeat = typeof headSeat === 'number' ? (headSeat + 2) % TOTAL_SEATS : undefined;
  const teammateRank = typeof teammateSeat === 'number' ? rankMap[teammateSeat] ?? 4 : 4;
  const upgradeSteps = teammateRank === 2 ? 3 : teammateRank === 3 ? 2 : 1;
  const resultLabel =
    teammateRank === 2 ? '头游 + 二游（双上）' : teammateRank === 3 ? '头游 + 三游' : '头游 + 末游';
  const levelAfter = advanceLevel(match.currentLevel, upgradeSteps);
  const tributePairs: TributePairSummary[] = [];

  if (typeof headSeat === 'number' && fourthSeat !== undefined) {
    tributePairs.push({
      order: 1,
      giverSeat: Number(fourthSeat),
      receiverSeat: headSeat,
      phase: 'planned'
    });
  }

  const topTwoSameTeam =
    typeof headSeat === 'number' &&
    secondSeat !== undefined &&
    ((Number(secondSeat) + 2) % TOTAL_SEATS === headSeat || (headSeat + 2) % TOTAL_SEATS === Number(secondSeat));
  const bottomTwoSameTeam =
    thirdSeat !== undefined &&
    fourthSeat !== undefined &&
    ((Number(thirdSeat) + 2) % TOTAL_SEATS === Number(fourthSeat) || (Number(fourthSeat) + 2) % TOTAL_SEATS === Number(thirdSeat));

  if (
    match.doubleDownTributeEnabled &&
    topTwoSameTeam &&
    bottomTwoSameTeam &&
    secondSeat !== undefined &&
    thirdSeat !== undefined
  ) {
    tributePairs.length = 0;
    tributePairs.push({
      order: 1,
      giverSeat: Number(fourthSeat),
      receiverSeat: headSeat,
      phase: 'planned'
    });
    tributePairs.push({
      order: 2,
      giverSeat: Number(thirdSeat),
      receiverSeat: Number(secondSeat),
      phase: 'planned'
    });
  }

  return {
    roundNumber: match.roundNumber,
    finishedSeats: [...match.finishedSeats],
    winnerTeam,
    levelBefore: match.currentLevel,
    levelAfter,
    upgradeSteps,
    resultLabel,
    tributeRequired: tributePairs.length > 0,
    tributeGiverSeat: tributePairs[0]?.giverSeat,
    tributeReceiverSeat: typeof headSeat === 'number' ? headSeat : undefined
    ,
    tributePairs
  };
}

function resolveRoundOpeningSeat(match: ActiveMatch): number {
  const headSeat = match.lastRoundSummary?.finishedSeats?.[0];
  const openingTribute =
    typeof headSeat === 'number'
      ? match.tributeQueue.find((exchange) => exchange.receiverSeat === headSeat)
      : match.tributeQueue[0];

  if (!openingTribute) {
    return typeof headSeat === 'number' ? headSeat : 0;
  }

  if (openingTribute.phase === 'skipped_anti_tribute') {
    return typeof headSeat === 'number' ? headSeat : 0;
  }

  return openingTribute.giverSeat;
}

function resetPlayersForNextRound(match: ActiveMatch, dealtCards: RuntimeCard[][]): void {
  match.players.forEach((player, index) => {
    player.handCards = cloneCards(dealtCards[index] ?? []);
    player.lastThought = '';
    player.rank = undefined;
  });
}

function moveCardBetweenPlayers(fromPlayer: ActivePlayerState, toPlayer: ActivePlayerState, cardId: string): RuntimeCard {
  const cardIndex = fromPlayer.handCards.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) {
    throw new Error('指定的牌不存在于当前玩家手牌中');
  }

  const [movedCard] = fromPlayer.handCards.splice(cardIndex, 1);
  if (!movedCard) {
    throw new Error('移动卡牌失败');
  }
  toPlayer.handCards.push(movedCard);
  return { ...movedCard };
}

function beginRound(match: ActiveMatch): void {
  match.roundPhase = 'playing';
  match.currentTurn = 0;
  match.lastPlay = null;
  match.passCount = 0;
  match.finishedSeats = [];
  match.tributeQueue = [];
  match.pendingTribute = null;
}

function finalizeRound(match: ActiveMatch): void {
  assignFourthRankIfNeeded(match);
  match.roundPhase = 'finished';
  match.currentTurn = 0;
  match.passCount = 0;
  match.pendingTribute = null;
  const roundSummary = buildRoundSummary(match);
  match.lastRoundSummary = roundSummary;
  match.roundHistory = [...match.roundHistory, cloneRoundSummary(roundSummary)!].slice(-24);
}

function assertPlayingRound(match: ActiveMatch): void {
  if (match.roundPhase === 'awaiting_tribute' || match.roundPhase === 'awaiting_return') {
    throw new Error('当前需要先完成进贡/还贡');
  }
  if (match.roundPhase === 'finished') {
    throw new Error('本局已结束，请先进入下一局');
  }
}

function assertCardsOwnedByPlayer(player: ActivePlayerState, cards: RuntimeCard[]): void {
  const selectedIds = cards.map((card) => card.id);
  const uniqueIds = new Set(selectedIds);

  if (uniqueIds.size !== selectedIds.length) {
    throw new Error('出牌包含重复牌ID');
  }

  const handIds = new Set(player.handCards.map((card) => card.id));
  if (!selectedIds.every((id) => handIds.has(id))) {
    throw new Error('出牌不在当前玩家手牌中');
  }
}

function removePlayedCardsFromHand(player: ActivePlayerState, cards: RuntimeCard[]): void {
  const removeIds = new Set(cards.map((card) => card.id));
  player.handCards = player.handCards.filter((card) => !removeIds.has(card.id));
}

function isGameOver(match: ActiveMatch): boolean {
  return match.finishedSeats.length >= TOTAL_SEATS - 1;
}

function resolveWinnerTeam(match: ActiveMatch): 'teamA' | 'teamB' | 'unknown' {
  const finished = match.finishedSeats;
  if (finished.includes(0) && finished.includes(2)) {
    return 'teamA';
  }
  if (finished.includes(1) && finished.includes(3)) {
    return 'teamB';
  }

  if (finished.length >= 2) {
    const topTwo = finished.slice(0, 2);
    if (topTwo.every((seat) => seat === 0 || seat === 2)) {
      return 'teamA';
    }
    if (topTwo.every((seat) => seat === 1 || seat === 3)) {
      return 'teamB';
    }
  }

  return 'unknown';
}

function resolveDecisionMode(llmConfig?: LLMRequestConfig): 'candidate' | 'legacy' {
  return llmConfig?.decisionMode === 'legacy' ? 'legacy' : 'candidate';
}

/**
 * 记录玩家出线并返回其名次
 */
function markPlayerFinished(match: ActiveMatch, player: ActivePlayerState): void {
  if (player.rank) return;
  match.finishedSeats.push(player.seat);
  player.rank = match.finishedSeats.length;
}

function executePlay(match: ActiveMatch, player: ActivePlayerState, cards: RuntimeCard[], reasoning: string, speech?: string): void {
  assertPlayingRound(match);
  assertCardsOwnedByPlayer(player, cards);

  const attemptPattern = identifyPattern(cards);
  if (!attemptPattern.isValid) {
    throw new Error('出牌牌型不合法');
  }

  const lastPlayCards = match.lastPlay?.cards ?? [];
  if (lastPlayCards.length > 0 && !canBeat(cards, lastPlayCards)) {
    throw new Error('出牌未压过当前桌面牌');
  }

  removePlayedCardsFromHand(player, cards);

  if (player.handCards.length === 0) {
    markPlayerFinished(match, player);
  }

  match.lastPlay = {
    playerId: player.id,
    playerSeat: player.seat,
    cards: cloneCards(cards),
    reasoning: reasoning.trim(),
    speech: speech?.trim() || undefined
  };
  player.lastThought = speech?.trim() || reasoning.trim();
  match.passCount = 0;

  if (isGameOver(match)) {
    finalizeRound(match);
    return;
  }

  // 跳过已经出线的玩家
  match.currentTurn = getNextActiveSeat(player.seat, match.finishedSeats);
}

function executePass(match: ActiveMatch, player: ActivePlayerState, allowOnLead: boolean, reasoning: string, speech?: string): void {
  assertPlayingRound(match);
  player.lastThought = speech?.trim() || reasoning.trim();
  if (!match.lastPlay) {
    if (!allowOnLead) {
      throw new Error('当前为新一轮首出，不能选择Pass');
    }

    match.currentTurn = getNextActiveSeat(player.seat, match.finishedSeats);
    return;
  }

  match.passCount += 1;

  // 剩余还在场上的活跃人数（不计入已出线的）
  const activeCount = TOTAL_SEATS - match.finishedSeats.length;
  // 达到“一圈无人接牌”所需的 Pass 数量为活跃人数 - 1
  const requiredPasses = Math.max(1, activeCount - 1);

  if (match.passCount >= requiredPasses) {
    const lastPlaySeat = match.lastPlay.playerSeat;
    const lastPlayer = match.players.find(p => p.seat === lastPlaySeat);

    match.lastPlay = null;
    match.passCount = 0;

    // 接风逻辑：如果上一手牌的出牌人已经出线了，由其队友接风首出
    if (lastPlayer && lastPlayer.rank) {
      const teammateSeat = (lastPlaySeat + 2) % 4;
      const teammate = match.players.find(p => p.seat === teammateSeat);

      if (teammate && !teammate.rank) {
        // 队友未出线，直接接风
        match.currentTurn = teammateSeat;
      } else {
        // 队友也出线了，则从队友位置开始找下一个活跃玩家（通常是对手）
        match.currentTurn = getNextActiveSeat(teammateSeat, match.finishedSeats);
      }
    } else {
      // 正常情况：出牌人还在场，由其首出
      match.currentTurn = lastPlaySeat;
    }
    return;
  }

  match.currentTurn = getNextActiveSeat(player.seat, match.finishedSeats);
}

import type { BattleContext } from './aiService';

function toLastPlayInput(match: ActiveMatch): LastPlayInput {
  return match.lastPlay
    ? {
      playerId: match.lastPlay.playerId,
      playerSeat: match.lastPlay.playerSeat,
      cards: match.lastPlay.cards
    }
    : null;
}

function resolveAiPersonality(seat: number, llmConfig?: LLMRequestConfig): AIPlayerPersonality {
  const configured = llmConfig?.seatPersonalities?.[seat];
  if (configured) {
    return configured;
  }

  switch (seat) {
    case 1:
      return 'aggressive';
    case 2:
      return 'balanced';
    case 3:
      return 'conservative';
    default:
      return 'balanced';
  }
}

async function autoAdvanceAiTurns(match: ActiveMatch, llmConfig?: LLMRequestConfig): Promise<BattleTurnBroadcastEvent[]> {
  return autoAdvanceAiTurnsWithHooks(match, llmConfig);
}

function recordBattleOutcomeIfFinished(match: ActiveMatch, llmConfig?: LLMRequestConfig): void {
  if (match.roundPhase !== 'finished') {
    return;
  }

  recordBattleOutcomeMetric({
    matchId: match.matchId,
    winnerTeam: resolveWinnerTeam(match),
    model: llmConfig?.model?.trim() || process.env.LLM_MODEL?.trim() || 'unknown',
    decisionMode: resolveDecisionMode(llmConfig)
  });
}

async function autoAdvanceRoundStartIfNeeded(match: ActiveMatch, llmConfig?: LLMRequestConfig): Promise<void> {
  if (match.roundPhase !== 'playing' || match.battleMode !== 'human_vs_ai') {
    return;
  }

  const currentPlayer = findCurrentTurnPlayer(match);
  if (!currentPlayer.isAI) {
    return;
  }

  await autoAdvanceAiTurns(match, llmConfig);
  recordBattleOutcomeIfFinished(match, llmConfig);
}

async function autoAdvanceAiTurnsWithHooks(
  match: ActiveMatch,
  llmConfig?: LLMRequestConfig,
  hooks?: BattlePlayProgressHooks
): Promise<BattleTurnBroadcastEvent[]> {
  let guard = 0;
  const maxRounds = TOTAL_SEATS * 108;
  const useLLM = Boolean(llmConfig?.apiKey?.trim());
  const turnEvents: BattleTurnBroadcastEvent[] = [];

  while (match.roundPhase === 'playing' && !isGameOver(match) && guard < maxRounds) {
    const aiPlayer = findCurrentTurnPlayer(match);
    if (!aiPlayer.isAI) {
      break;
    }

    await hooks?.onAiTurnStart?.({
      playerId: aiPlayer.id,
      playerSeat: aiPlayer.seat,
      match: cloneMatch(match)
    });

    const lastPlayInput = toLastPlayInput(match);
    const personality = resolveAiPersonality(aiPlayer.seat, llmConfig);

    const battleCtx: BattleContext = {
      mySeat: aiPlayer.seat,
      teammateSeat: (aiPlayer.seat + 2) % 4,
      players: match.players.map(p => ({
        seat: p.seat,
        playerId: p.id,
        cardsLeft: p.handCards.length,
        isTeammate: p.seat === (aiPlayer.seat + 2) % 4,
        rank: p.rank
      })),
      finishedSeats: [...match.finishedSeats]
    };
    const totalBudgetMs = llmConfig?.timeoutMs && llmConfig.timeoutMs > 0 ? llmConfig.timeoutMs : LLM_BATTLE_TIMEOUT_MS;

    // 我们必须保证每个 AI 有足够完整的全量思考时间。上面的 remainingLlmBudgetMs 如果不断累加减去耗时，
    // 第二个和第三个AI会没有时间（因为前一个AI借用了部分预算）。这里重置回提供给单次决定的时长。
    const singleLLMBudgetMs = totalBudgetMs;
    const canTryLlmThisTurn = useLLM && singleLLMBudgetMs > 250;

    const aiDecision = canTryLlmThisTurn
      ? await askLLMForNextPlay(aiPlayer.handCards, lastPlayInput, match.currentLevel, personality, battleCtx, {
        ...llmConfig,
        timeoutMs: singleLLMBudgetMs,
        seat: aiPlayer.seat
      })
      : calculateBattleNextPlay(aiPlayer.handCards, lastPlayInput, personality, battleCtx, llmConfig);

    let emittedEvent: BattleTurnBroadcastEvent;
    if (aiDecision.cards.length === 0) {
      const speech = aiDecision.speech?.trim() || buildAISpeech('pass', aiDecision.reasoning, personality, llmConfig?.speechStyle, llmConfig?.tauntLevel);
      executePass(match, aiPlayer, true, aiDecision.reasoning, speech);
      emittedEvent = {
        playerId: aiPlayer.id,
        playerSeat: aiPlayer.seat,
        action: 'pass',
        cards: [],
        reasoning: aiDecision.reasoning,
        speech,
        decisionInsight: aiDecision.decisionInsight
      };
    } else {
      const lastPlayCards = match.lastPlay?.cards ?? [];
      if (!canBeat(aiDecision.cards, lastPlayCards)) {
        const speech = buildAISpeech('pass', aiDecision.reasoning, personality, llmConfig?.speechStyle, llmConfig?.tauntLevel);
        executePass(match, aiPlayer, true, aiDecision.reasoning, speech);
        emittedEvent = {
          playerId: aiPlayer.id,
          playerSeat: aiPlayer.seat,
          action: 'pass',
          cards: [],
          reasoning: aiDecision.reasoning,
          speech,
          decisionInsight: aiDecision.decisionInsight
        };
      } else {
        const speech = aiDecision.speech?.trim() || buildAISpeech('play', aiDecision.reasoning, personality, llmConfig?.speechStyle, llmConfig?.tauntLevel);
        executePlay(match, aiPlayer, aiDecision.cards, aiDecision.reasoning, speech);
        emittedEvent = {
          playerId: aiPlayer.id,
          playerSeat: aiPlayer.seat,
          action: 'play',
          cards: cloneCards(aiDecision.cards),
          reasoning: aiDecision.reasoning,
          speech,
          decisionInsight: aiDecision.decisionInsight
        };
      }
    }

    turnEvents.push(emittedEvent);
    await appendBattleTimelineRecord(match, 'ai', emittedEvent);
    await hooks?.onAiTurnEvent?.({
      event: {
        ...emittedEvent,
        cards: cloneCards(emittedEvent.cards)
      },
      match: cloneMatch(match)
    });

    guard += 1;
  }

  if (guard >= maxRounds) {
    throw new Error('AI轮次推进异常，疑似死循环');
  }

  return turnEvents;
}

function toPendingTributeView(match: ActiveMatch, viewerSeat: number): BattlePendingTributeView | null {
  if (!match.pendingTribute) {
    return null;
  }

  return {
    ...clonePendingTribute(match.pendingTribute)!,
    requiredAction:
      match.pendingTribute.phase === 'awaiting_tribute'
        ? viewerSeat === match.pendingTribute.giverSeat
          ? 'give'
          : undefined
        : viewerSeat === match.pendingTribute.receiverSeat
          ? 'return'
          : undefined
  };
}

export function toBattleViewState(match: ActiveMatch, viewerPlayerId: string): BattleViewState {
  const viewer = findPlayerOrThrow(match, viewerPlayerId);
  const opponents = match.players
    .filter((player) => player.id !== viewerPlayerId)
    .sort((left, right) => left.seat - right.seat)
    .map((player) => ({
      playerId: player.id,
      seat: player.seat,
      cardsLeft: player.handCards.length,
      lastThought: player.lastThought,
      rank: player.rank
    }));

  return {
    matchId: match.matchId,
    playerId: viewer.id,
    battleMode: match.battleMode,
    roundNumber: match.roundNumber,
    roundPhase: match.roundPhase,
    antiTributeEnabled: match.antiTributeEnabled,
    doubleDownTributeEnabled: match.doubleDownTributeEnabled,
    returnTributeRule: match.returnTributeRule,
    currentLevel: match.currentLevel,
    currentTurn: match.currentTurn,
    passCount: match.passCount,
    handCards: cloneCards(viewer.handCards),
    opponents,
    lastPlay: match.lastPlay
      ? {
        ...match.lastPlay,
        cards: cloneCards(match.lastPlay.cards)
      }
      : null,
    finishedSeats: [...match.finishedSeats],
    rank: viewer.rank,
    lastRoundSummary: cloneRoundSummary(match.lastRoundSummary),
    roundHistory: cloneRoundHistory(match.roundHistory),
    tributeQueue: cloneTributePairs(match.tributeQueue),
    pendingTribute: toPendingTributeView(match, viewer.seat)
  };
}

/**
 * 初始化一局实战
 */
export function startBattle(options: StartBattleOptions = {}): ActiveMatch {
  const battleMode = options.battleMode ?? 'human_vs_ai';
  const deck = generateDeck(DEFAULT_LEVEL);
  const dealt = dealCards(deck);
  const matchId = createMatchId();

  const players: ActivePlayerState[] = [
    { id: 'player1', seat: 0, handCards: cloneCards(dealt.player1), isAI: battleMode === 'ai_vs_ai', lastThought: '' },
    { id: 'player2', seat: 1, handCards: cloneCards(dealt.player2), isAI: true, lastThought: '' },
    { id: 'player3', seat: 2, handCards: cloneCards(dealt.player3), isAI: true, lastThought: '' },
    { id: 'player4', seat: 3, handCards: cloneCards(dealt.player4), isAI: true, lastThought: '' }
  ];

  const activeMatch: ActiveMatch = {
    matchId,
    battleMode,
    roundNumber: 1,
    roundPhase: 'playing',
    antiTributeEnabled: options.antiTributeEnabled ?? DEFAULT_ANTI_TRIBUTE_ENABLED,
    doubleDownTributeEnabled: options.doubleDownTributeEnabled ?? DEFAULT_DOUBLE_DOWN_TRIBUTE_ENABLED,
    returnTributeRule: options.returnTributeRule ?? DEFAULT_RETURN_TRIBUTE_RULE,
    currentLevel: DEFAULT_LEVEL,
    players,
    currentTurn: 0,
    lastPlay: null,
    passCount: 0,
    finishedSeats: [],
    lastRoundSummary: null,
    roundHistory: [],
    tributeQueue: [],
    pendingTribute: null
  };

  ACTIVE_MATCHES.set(matchId, activeMatch);
  return cloneMatch(activeMatch);
}

export async function persistBattleMatch(match: ActiveMatch): Promise<void> {
  await persistBattleMatchSnapshot(match);
}

function resolveNextRoundSummary(match: ActiveMatch): BattleRoundSummary {
  if (match.lastRoundSummary) {
    if (match.roundHistory.every((item) => item.roundNumber !== match.lastRoundSummary?.roundNumber)) {
      match.roundHistory = [...match.roundHistory, cloneRoundSummary(match.lastRoundSummary)!].slice(-24);
    }
    return cloneRoundSummary(match.lastRoundSummary)!;
  }
  if (!isGameOver(match)) {
    throw new Error('当前对局尚未结束，无法进入下一局');
  }
  const summary = buildRoundSummary(match);
  match.lastRoundSummary = summary;
  match.roundHistory = [...match.roundHistory, cloneRoundSummary(summary)!].slice(-24);
  return cloneRoundSummary(summary)!;
}

function getPlayerBySeatOrThrow(match: ActiveMatch, seat: number): ActivePlayerState {
  const player = match.players.find((item) => item.seat === seat);
  if (!player) {
    throw new Error('指定座位的玩家不存在');
  }
  return player;
}

function syncRoundHistoryWithLastSummary(match: ActiveMatch): void {
  if (!match.lastRoundSummary) {
    return;
  }

  match.roundHistory = match.roundHistory.map((item) =>
    item.roundNumber === match.lastRoundSummary?.roundNumber ? cloneRoundSummary(match.lastRoundSummary)! : item
  );
}

function refreshLastRoundSummaryFromQueue(match: ActiveMatch): void {
  if (!match.lastRoundSummary) {
    return;
  }

  const tributePairs = cloneTributePairs(match.tributeQueue);
  const effectivePairs = tributePairs.filter((pair) => pair.phase !== 'skipped_anti_tribute');
  const skippedPairs = tributePairs.filter((pair) => pair.phase === 'skipped_anti_tribute');

  match.lastRoundSummary = {
    ...match.lastRoundSummary,
    tributePairs,
    tributeRequired: effectivePairs.length > 0,
    tributeGiverSeat: effectivePairs[0]?.giverSeat ?? tributePairs[0]?.giverSeat,
    tributeReceiverSeat: effectivePairs[0]?.receiverSeat ?? tributePairs[0]?.receiverSeat,
    antiTributeApplied: skippedPairs.length > 0,
    antiTributeReason:
      skippedPairs.length === 0
        ? undefined
        : skippedPairs.length === tributePairs.length
          ? skippedPairs[0]?.antiTributeReason ?? '双大王抗贡'
          : `已抗 ${skippedPairs.length} 贡`
  };
  syncRoundHistoryWithLastSummary(match);
}

function syncPendingTributeFromQueue(match: ActiveMatch): TributeExchangeState | null {
  const nextIndex = match.tributeQueue.findIndex(
    (exchange) => exchange.phase === 'awaiting_tribute' || exchange.phase === 'awaiting_return'
  );

  if (nextIndex < 0) {
    match.pendingTribute = null;
    match.roundPhase = 'playing';
    refreshLastRoundSummaryFromQueue(match);
    return null;
  }

  const current = match.tributeQueue[nextIndex]!;
  match.pendingTribute = {
    exchangeIndex: nextIndex,
    totalExchanges: match.tributeQueue.length,
    phase: current.phase === 'awaiting_return' ? 'awaiting_return' : 'awaiting_tribute',
    giverSeat: current.giverSeat,
    receiverSeat: current.receiverSeat,
    tributeCard: current.tributeCard ? { ...current.tributeCard } : undefined
  };
  match.roundPhase = current.phase === 'awaiting_return' ? 'awaiting_return' : 'awaiting_tribute';
  refreshLastRoundSummaryFromQueue(match);
  return current;
}

function advanceTributeQueue(match: ActiveMatch): void {
  while (true) {
    const current = match.tributeQueue.find(
      (exchange) =>
        exchange.phase === 'planned' || exchange.phase === 'awaiting_tribute' || exchange.phase === 'awaiting_return'
    );

    if (!current) {
      match.pendingTribute = null;
      match.roundPhase = 'playing';
      match.currentTurn = resolveRoundOpeningSeat(match);
      refreshLastRoundSummaryFromQueue(match);
      return;
    }

    const giver = getPlayerBySeatOrThrow(match, current.giverSeat);
    const receiver = getPlayerBySeatOrThrow(match, current.receiverSeat);

    if (current.phase === 'planned') {
      if (match.antiTributeEnabled && hasDoubleBigJokers(giver.handCards)) {
        current.phase = 'skipped_anti_tribute';
        current.antiTributeApplied = true;
        current.antiTributeReason = '双大王抗贡';
        giver.lastThought = '我拿到双大王，这组进贡免除';
        receiver.lastThought = '对方双大王抗贡，这组免贡';
        refreshLastRoundSummaryFromQueue(match);
        continue;
      }

      current.phase = 'awaiting_tribute';
    }

    if (current.phase === 'awaiting_tribute') {
      if (!giver.isAI) {
        syncPendingTributeFromQueue(match);
        return;
      }

      const tributeCard = pickHighestCard(giver.handCards);
      moveCardBetweenPlayers(giver, receiver, tributeCard.id);
      giver.lastThought = '我先自动进贡一张最大牌';
      receiver.lastThought = '我先收下进贡';
      current.phase = 'awaiting_return';
      current.tributeCard = tributeCard;
      refreshLastRoundSummaryFromQueue(match);
      continue;
    }

    if (current.phase === 'awaiting_return') {
      if (!receiver.isAI) {
        syncPendingTributeFromQueue(match);
        return;
      }

      const returnCard = pickReturnCardByRule(receiver.handCards, current.tributeCard, match.returnTributeRule);
      moveCardBetweenPlayers(receiver, giver, returnCard.id);
      receiver.lastThought =
        match.returnTributeRule === 'lowest_only' ? '我按最小牌规则还贡' : '我先回一张较小的牌';
      giver.lastThought = '收到对方还贡';
      current.phase = 'completed';
      refreshLastRoundSummaryFromQueue(match);
    }
  }
}

function setupNextRound(match: ActiveMatch, summary: BattleRoundSummary): void {
  const dealtCards = (() => {
    if (TEST_NEXT_ROUND_HANDS) {
      const injected = TEST_NEXT_ROUND_HANDS.map((cards) => cloneCards(cards));
      TEST_NEXT_ROUND_HANDS = null;
      return injected;
    }

    const deck = generateDeck(summary.levelAfter);
    const dealt = dealCards(deck);
    return [dealt.player1, dealt.player2, dealt.player3, dealt.player4];
  })();

  match.roundNumber += 1;
  match.currentLevel = summary.levelAfter;
  resetPlayersForNextRound(match, dealtCards);
  beginRound(match);
  match.lastRoundSummary = cloneRoundSummary(summary);
  match.tributeQueue = (summary.tributePairs ?? []).map((pair, index) => ({
    order: typeof pair.order === 'number' ? pair.order : index + 1,
    giverSeat: pair.giverSeat,
    receiverSeat: pair.receiverSeat,
    phase: 'planned',
    tributeCard: undefined,
    antiTributeApplied: false,
    antiTributeReason: undefined
  }));
  refreshLastRoundSummaryFromQueue(match);
  advanceTributeQueue(match);
}

export async function startNextBattleRound(
  matchId: string,
  playerId: string,
  llmConfig?: LLMRequestConfig
): Promise<ActiveMatch> {
  const match = await findMatchOrThrow(matchId);
  findPlayerOrThrow(match, playerId);

  if (match.roundPhase === 'awaiting_tribute' || match.roundPhase === 'awaiting_return') {
    throw new Error('当前需要先完成进贡/还贡');
  }

  const summary = resolveNextRoundSummary(match);
  setupNextRound(match, summary);
  await autoAdvanceRoundStartIfNeeded(match, llmConfig);
  await persistBattleMatchSnapshot(match);
  return cloneMatch(match);
}

export async function submitBattleTributeSelection(
  matchId: string,
  playerId: string,
  cardId: string,
  llmConfig?: LLMRequestConfig
): Promise<ActiveMatch> {
  const match = await findMatchOrThrow(matchId);
  const player = findPlayerOrThrow(match, playerId);
  const pending = match.pendingTribute;

  if (!pending) {
    throw new Error('当前没有待处理的进贡/还贡操作');
  }
  if (cardId.trim() === '') {
    throw new Error('cardId 不能为空');
  }

  const currentExchange = match.tributeQueue[pending.exchangeIndex];
  if (!currentExchange) {
    throw new Error('当前交供步骤不存在');
  }

  if (pending.phase === 'awaiting_tribute') {
    if (player.seat !== pending.giverSeat) {
      throw new Error('当前轮到末游玩家选择进贡牌');
    }

    const highestCards = getHighestCards(player.handCards);
    if (!highestCards.some((card) => card.id === cardId)) {
      throw new Error('进贡必须选择当前手牌中的最大牌');
    }

    const receiver = getPlayerBySeatOrThrow(match, pending.receiverSeat);
    const tributeCard = moveCardBetweenPlayers(player, receiver, cardId);
    player.lastThought = '我先贡出当前最大牌';
    receiver.lastThought = '我先收下这张贡牌';
    currentExchange.phase = 'awaiting_return';
    currentExchange.tributeCard = tributeCard;
    advanceTributeQueue(match);
  } else {
    if (player.seat !== pending.receiverSeat) {
      throw new Error('当前轮到头游玩家选择还贡牌');
    }

    const selectedCard = player.handCards.find((card) => card.id === cardId);
    if (!selectedCard) {
      throw new Error('还贡牌必须来自当前手牌');
    }
    if (currentExchange.tributeCard && selectedCard.id === currentExchange.tributeCard.id) {
      throw new Error('不能把收到的贡牌原样还回');
    }
    const allowedReturnCards = getAllowedReturnCards(player.handCards, currentExchange.tributeCard, match.returnTributeRule);
    if (!allowedReturnCards.some((card) => card.id === cardId)) {
      if (match.returnTributeRule === 'lowest_only') {
        throw new Error('还贡必须选择当前规则允许的最小牌');
      }
      throw new Error('还贡请选择一张符合当前规则的牌');
    }

    const giver = getPlayerBySeatOrThrow(match, pending.giverSeat);
    moveCardBetweenPlayers(player, giver, cardId);
    player.lastThought = match.returnTributeRule === 'lowest_only' ? '我按最小牌规则还贡' : '我先还一张较小的牌';
    giver.lastThought = '我先收下还贡';
    currentExchange.phase = 'completed';
    advanceTributeQueue(match);
  }

  await autoAdvanceRoundStartIfNeeded(match, llmConfig);
  await persistBattleMatchSnapshot(match);
  return cloneMatch(match);
}

/**
 * 处理实战出牌动作（含 Pass）
 */
export async function submitPlay(
  matchId: string,
  playerId: string,
  cards: RuntimeCard[],
  llmConfig?: LLMRequestConfig
): Promise<SubmitPlayOutcome> {
  return submitPlayWithProgress(matchId, playerId, cards, llmConfig);
}

export async function submitPlayWithProgress(
  matchId: string,
  playerId: string,
  cards: RuntimeCard[],
  llmConfig?: LLMRequestConfig,
  hooks?: BattlePlayProgressHooks
): Promise<SubmitPlayOutcome> {
  const match = await findMatchOrThrow(matchId);
  const player = findPlayerOrThrow(match, playerId);
  assertPlayingRound(match);
  const maybeRecordBattleOutcome = (): void => {
    if (match.roundPhase !== 'finished') {
      return;
    }
    recordBattleOutcomeMetric({
      matchId: match.matchId,
      winnerTeam: resolveWinnerTeam(match),
      model: llmConfig?.model?.trim() || process.env.LLM_MODEL?.trim() || 'unknown',
      decisionMode: resolveDecisionMode(llmConfig)
    });
  };

  if (player.seat !== match.currentTurn) {
    throw new Error('还未轮到当前玩家出牌');
  }

  // Pass 分支
  if (!cards || cards.length === 0) {
    executePass(match, player, false, '玩家选择不出', '我先不出');
    await appendBattleTimelineRecord(match, 'player', {
      playerId: player.id,
      playerSeat: player.seat,
      action: 'pass',
      cards: [],
      reasoning: '玩家选择不出',
      speech: '我先不出'
    });
    await hooks?.onPlayerActionApplied?.({
      action: 'pass',
      cards: [],
      match: cloneMatch(match)
    });
    const turnEvents = await autoAdvanceAiTurnsWithHooks(match, llmConfig, hooks);
    maybeRecordBattleOutcome();
    return {
      match: cloneMatch(match),
      turnEvents: cloneTurnEvents(turnEvents)
    };
  }

  executePlay(match, player, cards, '玩家手动出牌', '我出这手');
  await appendBattleTimelineRecord(match, 'player', {
    playerId: player.id,
    playerSeat: player.seat,
    action: 'play',
    cards: cloneCards(cards),
    reasoning: '玩家手动出牌',
    speech: '我出这手'
  });
  await hooks?.onPlayerActionApplied?.({
    action: 'play',
    cards: cloneCards(cards),
    match: cloneMatch(match)
  });
  const turnEvents = await autoAdvanceAiTurnsWithHooks(match, llmConfig, hooks);
  maybeRecordBattleOutcome();

  return {
    match: cloneMatch(match),
    turnEvents: cloneTurnEvents(turnEvents)
  };
}

export async function advanceBattle(
  matchId: string,
  playerId: string,
  llmConfig?: LLMRequestConfig
): Promise<SubmitPlayOutcome> {
  return advanceBattleWithProgress(matchId, playerId, llmConfig);
}

export async function advanceBattleWithProgress(
  matchId: string,
  playerId: string,
  llmConfig?: LLMRequestConfig,
  hooks?: BattlePlayProgressHooks
): Promise<SubmitPlayOutcome> {
  const match = await findMatchOrThrow(matchId);
  findPlayerOrThrow(match, playerId);
  if (match.roundPhase === 'awaiting_tribute' || match.roundPhase === 'awaiting_return') {
    throw new Error('当前需要先完成进贡/还贡');
  }
  const alreadyFinished = match.roundPhase === 'finished';

  if (!alreadyFinished && !findCurrentTurnPlayer(match).isAI) {
    throw new Error('当前轮到真人玩家，无法自动推进');
  }

  const turnEvents = alreadyFinished ? [] : await autoAdvanceAiTurnsWithHooks(match, llmConfig, hooks);

  if (!alreadyFinished && match.roundPhase === 'finished') {
    recordBattleOutcomeMetric({
      matchId: match.matchId,
      winnerTeam: resolveWinnerTeam(match),
      model: llmConfig?.model?.trim() || process.env.LLM_MODEL?.trim() || 'unknown',
      decisionMode: resolveDecisionMode(llmConfig)
    });
  }

  return {
    match: cloneMatch(match),
    turnEvents: cloneTurnEvents(turnEvents)
  };
}

export async function getBattleMatch(matchId: string): Promise<ActiveMatch | null> {
  const match = getInMemoryMatch(matchId);
  if (match) {
    return cloneMatch(match);
  }

  const restored = await restorePersistedMatch(matchId);
  return restored ? cloneMatch(restored) : null;
}

export async function getBattleTimeline(matchId: string, viewerPlayerId: string): Promise<BattleTimelineViewEntry[]> {
  const timelineRecords = await prisma.battleTimelineRecord.findMany({
    where: { matchId },
    orderBy: { stepNumber: 'asc' }
  });

  return timelineRecords.reduce<BattleTimelineViewEntry[]>((acc, record) => {
    const stateMatch = deserializeActiveMatch(record.stateSnapshot);
    if (!stateMatch) {
      return acc;
    }

    acc.push({
      id: record.id,
      stepNumber: record.stepNumber,
      playerId: record.playerId,
      playerSeat: record.playerSeat,
      source: record.source === 'player' ? 'player' : 'ai',
      action: record.actionType === ActionType.PLAY ? 'play' : 'pass',
      cards: (() => {
        try {
          const parsed = JSON.parse(record.cards) as RuntimeCard[] | null;
          return Array.isArray(parsed) ? cloneCards(parsed) : [];
        } catch {
          return [];
        }
      })(),
      reasoning: record.reasoning,
      speech: record.speech?.trim() || undefined,
      decisionInsight: parseDecisionInsight(record.decisionInsight),
      state: toBattleViewState(stateMatch, viewerPlayerId)
    });
    return acc;
  }, []);
}

export async function getRecentBattleMatches(
  battleMode?: BattleMode,
  limit = 12
): Promise<BattleSessionSummary[]> {
  const records = await prisma.battleMatchRecord.findMany({
    where: battleMode ? { battleMode } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: Math.max(1, Math.min(limit, 30)),
    include: {
      timelineEntries: {
        orderBy: { stepNumber: 'desc' },
        take: 1
      }
    }
  });

  return records.reduce<BattleSessionSummary[]>((acc, record) => {
    const restored = deserializeActiveMatch(record.currentState);
    if (!restored) {
      return acc;
    }

    const latest = record.timelineEntries[0];
    acc.push({
      matchId: record.id,
      battleMode: restored.battleMode,
      roundNumber: restored.roundNumber,
      roundPhase: restored.roundPhase,
      antiTributeEnabled: restored.antiTributeEnabled,
      doubleDownTributeEnabled: restored.doubleDownTributeEnabled,
      returnTributeRule: restored.returnTributeRule,
      currentLevel: restored.currentLevel,
      currentTurn: restored.currentTurn,
      stepCount: record.stepCount,
      finishedSeats: [...restored.finishedSeats],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      endedAt: record.endedAt?.toISOString(),
      lastRoundSummary: cloneRoundSummary(restored.lastRoundSummary),
      lastAction: latest
        ? {
          playerId: latest.playerId,
          playerSeat: latest.playerSeat,
          action: latest.actionType === ActionType.PLAY ? 'play' : 'pass',
          stepNumber: latest.stepNumber
        }
        : undefined
    });
    return acc;
  }, []);
}

export function getActiveMatch(matchId: string): ActiveMatch | null {
  const match = getInMemoryMatch(matchId);
  return match ? cloneMatch(match) : null;
}

export function removeActiveMatch(matchId: string): void {
  ACTIVE_MATCHES.delete(matchId);
}

export function setPlayerAiFlagForTest(matchId: string, seat: number, isAI: boolean): void {
  const match = ACTIVE_MATCHES.get(matchId);
  if (!match) {
    return;
  }
  const player = match.players.find((item) => item.seat === seat);
  if (!player) {
    return;
  }
  player.isAI = isAI;
}

export function mutateActiveMatchForTest(matchId: string, mutator: (match: ActiveMatch) => void): void {
  const match = ACTIVE_MATCHES.get(matchId);
  if (!match) {
    return;
  }
  mutator(match);
}

export function setNextRoundHandsForTest(hands: RuntimeCard[][] | null): void {
  TEST_NEXT_ROUND_HANDS = hands ? hands.map((cards) => cloneCards(cards)) : null;
}

export function clearActiveMatchesForTest(): void {
  ACTIVE_MATCHES.clear();
  TEST_NEXT_ROUND_HANDS = null;
}

export async function clearPersistedBattleMatchesForTest(): Promise<void> {
  await prisma.battleTimelineRecord.deleteMany();
  await prisma.battleMatchRecord.deleteMany();
}
