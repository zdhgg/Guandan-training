import OpenAI from 'openai';
import { RuntimeCard } from '../core/cardEngine';
import { canBeat, identifyPattern } from '../core/ruleValidator';
import { autoGroupCards, generateAllGroupings } from './autoGrouper';
import { recordAITurnMetric } from './aiMetricsService';

export type LastPlayInput = { playerId: string; playerSeat?: number; cards: RuntimeCard[] } | null;

export interface BattleContext {
  mySeat: number;
  teammateSeat: number;
  players: Array<{
    seat: number;
    playerId: string;
    cardsLeft: number;
    isTeammate: boolean;
    rank?: number;
  }>;
  finishedSeats: number[];
}
export type AIPlayerPersonality = 'aggressive' | 'conservative' | 'balanced';
export type AIDecisionMode = 'candidate' | 'legacy';
export type AISpeechStyle = 'restrained' | 'normal' | 'taunt';
export type AITauntLevel = 'mild' | 'medium' | 'heavy';
export interface AIProfileWeights {
  aggression: number;
  bombConservation: number;
  teammateSupport: number;
  endgameRisk: number;
}
export interface NextPlayDecision {
  cards: RuntimeCard[];
  reasoning: string;
  speech?: string;
  decisionInsight?: AIDecisionInsight;
}

export interface AIDecisionCandidateInsight {
  index: number;
  action: LLMAction;
  summary: string;
  patternType: string;
  powerLevel: number;
  score?: number;
  cardIds: string[];
  tacticHints?: string[];
}

export interface AIDecisionInsight {
  decisionMode: AIDecisionMode;
  tacticalSignals?: {
    hasLastPlay: boolean;
    lastPlayByTeammate: boolean;
    lastPlayByOpponent: boolean;
    teammateCardsLeft?: number;
    minOpponentCardsLeft?: number;
    teammateNearFinish: boolean;
    opponentNearFinish: boolean;
    opponentCritical: boolean;
  };
  selectedAction: LLMAction;
  selectedCandidateIndex?: number;
  selectedSummary?: string;
  selectedScore?: number;
  topCandidates?: AIDecisionCandidateInsight[];
}

type LLMAction = 'play' | 'pass';
type LLMCardRef = { id?: string } | string;
type LLMDecisionRaw = {
  reasoning?: unknown;
  action?: unknown;
  cards?: unknown;
};
export interface LLMRequestConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  seat?: number;
  decisionMode?: AIDecisionMode;
  speechStyle?: AISpeechStyle;
  tauntLevel?: AITauntLevel;
  prompts?: {
    aggressive?: string;
    conservative?: string;
    balanced?: string;
  };
  profiles?: Partial<Record<AIPlayerPersonality, Partial<AIProfileWeights>>>;
  seatPersonalities?: Record<number, AIPlayerPersonality | undefined>;
}
export interface LLMConnectivityResult {
  success: boolean;
  message: string;
  model: string;
  latencyMs: number;
  statusCode?: number;
  errorType?: string;
}

export const LLM_BATTLE_TIMEOUT_MS = 60000;
const LLM_CONNECTIVITY_TIMEOUT_MS = 12000;
const DEFAULT_DECISION_MODE: AIDecisionMode = process.env.LLM_DECISION_MODE?.trim() === 'legacy' ? 'legacy' : 'candidate';
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  deepseek: 'deepseek-chat',
  minimax: 'MiniMax-Text-01',
  default: 'gpt-4o-mini'
};
const DEFAULT_PROFILE_BY_PERSONALITY: Record<AIPlayerPersonality, AIProfileWeights> = {
  aggressive: {
    aggression: 0.92,
    bombConservation: 0.18,
    teammateSupport: 0.34,
    endgameRisk: 0.86
  },
  balanced: {
    aggression: 0.55,
    bombConservation: 0.58,
    teammateSupport: 0.62,
    endgameRisk: 0.56
  },
  conservative: {
    aggression: 0.26,
    bombConservation: 0.93,
    teammateSupport: 0.66,
    endgameRisk: 0.31
  }
};
const LOG_COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  red: '\x1b[31m'
} as const;
const DEFAULT_SPEECH_STYLE: AISpeechStyle = 'normal';
const DEFAULT_TAUNT_LEVEL: AITauntLevel = 'mild';

let cachedClient: OpenAI | null = null;
let cachedKey: string | null = null;
let cachedBaseUrl: string | null = null;

interface CandidateMove {
  action: LLMAction;
  cards: RuntimeCard[];
  summary: string;
  patternType: string;
  powerLevel: number;
  score?: number;
  tacticHints?: string[];
}

interface TacticalSignals {
  hasLastPlay: boolean;
  lastPlayByTeammate: boolean;
  lastPlayByOpponent: boolean;
  teammateCardsLeft: number;
  minOpponentCardsLeft: number;
  teammateNearFinish: boolean;
  opponentNearFinish: boolean;
  opponentCritical: boolean;
}

function clampWeight(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolveDecisionMode(mode?: AIDecisionMode): AIDecisionMode {
  if (mode === 'legacy' || mode === 'candidate') {
    return mode;
  }
  return DEFAULT_DECISION_MODE;
}

function resolveSpeechStyle(style?: AISpeechStyle): AISpeechStyle {
  if (style === 'restrained' || style === 'taunt' || style === 'normal') {
    return style;
  }
  return DEFAULT_SPEECH_STYLE;
}

function resolveTauntLevel(level?: AITauntLevel): AITauntLevel {
  if (level === 'medium' || level === 'heavy' || level === 'mild') {
    return level;
  }
  return DEFAULT_TAUNT_LEVEL;
}

function clampSpeechText(text: string, maxLength = 60): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}

function toSpeechReasonSnippet(reasoning: string): string {
  const normalized = reasoning.replace(/\s+/g, ' ').trim().replace(/[。！？.!?]+$/g, '');
  return clampSpeechText(normalized, 36);
}

export function buildAISpeech(
  action: 'play' | 'pass',
  reasoning: string,
  personality: AIPlayerPersonality,
  style?: AISpeechStyle,
  tauntLevel?: AITauntLevel
): string {
  const normalizedStyle = resolveSpeechStyle(style);
  const normalizedTauntLevel = resolveTauntLevel(tauntLevel);
  const snippet = toSpeechReasonSnippet(reasoning);

  let lead = '';
  if (normalizedStyle === 'restrained') {
    if (action === 'play') {
      lead = personality === 'aggressive' ? '先稳压一手' : '按节奏出牌';
    } else {
      lead = personality === 'conservative' ? '这手先让' : '这轮先过';
    }
  } else if (normalizedStyle === 'taunt') {
    if (normalizedTauntLevel === 'heavy') {
      if (action === 'play') {
        lead = personality === 'aggressive' ? '看好了，这手你接不住' : '这手下去，你得想很久';
      } else {
        lead = personality === 'conservative' ? '先放你一步，别高兴太早' : '这轮先给你机会，下一手就没了';
      }
    } else if (normalizedTauntLevel === 'medium') {
      if (action === 'play') {
        lead = personality === 'aggressive' ? '来，接住这手' : '这手你未必顶得住';
      } else {
        lead = personality === 'conservative' ? '先放你一轮' : '这手先让你过';
      }
    } else if (action === 'play') {
      lead = personality === 'aggressive' ? '这手先给点压力' : '这手你得认真接';
    } else {
      lead = personality === 'conservative' ? '先留你一手' : '这轮先给你空间';
    }
  } else {
    if (action === 'play') {
      lead = personality === 'balanced' ? '这手我来控节奏' : '这手我先压';
    } else {
      lead = personality === 'aggressive' ? '这手先忍一下' : '这手先不接';
    }
  }

  if (!snippet) {
    return clampSpeechText(lead, 60);
  }

  return clampSpeechText(`${lead}：${snippet}`, 60);
}

function mergeProfile(base: AIProfileWeights, override?: Partial<AIProfileWeights>): AIProfileWeights {
  if (!override) {
    return { ...base };
  }

  return {
    aggression:
      typeof override.aggression === 'number' ? clampWeight(override.aggression) : base.aggression,
    bombConservation:
      typeof override.bombConservation === 'number'
        ? clampWeight(override.bombConservation)
        : base.bombConservation,
    teammateSupport:
      typeof override.teammateSupport === 'number'
        ? clampWeight(override.teammateSupport)
        : base.teammateSupport,
    endgameRisk:
      typeof override.endgameRisk === 'number' ? clampWeight(override.endgameRisk) : base.endgameRisk
  };
}

function resolvePersonalityProfile(
  personality: AIPlayerPersonality,
  overrides?: LLMRequestConfig['profiles']
): AIProfileWeights {
  return mergeProfile(DEFAULT_PROFILE_BY_PERSONALITY[personality], overrides?.[personality]);
}

function compareCardByLogic(left: RuntimeCard, right: RuntimeCard): number {
  if (left.logicValue !== right.logicValue) {
    return left.logicValue - right.logicValue;
  }
  return left.id.localeCompare(right.id);
}

function buildNaturalPairCandidates(handCards: RuntimeCard[]): RuntimeCard[][] {
  const cardsByRank = new Map<string, RuntimeCard[]>();

  for (const card of handCards) {
    if (card.isWildcard) {
      continue;
    }

    const existing = cardsByRank.get(card.rank) ?? [];
    existing.push(card);
    cardsByRank.set(card.rank, existing);
  }

  const candidates: RuntimeCard[][] = [];
  for (const sameRankCards of cardsByRank.values()) {
    if (sameRankCards.length < 2) {
      continue;
    }

    const sorted = [...sameRankCards].sort(compareCardByLogic);
    candidates.push([sorted[0], sorted[1]]);
  }

  return candidates.sort((left, right) => {
    const leftTop = Math.max(left[0].logicValue, left[1].logicValue);
    const rightTop = Math.max(right[0].logicValue, right[1].logicValue);
    if (leftTop !== rightTop) {
      return leftTop - rightTop;
    }

    const leftBottom = Math.min(left[0].logicValue, left[1].logicValue);
    const rightBottom = Math.min(right[0].logicValue, right[1].logicValue);
    if (leftBottom !== rightBottom) {
      return leftBottom - rightBottom;
    }

    return left[0].id.localeCompare(right[0].id);
  });
}

function resolveModelName(baseUrl: string | undefined, preferredModel?: string): string {
  const configured = preferredModel?.trim() || process.env.LLM_MODEL?.trim();
  if (configured) {
    return configured;
  }

  const providerHint = (baseUrl ?? '').toLowerCase();
  if (providerHint.includes('deepseek')) {
    return DEFAULT_MODEL_BY_PROVIDER.deepseek;
  }
  if (providerHint.includes('minimax')) {
    return DEFAULT_MODEL_BY_PROVIDER.minimax;
  }
  return DEFAULT_MODEL_BY_PROVIDER.default;
}

function getLLMClient(apiKeyInput?: string, baseUrlInput?: string): OpenAI | null {
  const apiKey = (apiKeyInput ?? process.env.LLM_API_KEY ?? '').trim();
  const baseUrl = (baseUrlInput ?? process.env.LLM_BASE_URL ?? '').trim();

  if (!apiKey) {
    return null;
  }

  if (cachedClient && cachedKey === apiKey && cachedBaseUrl === baseUrl) {
    return cachedClient;
  }

  cachedClient = new OpenAI({
    apiKey,
    baseURL: baseUrl || undefined
  });
  cachedKey = apiKey;
  cachedBaseUrl = baseUrl;
  return cachedClient;
}

function normalizeConnectivityErrorMessage(statusCode: number | undefined, rawMessage: string): string {
  const messageLower = rawMessage.toLowerCase();

  if (statusCode === 401 || statusCode === 403) {
    return '鉴权失败，请检查 API Key 是否正确';
  }
  if (statusCode === 404) {
    return '接口地址或模型不存在，请检查 Base URL 与模型名称';
  }
  if (statusCode === 429) {
    return '请求过于频繁或额度不足，请稍后重试';
  }
  if (typeof statusCode === 'number' && statusCode >= 500) {
    return '上游模型服务暂不可用，请稍后重试';
  }
  if (messageLower.includes('timed out') || messageLower.includes('timeout')) {
    return '请求超时，请检查网络或 Base URL';
  }
  if (
    messageLower.includes('fetch failed') ||
    messageLower.includes('enotfound') ||
    messageLower.includes('econnrefused')
  ) {
    return '无法连接到模型服务，请检查 Base URL 和网络';
  }

  return rawMessage || 'LLM 连通性测试失败';
}

function resolveConnectivityError(
  error: unknown
): Pick<LLMConnectivityResult, 'message' | 'statusCode' | 'errorType'> {
  const errorLike =
    typeof error === 'object' && error !== null
      ? (error as { status?: unknown; code?: unknown; type?: unknown; message?: unknown })
      : undefined;

  const statusCode = typeof errorLike?.status === 'number' ? errorLike.status : undefined;
  const errorType =
    typeof errorLike?.type === 'string'
      ? errorLike.type
      : typeof errorLike?.code === 'string'
        ? errorLike.code
        : undefined;

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof errorLike?.message === 'string'
        ? errorLike.message
        : 'LLM 连通性测试失败';

  return {
    message: normalizeConnectivityErrorMessage(statusCode, rawMessage),
    statusCode,
    errorType
  };
}

function serializeCards(cards: RuntimeCard[]): Array<{
  id: string;
  rank: string;
  suit: string;
  logicValue: number;
  isWildcard: boolean;
}> {
  return cards.map((card) => {
    let displayRank: string = card.rank;
    if (card.rank === 'JOKER') {
      displayRank = card.logicValue > 165 ? '大王' : '小王';
    }
    return {
      id: card.id,
      rank: displayRank,
      suit: card.suit,
      logicValue: card.logicValue,
      isWildcard: card.isWildcard
    };
  });
}

function colorize(text: string, color: string): string {
  return `${color}${text}${LOG_COLORS.reset}`;
}

function formatCardForLog(card: RuntimeCard): {
  id: string;
  rank: string;
  suit: string;
  logicValue: number;
  isWildcard: boolean;
} {
  let displayRank: string = card.rank;
  if (card.rank === 'JOKER') {
    displayRank = card.logicValue > 165 ? '大王' : '小王';
  }
  return {
    id: card.id,
    rank: displayRank,
    suit: card.suit,
    logicValue: card.logicValue,
    isWildcard: card.isWildcard
  };
}

function summarizeHandForLog(handCards: RuntimeCard[]): {
  total: number;
  wildcardCount: number;
  preview: ReturnType<typeof formatCardForLog>[];
  omitted: number;
} {
  const previewLimit = 8;
  const preview = handCards.slice(0, previewLimit).map(formatCardForLog);
  return {
    total: handCards.length,
    wildcardCount: handCards.filter((card) => card.isWildcard).length,
    preview,
    omitted: Math.max(0, handCards.length - previewLimit)
  };
}

function summarizeLastPlayForLog(lastPlay: LastPlayInput):
  | {
    state: 'new_round';
  }
  | {
    state: 'follow';
    playerId: string;
    total: number;
    cards: ReturnType<typeof formatCardForLog>[];
  } {
  if (!lastPlay) {
    return { state: 'new_round' };
  }

  return {
    state: 'follow',
    playerId: lastPlay.playerId,
    total: lastPlay.cards.length,
    cards: lastPlay.cards.map(formatCardForLog)
  };
}

function logLLMBlock(prefix: string, color: string, payload: unknown): void {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  console.log(`${colorize(prefix, color)}\n${content}`);
}

function logLLMLine(prefix: string, color: string, message: string): void {
  console.log(`${colorize(prefix, color)} ${message}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function extractJsonString(rawContent: string): string {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    throw new Error('LLM 返回空内容');
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const source = fencedMatch ? fencedMatch[1] : trimmed;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('LLM 返回内容中未找到 JSON 对象');
  }

  return source.slice(start, end + 1);
}

function parseLegacyDecision(content: string): { action: LLMAction; cardIds: string[]; reasoning: string } {
  const jsonText = extractJsonString(content);
  const parsed = JSON.parse(jsonText) as LLMDecisionRaw;
  const reasoning =
    typeof parsed.reasoning === 'string'
      ? parsed.reasoning.trim()
      : '';
  if (!reasoning) {
    throw new Error('LLM reasoning 字段缺失或为空');
  }
  if (reasoning.length > 200) {
    throw new Error('LLM reasoning 字段超过200字');
  }
  const action = parsed.action;

  if (action !== 'play' && action !== 'pass') {
    throw new Error('LLM action 字段非法');
  }

  if (!Array.isArray(parsed.cards)) {
    throw new Error('LLM cards 字段不是数组');
  }

  if (action === 'pass') {
    if (parsed.cards.length !== 0) {
      throw new Error('LLM action=pass 时 cards 必须为空数组');
    }
    return { action, cardIds: [], reasoning };
  }

  const cardIds: string[] = [];
  for (const item of parsed.cards as LLMCardRef[]) {
    if (typeof item === 'string') {
      cardIds.push(item);
      continue;
    }
    if (item && typeof item === 'object' && typeof item.id === 'string') {
      cardIds.push(item.id);
      continue;
    }
    throw new Error('LLM cards 数组元素格式非法');
  }

  if (cardIds.length === 0) {
    throw new Error('LLM 选择了 play 但 cards 为空');
  }

  return { action, cardIds, reasoning };
}

function parseCandidateDecision(
  content: string,
  candidateCount: number
): { action: LLMAction; candidateIndex: number; reasoning: string } {
  const jsonText = extractJsonString(content);
  const parsed = JSON.parse(jsonText) as {
    reasoning?: unknown;
    action?: unknown;
    candidateIndex?: unknown;
    candidate_index?: unknown;
  };

  const reasoning =
    typeof parsed.reasoning === 'string'
      ? parsed.reasoning.trim()
      : '';
  if (!reasoning) {
    throw new Error('LLM reasoning 字段缺失或为空');
  }
  if (reasoning.length > 200) {
    throw new Error('LLM reasoning 字段超过200字');
  }

  const rawAction = parsed.action;
  if (rawAction !== 'play' && rawAction !== 'pass') {
    throw new Error('LLM action 字段非法');
  }

  const rawIndex = parsed.candidateIndex ?? parsed.candidate_index;
  const candidateIndex =
    typeof rawIndex === 'number'
      ? rawIndex
      : typeof rawIndex === 'string'
        ? Number(rawIndex)
        : NaN;

  if (!Number.isInteger(candidateIndex)) {
    throw new Error('LLM candidateIndex 字段非法');
  }

  if (candidateIndex < 0 || candidateIndex >= candidateCount) {
    throw new Error(`LLM candidateIndex 越界: ${candidateIndex}`);
  }

  return {
    action: rawAction,
    candidateIndex,
    reasoning
  };
}

function mapCardIdsToRuntimeCards(handCards: RuntimeCard[], cardIds: string[]): RuntimeCard[] {
  const handMap = new Map(handCards.map((card) => [card.id, card]));
  const used = new Set<string>();
  const selectedCards: RuntimeCard[] = [];

  for (const id of cardIds) {
    if (used.has(id)) {
      throw new Error('LLM 返回了重复牌 ID');
    }

    const card = handMap.get(id);
    if (!card) {
      throw new Error('LLM 返回了不在手牌中的牌 ID');
    }

    used.add(id);
    selectedCards.push(card);
  }

  return selectedCards;
}

function isLegalAttempt(cards: RuntimeCard[], lastPlay: LastPlayInput): boolean {
  const lastPlayCards = lastPlay?.cards ?? [];
  return canBeat(cards, lastPlayCards);
}

function makeCardsKey(cards: RuntimeCard[]): string {
  return cards
    .map((card) => card.id)
    .sort((left, right) => left.localeCompare(right))
    .join('|');
}

function pushCandidateMove(
  candidates: CandidateMove[],
  dedupe: Set<string>,
  action: LLMAction,
  cards: RuntimeCard[],
  summary: string
): void {
  const key = `${action}:${makeCardsKey(cards)}`;
  if (dedupe.has(key)) {
    return;
  }
  dedupe.add(key);

  if (action === 'pass') {
    candidates.push({
      action,
      cards: [],
      summary,
      patternType: 'pass',
      powerLevel: 0
    });
    return;
  }

  const pattern = identifyPattern(cards);
  if (!pattern.isValid) {
    return;
  }

  candidates.push({
    action,
    cards,
    summary,
    patternType: pattern.patternType,
    powerLevel: pattern.powerLevel
  });
}

function getSeatCardsLeft(context: BattleContext | undefined, seat: number): number {
  if (!context) {
    return Number.POSITIVE_INFINITY;
  }
  const player = context.players.find((p) => p.seat === seat);
  if (!player || player.rank) {
    return Number.POSITIVE_INFINITY;
  }
  return player.cardsLeft;
}

function resolveTacticalSignals(lastPlay: LastPlayInput, context: BattleContext | undefined): TacticalSignals {
  const hasLastPlay = Boolean(lastPlay?.cards?.length);
  const lastSeat = typeof lastPlay?.playerSeat === 'number' ? lastPlay.playerSeat : -1;
  const lastPlayByTeammate = !!context && hasLastPlay && lastSeat === context.teammateSeat;
  const lastPlayByOpponent =
    !!context &&
    hasLastPlay &&
    lastSeat !== context.mySeat &&
    lastSeat !== context.teammateSeat;
  const teammateCardsLeft = context ? getSeatCardsLeft(context, context.teammateSeat) : Number.POSITIVE_INFINITY;
  const minOpponentCardsLeft = context
    ? context.players
      .filter((p) => !p.rank && !p.isTeammate && p.seat !== context.mySeat)
      .reduce((min, p) => Math.min(min, p.cardsLeft), Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;

  return {
    hasLastPlay,
    lastPlayByTeammate,
    lastPlayByOpponent,
    teammateCardsLeft,
    minOpponentCardsLeft,
    teammateNearFinish: Number.isFinite(teammateCardsLeft) && teammateCardsLeft <= 2,
    opponentNearFinish: Number.isFinite(minOpponentCardsLeft) && minOpponentCardsLeft <= 2,
    opponentCritical: Number.isFinite(minOpponentCardsLeft) && minOpponentCardsLeft <= 1
  };
}

function buildMoveTacticHints(
  move: CandidateMove,
  tactical: TacticalSignals,
  handSize: number
): string[] {
  const hints: string[] = [];
  const bombLike = move.patternType === 'bomb' || move.patternType === 'straight_flush';

  if (move.action === 'pass') {
    if (tactical.lastPlayByTeammate) {
      hints.push('队友占先时可让牌保留队友牌权');
    }
    if (tactical.opponentNearFinish) {
      hints.push('对手濒临出线时，Pass 风险较高');
    }
  } else {
    if (tactical.lastPlayByOpponent && tactical.opponentNearFinish) {
      hints.push('对手接近出线，优先阻断其牌权');
    }
    if (tactical.lastPlayByTeammate) {
      hints.push('当前由队友占先，除非这手能明显收尾，否则应优先让牌保留队友牌权');
    }
    if (bombLike) {
      hints.push('炸弹/同花顺是高价值资源，需权衡使用时机');
    }
    if (handSize - move.cards.length <= 1) {
      hints.push('该动作有机会快速清空手牌');
    }
  }

  return hints;
}

function normalizeSignalValue(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

function toPublicTacticalSignals(tactical?: TacticalSignals): AIDecisionInsight['tacticalSignals'] | undefined {
  if (!tactical) {
    return undefined;
  }

  return {
    hasLastPlay: tactical.hasLastPlay,
    lastPlayByTeammate: tactical.lastPlayByTeammate,
    lastPlayByOpponent: tactical.lastPlayByOpponent,
    teammateCardsLeft: normalizeSignalValue(tactical.teammateCardsLeft),
    minOpponentCardsLeft: normalizeSignalValue(tactical.minOpponentCardsLeft),
    teammateNearFinish: tactical.teammateNearFinish,
    opponentNearFinish: tactical.opponentNearFinish,
    opponentCritical: tactical.opponentCritical
  };
}

function toCandidateInsights(candidates: CandidateMove[], limit = 4): AIDecisionCandidateInsight[] {
  return candidates.slice(0, limit).map((candidate, index) => ({
    index,
    action: candidate.action,
    summary: candidate.summary,
    patternType: candidate.patternType,
    powerLevel: candidate.powerLevel,
    score: candidate.score,
    cardIds: candidate.cards.map((card) => card.id),
    tacticHints: candidate.tacticHints
  }));
}

function sortCandidateMoves(left: CandidateMove, right: CandidateMove): number {
  const rightScore = right.score ?? Number.NEGATIVE_INFINITY;
  const leftScore = left.score ?? Number.NEGATIVE_INFINITY;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }
  if (left.cards.length !== right.cards.length) {
    return right.cards.length - left.cards.length;
  }
  return left.summary.localeCompare(right.summary);
}

function scoreCandidateMove(
  move: CandidateMove,
  lastPlay: LastPlayInput,
  profile: AIProfileWeights,
  handSize: number,
  tactical: TacticalSignals
): number {
  if (move.action === 'pass') {
    let score = (lastPlay && lastPlay.cards.length > 0 ? 8 : -10) + profile.bombConservation * 20 - profile.aggression * 25;

    if (!tactical.hasLastPlay) {
      // 首出阶段通常应主动建立牌权，避免无意义 pass。
      score -= 90;
    }

    if (tactical.lastPlayByTeammate) {
      score += 72 * (0.4 + profile.teammateSupport);
      if (!tactical.opponentNearFinish) {
        score += 20;
      }
      if (tactical.teammateNearFinish) {
        score += 48;
      }
    }

    if (tactical.lastPlayByOpponent && tactical.opponentNearFinish) {
      score -= tactical.opponentCritical ? 170 : 105;
    }

    return score;
  }

  const bombLike = move.patternType === 'bomb' || move.patternType === 'straight_flush';
  const pressureBonus = lastPlay && lastPlay.cards.length > 0 ? 45 : 12;
  const finishPressure = handSize <= 6 ? 55 : handSize <= 10 ? 25 : 0;
  const releaseValue = move.cards.length * 18;
  const bombPenalty = bombLike ? 240 + move.cards.length * 30 : 0;
  const remainingAfterPlay = handSize - move.cards.length;
  const finishesHand = remainingAfterPlay === 0;
  const leavesOneCard = remainingAfterPlay === 1;

  const aggressionScore = profile.aggression * (move.powerLevel + pressureBonus);
  const endgameScore = profile.endgameRisk * (releaseValue + finishPressure);
  const supportScore = profile.teammateSupport * (lastPlay ? 20 : 10);
  const conservationPenalty = profile.bombConservation * bombPenalty;
  let tacticalAdjustment = 0;

  if (tactical.lastPlayByTeammate) {
    if (finishesHand) {
      tacticalAdjustment -= 35;
    } else {
      tacticalAdjustment -= 180 + move.powerLevel * (bombLike ? 1.15 : 0.88);
      if (!tactical.opponentNearFinish) {
        tacticalAdjustment -= 90;
      }
      if (tactical.teammateNearFinish) {
        tacticalAdjustment -= 180;
      }
      if (leavesOneCard) {
        tacticalAdjustment += 70;
      }
      if (bombLike) {
        tacticalAdjustment -= 220 + 110 * profile.bombConservation;
      }
    }
  }

  if (tactical.lastPlayByOpponent && tactical.opponentNearFinish) {
    tacticalAdjustment += tactical.opponentCritical ? 140 : 85;
    tacticalAdjustment += profile.aggression * 26;
    if (bombLike) {
      tacticalAdjustment += tactical.opponentCritical ? 120 : 72;
    }
  }

  if (!tactical.opponentNearFinish && bombLike && handSize > 5) {
    tacticalAdjustment -= 75 * profile.bombConservation;
  }

  if (handSize - move.cards.length <= 1) {
    tacticalAdjustment += 130;
  }

  return aggressionScore + endgameScore + supportScore - conservationPenalty + tacticalAdjustment;
}

function buildCandidateMoves(
  handCards: RuntimeCard[],
  lastPlay: LastPlayInput,
  profile: AIProfileWeights,
  context?: BattleContext
): CandidateMove[] {
  const candidates: CandidateMove[] = [];
  const dedupe = new Set<string>();
  const naturalCards = handCards
    .filter((card) => !card.isWildcard)
    .sort(compareCardByLogic);

  const lastPlayCards = lastPlay?.cards ?? [];

  for (const card of naturalCards.slice(0, 6)) {
    const attempt = [card];
    if (canBeat(attempt, lastPlayCards)) {
      pushCandidateMove(candidates, dedupe, 'play', attempt, `单张 ${card.id}`);
    }
  }

  const pairCandidates = buildNaturalPairCandidates(naturalCards);
  for (const pair of pairCandidates) {
    if (canBeat(pair, lastPlayCards)) {
      pushCandidateMove(candidates, dedupe, 'play', pair, `对子 ${pair.map((card) => card.id).join(',')}`);
    }
  }

  const grouped = autoGroupCards(handCards);
  for (const group of grouped) {
    if (!group || group.length === 0) {
      continue;
    }
    if (!canBeat(group, lastPlayCards)) {
      continue;
    }
    pushCandidateMove(
      candidates,
      dedupe,
      'play',
      group,
      `理牌候选 ${group.map((card) => card.id).join(',')}`
    );
  }

  const rankMap = new Map<string, RuntimeCard[]>();
  for (const card of handCards) {
    const existing = rankMap.get(card.rank) ?? [];
    existing.push(card);
    rankMap.set(card.rank, existing);
  }
  for (const sameRankCards of rankMap.values()) {
    if (sameRankCards.length < 4) {
      continue;
    }
    const sorted = [...sameRankCards].sort(compareCardByLogic);
    for (let size = 4; size <= sorted.length; size++) {
      const bomb = sorted.slice(0, size);
      if (canBeat(bomb, lastPlayCards)) {
        pushCandidateMove(candidates, dedupe, 'play', bomb, `炸弹 ${bomb.map((card) => card.id).join(',')}`);
      }
    }
  }

  const tactical = resolveTacticalSignals(lastPlay, context);
  const scoredMoves = candidates.map((candidate) => {
    const score = scoreCandidateMove(candidate, lastPlay, profile, handCards.length, tactical);
    return {
      ...candidate,
      score,
      tacticHints: buildMoveTacticHints(candidate, tactical, handCards.length)
    };
  });

  const playMoves = scoredMoves
    .filter((candidate) => candidate.action === 'play')
    .sort(sortCandidateMoves)
    .slice(0, 12);

  const passMove: CandidateMove = {
    action: 'pass',
    cards: [],
    summary: 'Pass（不出）',
    patternType: 'pass',
    powerLevel: 0,
    score: scoreCandidateMove(
      { action: 'pass', cards: [], summary: 'Pass（不出）', patternType: 'pass', powerLevel: 0 },
      lastPlay,
      profile,
      handCards.length,
      tactical
    ),
    tacticHints: buildMoveTacticHints(
      { action: 'pass', cards: [], summary: 'Pass（不出）', patternType: 'pass', powerLevel: 0 },
      tactical,
      handCards.length
    )
  };

  if (playMoves.length === 0) {
    return [passMove];
  }

  return [...playMoves, passMove].sort(sortCandidateMoves);
}

function formatProfile(profile: AIProfileWeights): string {
  return `aggression=${profile.aggression.toFixed(2)}, bombConservation=${profile.bombConservation.toFixed(2)}, teammateSupport=${profile.teammateSupport.toFixed(2)}, endgameRisk=${profile.endgameRisk.toFixed(2)}`;
}

function buildPersonalityInstruction(
  personality: AIPlayerPersonality,
  profile: AIProfileWeights,
  overrides?: LLMRequestConfig['prompts']
): string {
  const defaultPrompts: Record<AIPlayerPersonality, string> = {
    aggressive: '你偏激进，优先抢牌权和压制。',
    conservative: '你偏保守，优先保牌型和关键资源。',
    balanced: '你偏均衡，优先整体胜率与局势稳定。'
  };

  const customPrompt = overrides?.[personality];
  const baseInstruction = customPrompt || defaultPrompts[personality];
  return `${baseInstruction}\n当前人格参数: ${formatProfile(profile)}。`;
}

function buildSystemPrompt(
  personality: AIPlayerPersonality,
  profile: AIProfileWeights,
  decisionMode: AIDecisionMode,
  overrides?: LLMRequestConfig['prompts']
): string {
  const ruleAndTacticGuide = [
    '实战优先级: 阻断即将出线的对手 > 保障队友先手与接风 > 自身手数优化 > 保留关键炸弹资源。',
    '团队协作: 0/2同队，1/3同队；若队友占先且局势可控，优先考虑让牌，不盲目抬队友的牌。',
    '终盘原则: 对手剩1-2张时应显著提高压制强度；队友剩1-2张时可提高保护与让牌权重。',
    '资源原则: 炸弹/同花顺属于高价值资源，非关键阻断场景尽量保留。'
  ].join('\n');

  const common = [
    '你是掼蛋实战 AI，目标是在合法前提下尽量高效出牌。',
    '你必须严格遵守规则：只使用给定手牌，不允许编造新牌。',
    '你必须只输出 JSON，不要输出任何额外解释、注释、markdown。',
    ruleAndTacticGuide,
    buildPersonalityInstruction(personality, profile, overrides)
  ];

  if (decisionMode === 'candidate') {
    return [
      ...common,
      '你只能从候选动作列表中选择，不能创造新动作。',
      '返回 JSON 字段必须包含：reasoning、action、candidateIndex。',
      'reasoning：中文说明，不超过100字。',
      'action：只能是 "play" 或 "pass"，且必须与所选候选动作一致。',
      'candidateIndex：候选动作索引（整数）。',
      '固定输出结构：{"reasoning":"...","action":"play"|"pass","candidateIndex":0}。'
    ].join('\n');
  }

  return [
    ...common,
    '请严格按照 JSON 格式返回，必须包含以下三个字段：reasoning、action、cards。',
    'reasoning：一段中文内心独白（不超过100字），解释为什么这样出牌或Pass。',
    'action：只能是 "play" 或 "pass"。',
    'cards：决定出的卡牌 ID 数组；当 action 为 pass 时，cards 必须是空数组。',
    '固定输出结构：{"reasoning":"...","action":"play"|"pass","cards":["card_id_1","card_id_2"]}。'
  ].join('\n');
}

function buildUserPrompt(
  handCards: RuntimeCard[],
  lastPlay: LastPlayInput,
  currentLevel: string,
  context: BattleContext | undefined,
  decisionMode: AIDecisionMode,
  candidates: CandidateMove[]
): string {
  const contextLines = [];
  if (context) {
    contextLines.push('========== 场上态势 ==========');
    contextLines.push(`你的座位: ${context.mySeat}号位, 你的队友是 ${context.teammateSeat}号位。`);
    contextLines.push(`已出线名次顺序: ${context.finishedSeats.length > 0 ? context.finishedSeats.join(' -> ') : '暂无'} (顺序代表 头游 -> 二游 -> 三游)`);

    for (const p of context.players) {
      const relation = p.seat === context.mySeat ? '你' : (p.isTeammate ? '队友' : '对手');
      const rankText = p.rank ? ` [已出线，名次: 第${p.rank}]` : '';
      contextLines.push(`[${p.seat}号位 - ${relation}] 剩余手牌数: ${p.cardsLeft}张${rankText}`);
    }

    if (lastPlay && typeof lastPlay.playerSeat === 'number') {
      const isLastPlayTeammate = lastPlay.playerSeat === context.teammateSeat;
      const isLastPlaySelf = lastPlay.playerSeat === context.mySeat;
      const lastPlayer = context.players.find(p => p.seat === lastPlay.playerSeat);
      const isLastPlayerFinished = !!lastPlayer?.rank;

      let lpRelation = isLastPlaySelf ? '你自己' : (isLastPlayTeammate ? '你的队友' : '对手');
      if (isLastPlayerFinished) {
        lpRelation += ' (该玩家已出线，若此轮无人接牌将由队友【接风】)';
      }
      contextLines.push(`上一手牌的打出者: ${lastPlay.playerSeat}号位 (${lpRelation})`);
    }
    contextLines.push('==============================');
  }

  const allGroupings = generateAllGroupings(handCards, context);
  const groupingsText = allGroupings.map(g => {
    const groupsString = JSON.stringify(g.groups.map(group => group.map(c => c.id)));
    return `[策略: ${g.strategyName} (评分:${g.score})] ${groupsString}`;
  }).join('\n');

  const candidateLines =
    decisionMode === 'candidate'
      ? [
        '可选动作列表（只能选其中一个）:',
        JSON.stringify(
          candidates.map((candidate, index) => ({
            index,
            action: candidate.action,
            patternType: candidate.patternType,
            powerLevel: candidate.powerLevel,
            score: candidate.score ?? null,
            cardIds: candidate.cards.map((card) => card.id),
            summary: candidate.summary,
            tacticHints: candidate.tacticHints ?? []
          }))
        )
      ]
      : [];

  return [
    ...contextLines,
    `当前级牌（打X）: ${currentLevel}`,
    `你的手牌（仅可使用这些牌，无序排列）: ${JSON.stringify(serializeCards(handCards))}`,
    `为了方便你理解牌力，系统自动将手牌进行了理牌（组合成常用牌型供你参考）: ${JSON.stringify(autoGroupCards(handCards).map(group => group.map(c => c.id)))}`,
    lastPlay
      ? `桌面上一手牌: ${JSON.stringify(serializeCards(lastPlay.cards))}`
      : `桌面上一手牌: 无 (此刻是新一轮首出！你可以自由打出任何合法的牌型！)`,
    ...candidateLines,
    '请返回你的决策 JSON。'
  ].join('\n');
}

function buildFallbackReasoning(move: CandidateMove): string {
  if (move.action === 'pass') {
    const hint = move.tacticHints?.[0];
    return hint ? `根据策略评估，选择不出：${hint}` : '根据策略评估，当前选择不出';
  }
  const hint = move.tacticHints?.[0];
  if (hint) {
    return `根据策略评估，执行 ${move.summary}：${hint}`;
  }
  return `根据策略评估，执行 ${move.summary}`;
}

function withSpeech(
  decision: NextPlayDecision,
  personality: AIPlayerPersonality,
  style?: AISpeechStyle,
  tauntLevel?: AITauntLevel
): NextPlayDecision {
  const normalizedSpeech = decision.speech?.trim();
  if (normalizedSpeech) {
    return {
      ...decision,
      speech: clampSpeechText(normalizedSpeech, 60)
    };
  }

  return {
    ...decision,
    speech: buildAISpeech(decision.cards.length > 0 ? 'play' : 'pass', decision.reasoning, personality, style, tauntLevel)
  };
}

function calculateStrategicNextPlay(
  handCards: RuntimeCard[],
  lastPlay: LastPlayInput,
  profile: AIProfileWeights,
  context?: BattleContext
): NextPlayDecision {
  const tactical = resolveTacticalSignals(lastPlay, context);
  const candidates = buildCandidateMoves(handCards, lastPlay, profile, context);
  const best = candidates.reduce<CandidateMove | null>((top, current) => {
    if (!top) {
      return current;
    }
    const topScore = top.score ?? Number.NEGATIVE_INFINITY;
    const currentScore = current.score ?? Number.NEGATIVE_INFINITY;
    return currentScore > topScore ? current : top;
  }, null);
  if (!best || best.action === 'pass') {
    return {
      cards: [],
      reasoning: buildFallbackReasoning(best ?? { action: 'pass', cards: [], summary: 'Pass（不出）', patternType: 'pass', powerLevel: 0 }),
      decisionInsight: {
        decisionMode: 'candidate',
        tacticalSignals: toPublicTacticalSignals(tactical),
        selectedAction: 'pass',
        selectedSummary: best?.summary ?? 'Pass（不出）',
        selectedScore: best?.score,
        topCandidates: toCandidateInsights(candidates)
      }
    };
  }

  return {
    cards: best.cards,
    reasoning: buildFallbackReasoning(best),
    decisionInsight: {
      decisionMode: 'candidate',
      tacticalSignals: toPublicTacticalSignals(tactical),
      selectedAction: best.action,
      selectedSummary: best.summary,
      selectedScore: best.score,
      topCandidates: toCandidateInsights(candidates)
    }
  };
}

export function calculateBattleNextPlay(
  handCards: RuntimeCard[],
  lastPlay: LastPlayInput,
  personality: AIPlayerPersonality,
  context: BattleContext,
  runtimeConfig?: LLMRequestConfig
): NextPlayDecision {
  const profile = resolvePersonalityProfile(personality, runtimeConfig?.profiles);
  return calculateStrategicNextPlay(handCards, lastPlay, profile, context);
}

export function calculateNextPlay(handCards: RuntimeCard[], lastPlay: LastPlayInput): NextPlayDecision {
  const naturalCards = handCards
    .filter((card) => !card.isWildcard)
    .sort(compareCardByLogic);

  if (naturalCards.length === 0) {
    return {
      cards: [],
      reasoning: '根据基础规则，当前无可用牌'
    };
  }

  // 场景 A：首发，打最小非百搭单牌
  if (!lastPlay || lastPlay.cards.length === 0) {
    return {
      cards: [naturalCards[0]],
      reasoning: '根据基础规则，打出最小单牌'
    };
  }

  const lastPattern = identifyPattern(lastPlay.cards);
  if (!lastPattern.isValid) {
    return {
      cards: [],
      reasoning: '根据基础规则，牌型不明先过'
    };
  }

  // 场景 B-1：接单张
  if (lastPattern.patternType === 'single' && lastPlay.cards.length === 1) {
    for (const card of naturalCards) {
      const attempt = [card];
      if (canBeat(attempt, lastPlay.cards)) {
        return {
          cards: attempt,
          reasoning: '根据基础规则，最小压单'
        };
      }
    }
    return {
      cards: [],
      reasoning: '根据基础规则，压不过先过'
    };
  }

  // 场景 B-2：接对子
  if (lastPattern.patternType === 'pair' && lastPlay.cards.length === 2) {
    const pairCandidates = buildNaturalPairCandidates(naturalCards);
    for (const pairCards of pairCandidates) {
      if (canBeat(pairCards, lastPlay.cards)) {
        return {
          cards: pairCards,
          reasoning: '根据基础规则，最小压对'
        };
      }
    }
    return {
      cards: [],
      reasoning: '根据基础规则，对子压不过'
    };
  }

  // 其他复杂牌型暂不处理
  return {
    cards: [],
    reasoning: '根据基础规则，复杂牌型先过'
  };
}

export async function askLLMForNextPlay(
  handCards: RuntimeCard[],
  lastPlay: LastPlayInput,
  currentLevel: string,
  personality: AIPlayerPersonality,
  battleContext?: BattleContext,
  runtimeConfig?: LLMRequestConfig
): Promise<NextPlayDecision> {
  const timeoutMs = Math.max(200, Math.floor(runtimeConfig?.timeoutMs ?? LLM_BATTLE_TIMEOUT_MS));
  const seat = typeof runtimeConfig?.seat === 'number' ? runtimeConfig.seat : 'unknown';
  const decisionMode = resolveDecisionMode(runtimeConfig?.decisionMode);
  const speechStyle = resolveSpeechStyle(runtimeConfig?.speechStyle);
  const tauntLevel = resolveTauntLevel(runtimeConfig?.tauntLevel);
  const profile = resolvePersonalityProfile(personality, runtimeConfig?.profiles);
  const fallback = () =>
    battleContext
      ? calculateBattleNextPlay(handCards, lastPlay, personality, battleContext, runtimeConfig)
      : calculateNextPlay(handCards, lastPlay);
  const candidates = decisionMode === 'candidate' ? buildCandidateMoves(handCards, lastPlay, profile, battleContext) : [];
  const tacticalSignalsForInsight = battleContext ? resolveTacticalSignals(lastPlay, battleContext) : undefined;
  const topCandidateInsights = decisionMode === 'candidate' ? toCandidateInsights(candidates) : undefined;
  const llmAttempted = Boolean(runtimeConfig?.apiKey?.trim() ?? process.env.LLM_API_KEY?.trim());
  let requestStartedAt = Date.now();
  let model = resolveModelName(runtimeConfig?.baseUrl?.trim() || process.env.LLM_BASE_URL, runtimeConfig?.model);
  let timeoutErrorTriggered = false;
  let parseErrorTriggered = false;
  let illegalOutputTriggered = false;

  const recordTurnMetric = (latencyMs: number, llmSuccess: boolean, fallbackUsed: boolean): void => {
    recordAITurnMetric({
      decisionMode,
      personality,
      model,
      latencyMs,
      llmAttempted,
      llmSuccess,
      fallback: fallbackUsed,
      timeoutError: timeoutErrorTriggered,
      parseError: parseErrorTriggered,
      illegalOutput: illegalOutputTriggered
    });
  };

  try {
    const apiKey = runtimeConfig?.apiKey?.trim() ?? '';
    const baseUrl = runtimeConfig?.baseUrl?.trim() ?? '';
    const client = getLLMClient(apiKey || undefined, baseUrl || undefined);
    model = resolveModelName(baseUrl || process.env.LLM_BASE_URL, runtimeConfig?.model);

    logLLMBlock('🛫 [LLM Request]', LOG_COLORS.cyan, {
      seat,
      personality,
      decisionMode,
      profile,
      model,
      timeoutMs,
      candidateCount: candidates.length,
      hand: summarizeHandForLog(handCards),
      lastPlay: summarizeLastPlayForLog(lastPlay)
    });

    if (!client) {
      throw new Error('LLM API Key 未配置或客户端初始化失败');
    }

    const messages: any[] = [
      {
        role: 'system',
        content: buildSystemPrompt(personality, profile, decisionMode, runtimeConfig?.prompts)
      },
      {
        role: 'user',
        content: buildUserPrompt(handCards, lastPlay, currentLevel, battleContext, decisionMode, candidates)
      }
    ];

    let retries = 1;
    let lastErrorReason = '';

    while (retries >= 0) {
      requestStartedAt = Date.now();
      const response = await withTimeout(
        client.chat.completions.create({
          model,
          temperature: 0.2,
          messages
        }),
        timeoutMs
      );
      const latencyMs = Date.now() - requestStartedAt;
      logLLMLine(
        '⏱️ [LLM Latency]',
        LOG_COLORS.yellow,
        `seat=${seat} model=${model} ${latencyMs}ms (${(latencyMs / 1000).toFixed(2)}s) [剩余重试: ${retries}]`
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('LLM 返回空响应');
      }

      logLLMBlock('📥 [LLM Raw Response]', LOG_COLORS.magenta, content);

      try {
        if (decisionMode === 'candidate') {
          const decision = parseCandidateDecision(content, candidates.length);
          const selectedMove = candidates[decision.candidateIndex];
          if (!selectedMove) {
            throw new Error(`候选动作不存在: ${decision.candidateIndex}`);
          }
          if (selectedMove.action !== decision.action) {
            throw new Error('LLM action 与候选动作不一致');
          }

          if (selectedMove.action === 'pass') {
            logLLMBlock('✅ [LLM Decision]', LOG_COLORS.green, {
              seat,
              personality,
              decisionMode,
              action: 'pass',
              candidateIndex: decision.candidateIndex,
              reasoning: decision.reasoning,
              cards: []
            });
            recordTurnMetric(latencyMs, true, false);
            return withSpeech({
              cards: [],
              reasoning: decision.reasoning,
              decisionInsight: {
                decisionMode,
                tacticalSignals: toPublicTacticalSignals(tacticalSignalsForInsight),
                selectedAction: 'pass',
                selectedCandidateIndex: decision.candidateIndex,
                selectedSummary: selectedMove.summary,
                selectedScore: selectedMove.score,
                topCandidates: topCandidateInsights
              }
            }, personality, speechStyle, tauntLevel);
          }

          if (!isLegalAttempt(selectedMove.cards, lastPlay)) {
            illegalOutputTriggered = true;
            throw new Error('候选动作不合法（无法压过上一手或牌型非法）');
          }

          logLLMBlock('✅ [LLM Decision]', LOG_COLORS.green, {
            seat,
            personality,
            decisionMode,
            action: 'play',
            candidateIndex: decision.candidateIndex,
            reasoning: decision.reasoning,
            cards: selectedMove.cards.map(formatCardForLog)
          });
          recordTurnMetric(latencyMs, true, false);
          return withSpeech({
            cards: selectedMove.cards,
            reasoning: decision.reasoning,
            decisionInsight: {
              decisionMode,
              tacticalSignals: toPublicTacticalSignals(tacticalSignalsForInsight),
              selectedAction: 'play',
              selectedCandidateIndex: decision.candidateIndex,
              selectedSummary: selectedMove.summary,
              selectedScore: selectedMove.score,
              topCandidates: topCandidateInsights
            }
          }, personality, speechStyle, tauntLevel);
        }

        const decision = parseLegacyDecision(content);
        if (decision.action === 'pass') {
          logLLMBlock('✅ [LLM Decision]', LOG_COLORS.green, {
            seat,
            personality,
            decisionMode,
            action: 'pass',
            reasoning: decision.reasoning,
            cards: []
          });
          recordTurnMetric(latencyMs, true, false);
          return withSpeech({
            cards: [],
            reasoning: decision.reasoning,
            decisionInsight: {
              decisionMode,
              tacticalSignals: toPublicTacticalSignals(tacticalSignalsForInsight),
              selectedAction: 'pass'
            }
          }, personality, speechStyle, tauntLevel);
        }

        const selectedCards = mapCardIdsToRuntimeCards(handCards, decision.cardIds);
        if (!isLegalAttempt(selectedCards, lastPlay)) {
          illegalOutputTriggered = true;
          throw new Error('LLM 返回了不合法出牌（牌型错误或无法压过上一手）。');
        }

        logLLMBlock('✅ [LLM Decision]', LOG_COLORS.green, {
          seat,
          personality,
          decisionMode,
          action: 'play',
          reasoning: decision.reasoning,
          cards: selectedCards.map(formatCardForLog)
        });
        recordTurnMetric(latencyMs, true, false);
        return withSpeech({
          cards: selectedCards,
          reasoning: decision.reasoning,
          decisionInsight: {
            decisionMode,
            tacticalSignals: toPublicTacticalSignals(tacticalSignalsForInsight),
            selectedAction: 'play'
          }
        }, personality, speechStyle, tauntLevel);
      } catch (err) {
        lastErrorReason = err instanceof Error ? err.message : '未知解析错误';
        parseErrorTriggered = true;
        if (
          lastErrorReason.includes('不合法出牌') ||
          lastErrorReason.includes('不在手牌中') ||
          lastErrorReason.includes('候选动作不合法') ||
          lastErrorReason.includes('candidateIndex 越界')
        ) {
          illegalOutputTriggered = true;
        }
        if (retries > 0) {
          logLLMLine('♻️ [LLM Retry]', LOG_COLORS.yellow, `seat=${seat} 触发重试原因: ${lastErrorReason}`);
          messages.push({ role: 'assistant', content });
          messages.push({
            role: 'user',
            content: `你的返回存在错误: ${lastErrorReason} 请重新检查你的手牌、上一手牌要求以及返回格式，严格按照规则重试一次！`
          });
          retries -= 1;
          continue;
        }
        throw new Error(lastErrorReason);
      }
    }

    throw new Error(lastErrorReason);
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误';
    timeoutErrorTriggered = /timed out after|timeout/i.test(reason);
    const fallbackDecision = fallback();
    const latencyMs = Date.now() - requestStartedAt;
    logLLMBlock('❌ [LLM Fallback]', LOG_COLORS.red, {
      seat,
      personality,
      decisionMode,
      reason,
      latencyMs,
      fallbackAction: fallbackDecision.cards.length > 0 ? 'play' : 'pass',
      fallbackReasoning: fallbackDecision.reasoning,
      fallbackCards: fallbackDecision.cards.map(formatCardForLog),
      message: '已触发降级策略，使用基础贪心算法出牌/Pass。'
    });
    recordTurnMetric(latencyMs, false, true);
    return withSpeech(fallbackDecision, personality, speechStyle, tauntLevel);
  }
}

export async function pingLLMConnectivity(runtimeConfig?: LLMRequestConfig): Promise<LLMConnectivityResult> {
  const apiKey = runtimeConfig?.apiKey?.trim() || process.env.LLM_API_KEY?.trim() || '';
  const baseUrl = runtimeConfig?.baseUrl?.trim() || process.env.LLM_BASE_URL?.trim() || '';
  const model = resolveModelName(baseUrl || process.env.LLM_BASE_URL, runtimeConfig?.model);

  if (!apiKey) {
    return {
      success: false,
      message: 'API Key 不能为空',
      model,
      latencyMs: 0,
      errorType: 'missing_api_key'
    };
  }

  const client = getLLMClient(apiKey, baseUrl || undefined);
  if (!client) {
    return {
      success: false,
      message: '初始化 LLM 客户端失败',
      model,
      latencyMs: 0,
      errorType: 'client_init_failed'
    };
  }

  const startedAt = Date.now();
  try {
    await withTimeout(
      client.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You are a connectivity probe.'
          },
          {
            role: 'user',
            content: 'Reply with OK.'
          }
        ]
      }),
      LLM_CONNECTIVITY_TIMEOUT_MS
    );

    return {
      success: true,
      message: '连通性测试通过',
      model,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    const details = resolveConnectivityError(error);
    return {
      success: false,
      message: details.message,
      model,
      latencyMs: Date.now() - startedAt,
      statusCode: details.statusCode,
      errorType: details.errorType
    };
  }
}
