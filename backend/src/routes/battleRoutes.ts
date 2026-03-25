import { Request, Response, Router } from 'express';
import { RuntimeCard } from '../core/cardEngine';
import {
  advanceBattle,
  advanceBattleWithProgress,
  getBattleMatch,
  getRecentBattleMatches,
  getBattleTimeline,
  persistBattleMatch,
  removeActiveMatch,
  startNextBattleRound,
  startBattle,
  submitBattleTributeSelection,
  submitPlay,
  submitPlayWithProgress,
  toBattleViewState,
  type BattleMode,
  type ReturnTributeRule
} from '../services/battleService';
import type { AIDecisionMode, AIPlayerPersonality, AIProfileWeights, AISpeechStyle, AITauntLevel, LLMRequestConfig } from '../services/aiService';
import { autoGroupCards, generateAllGroupings } from '../services/autoGrouper';
import type { GroupingContext, GroupingContextPlayer } from '../services/autoGrouper';
import { getAIMetricsSnapshot, resetAIMetrics } from '../services/aiMetricsService';

const router = Router();
const DEFAULT_PLAYER_ID = 'player1';
const VALID_PERSONALITIES = new Set<AIPlayerPersonality>(['aggressive', 'balanced', 'conservative']);
const VALID_DECISION_MODES = new Set<AIDecisionMode>(['candidate', 'legacy']);
const VALID_SPEECH_STYLES = new Set<AISpeechStyle>(['restrained', 'normal', 'taunt']);
const VALID_TAUNT_LEVELS = new Set<AITauntLevel>(['mild', 'medium', 'heavy']);
const VALID_BATTLE_MODES = new Set<BattleMode>(['human_vs_ai', 'ai_vs_ai']);

function readPlayerId(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.trim();
  }
  return DEFAULT_PLAYER_ID;
}

function readBattleMode(raw: unknown): BattleMode {
  if (typeof raw !== 'string') {
    return 'human_vs_ai';
  }
  const normalized = raw.trim() as BattleMode;
  return VALID_BATTLE_MODES.has(normalized) ? normalized : 'human_vs_ai';
}

function readAntiTributeEnabled(req: Request): boolean {
  const headerValue = req.header('x-battle-anti-tribute');
  if (typeof headerValue === 'string') {
    const normalized = headerValue.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0' || normalized === 'off') {
      return false;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'on') {
      return true;
    }
  }

  if (typeof req.body?.antiTributeEnabled === 'boolean') {
    return req.body.antiTributeEnabled;
  }

  return true;
}

function readDoubleDownTributeEnabled(req: Request): boolean {
  const headerValue = req.header('x-battle-double-down-tribute');
  if (typeof headerValue === 'string') {
    const normalized = headerValue.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0' || normalized === 'off') {
      return false;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'on') {
      return true;
    }
  }

  if (typeof req.body?.doubleDownTributeEnabled === 'boolean') {
    return req.body.doubleDownTributeEnabled;
  }

  return true;
}

function readReturnTributeRule(req: Request): ReturnTributeRule {
  const headerValue = req.header('x-battle-return-tribute-rule');
  if (typeof headerValue === 'string') {
    const normalized = headerValue.trim() as ReturnTributeRule;
    if (normalized === 'lowest_only' || normalized === 'any_lower') {
      return normalized;
    }
  }

  const bodyValue = req.body?.returnTributeRule;
  if (bodyValue === 'lowest_only' || bodyValue === 'any_lower') {
    return bodyValue;
  }

  return 'any_lower';
}

function readBattleModeFilter(raw: unknown): BattleMode | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const normalized = raw.trim() as BattleMode;
  return VALID_BATTLE_MODES.has(normalized) ? normalized : undefined;
}

function resolveErrorStatus(message: string): number {
  if (message.includes('不存在') || message.includes('已结束')) {
    return 404;
  }
  return 400;
}

function decodeHeaderValue(raw: string | undefined): string | undefined {
  if (!raw || raw.trim() === '') {
    return undefined;
  }
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

function parsePersonality(raw: string | undefined): AIPlayerPersonality | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim() as AIPlayerPersonality;
  return VALID_PERSONALITIES.has(normalized) ? normalized : undefined;
}

function parseDecisionMode(raw: string | undefined): AIDecisionMode | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim() as AIDecisionMode;
  return VALID_DECISION_MODES.has(normalized) ? normalized : undefined;
}

function parseSpeechStyle(raw: string | undefined): AISpeechStyle | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim() as AISpeechStyle;
  return VALID_SPEECH_STYLES.has(normalized) ? normalized : undefined;
}

function parseTauntLevel(raw: string | undefined): AITauntLevel | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim() as AITauntLevel;
  return VALID_TAUNT_LEVELS.has(normalized) ? normalized : undefined;
}

function clampWeight(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseProfileHeader(raw: string | undefined): Partial<AIProfileWeights> | undefined {
  const decoded = decodeHeaderValue(raw);
  if (!decoded) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(decoded) as Partial<AIProfileWeights> | null;
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }

    const profile: Partial<AIProfileWeights> = {};
    if (typeof parsed.aggression === 'number') {
      profile.aggression = clampWeight(parsed.aggression);
    }
    if (typeof parsed.bombConservation === 'number') {
      profile.bombConservation = clampWeight(parsed.bombConservation);
    }
    if (typeof parsed.teammateSupport === 'number') {
      profile.teammateSupport = clampWeight(parsed.teammateSupport);
    }
    if (typeof parsed.endgameRisk === 'number') {
      profile.endgameRisk = clampWeight(parsed.endgameRisk);
    }

    return Object.keys(profile).length > 0 ? profile : undefined;
  } catch {
    return undefined;
  }
}

function readLLMConfig(req: Request): LLMRequestConfig {
  const apiKey = req.header('x-llm-api-key')?.trim() ?? '';
  const baseUrl = req.header('x-llm-base-url')?.trim() ?? '';
  const model = req.header('x-llm-model')?.trim() ?? '';
  const timeoutMsRaw = req.header('x-llm-timeout-ms')?.trim() ?? '';
  const timeoutMs = parseInt(timeoutMsRaw, 10);
  const pAgg = decodeHeaderValue(req.header('x-llm-prompt-aggressive'));
  const pCon = decodeHeaderValue(req.header('x-llm-prompt-conservative'));
  const pBal = decodeHeaderValue(req.header('x-llm-prompt-balanced'));
  const decisionMode = parseDecisionMode(req.header('x-llm-decision-mode'));
  const speechStyle = parseSpeechStyle(req.header('x-llm-speech-style'));
  const tauntLevel = parseTauntLevel(req.header('x-llm-taunt-level'));

  const s0P = parsePersonality(req.header('x-llm-seat0-personality'));
  const s1P = parsePersonality(req.header('x-llm-seat1-personality'));
  const s2P = parsePersonality(req.header('x-llm-seat2-personality'));
  const s3P = parsePersonality(req.header('x-llm-seat3-personality'));

  const profAgg = parseProfileHeader(req.header('x-llm-profile-aggressive'));
  const profBal = parseProfileHeader(req.header('x-llm-profile-balanced'));
  const profCon = parseProfileHeader(req.header('x-llm-profile-conservative'));

  return {
    apiKey: apiKey || undefined,
    baseUrl: baseUrl || undefined,
    model: model || undefined,
    timeoutMs: isNaN(timeoutMs) || timeoutMs <= 0 ? undefined : timeoutMs,
    decisionMode,
    speechStyle,
    tauntLevel,
    prompts: {
      aggressive: pAgg || undefined,
      conservative: pCon || undefined,
      balanced: pBal || undefined,
    },
    profiles: {
      aggressive: profAgg,
      balanced: profBal,
      conservative: profCon
    },
    seatPersonalities: {
      0: s0P,
      1: s1P,
      2: s2P,
      3: s3P
    }
  };
}

function isRuntimeCard(candidate: unknown): candidate is RuntimeCard {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const card = candidate as Partial<RuntimeCard>;
  return (
    typeof card.id === 'string' &&
    typeof card.rank === 'string' &&
    typeof card.suit === 'string' &&
    typeof card.logicValue === 'number' &&
    typeof card.deckIndex === 'number' &&
    typeof card.isWildcard === 'boolean' &&
    typeof card.isSelected === 'boolean'
  );
}

function parseGroupingContext(raw: unknown): GroupingContext {
  const fallback: GroupingContext = { mode: 'battle' };
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const payload = raw as {
    players?: unknown;
    currentTurn?: unknown;
    currentLevel?: unknown;
    lastPlay?: unknown;
  };

  const players: GroupingContextPlayer[] = Array.isArray(payload.players)
    ? payload.players
      .map((item): GroupingContextPlayer | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const player = item as Partial<GroupingContextPlayer>;
        if (typeof player.cardsLeft !== 'number') {
          return null;
        }

        return {
          cardsLeft: player.cardsLeft,
          isTeammate: typeof player.isTeammate === 'boolean' ? player.isTeammate : undefined,
          rank: typeof player.rank === 'number' ? player.rank : undefined
        };
      })
      .filter((item): item is GroupingContextPlayer => item !== null)
    : [];

  return {
    mode: 'battle',
    players,
    currentTurn: typeof payload.currentTurn === 'number' ? payload.currentTurn : undefined,
    currentLevel: typeof payload.currentLevel === 'string' ? payload.currentLevel : undefined,
    lastPlay: payload.lastPlay
  };
}

function writeSSEvent(res: Response, event: string, payload: unknown): void {
  if (res.writableEnded) {
    return;
  }

  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * @route   POST /api/battle/start
 * @desc    初始化实战对局
 * @access  Public
 */
router.post('/start', async (req, res) => {
  try {
    const playerId = readPlayerId(req.body?.playerId);
    const battleMode = readBattleMode(req.body?.battleMode);
    const antiTributeEnabled = readAntiTributeEnabled(req);
    const doubleDownTributeEnabled = readDoubleDownTributeEnabled(req);
    const returnTributeRule = readReturnTributeRule(req);
    const match = startBattle({ battleMode, antiTributeEnabled, doubleDownTributeEnabled, returnTributeRule });
    await persistBattleMatch(match);
    const state = toBattleViewState(match, playerId);

    return res.status(200).json({
      success: true,
      message: '实战对局初始化成功',
      ...state
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(resolveErrorStatus(message)).json({
      success: false,
      message
    });
  }
});

/**
 * @route   POST /api/battle/advance
 * @desc    推进当前对局中的 AI 轮次（支持全 AI 观战）
 * @access  Public
 */
router.post('/advance', async (req, res) => {
  try {
    const { matchId } = req.body ?? {};
    const playerId = readPlayerId(req.body?.playerId);
    const cleanupWhenFinished = req.body?.cleanupWhenFinished === true;
    const llmConfig = readLLMConfig(req);

    if (typeof matchId !== 'string' || matchId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'matchId 不能为空'
      });
    }

    const outcome = await advanceBattle(matchId.trim(), playerId, llmConfig);
    const state = toBattleViewState(outcome.match, playerId);
    if (cleanupWhenFinished) {
      removeActiveMatch(matchId.trim());
    }

    return res.status(200).json({
      success: true,
      message: 'AI 自动推进完成',
      turnEvents: outcome.turnEvents,
      ...state
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(resolveErrorStatus(message)).json({
      success: false,
      message
    });
  }
});

/**
 * @route   POST /api/battle/auto-group
 * @desc    实战模式智能理牌（支持当前剩余手牌张数）
 * @access  Public
 */
router.post('/auto-group', (req, res) => {
  try {
    const cards = req.body?.cards;
    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供 cards 数组'
      });
    }

    if (cards.some((card) => !isRuntimeCard(card))) {
      return res.status(400).json({
        success: false,
        message: 'cards 中包含无效牌数据'
      });
    }

    const context = parseGroupingContext(req.body?.context);
    const allGroupings = generateAllGroupings(cards as RuntimeCard[], context);
    const best = allGroupings[0] || { groups: [], strategyName: 'None' };
    return res.status(200).json({
      success: true,
      message: '实战智能理牌完成',
      groupedCards: best.groups,
      allGroupings,
      totalGroups: best.groups.length,
      totalCards: cards.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(500).json({
      success: false,
      message
    });
  }
});

/**
 * @route   GET /api/battle/state
 * @desc    获取实战对局当前状态（用于页面刷新后恢复）
 * @access  Public
 */
router.get('/state', async (req, res) => {
  try {
    const matchIdRaw = req.query?.matchId;
    const matchId = typeof matchIdRaw === 'string' ? matchIdRaw.trim() : '';
    const playerId = readPlayerId(req.query?.playerId);

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: 'matchId 不能为空'
      });
    }

    const match = await getBattleMatch(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: '对局不存在或已结束'
      });
    }

    const state = toBattleViewState(match, playerId);
    const timelineEntries = await getBattleTimeline(matchId, playerId);
    return res.status(200).json({
      success: true,
      message: '获取对局状态成功',
      timelineEntries,
      ...state
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(resolveErrorStatus(message)).json({
      success: false,
      message
    });
  }
});

router.post('/next-round', async (req, res) => {
  try {
    const { matchId } = req.body ?? {};
    const playerId = readPlayerId(req.body?.playerId);
    const llmConfig = readLLMConfig(req);

    if (typeof matchId !== 'string' || matchId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'matchId 不能为空'
      });
    }

    const match = await startNextBattleRound(matchId.trim(), playerId, llmConfig);
    const state = toBattleViewState(match, playerId);
    const message =
      state.lastRoundSummary?.antiTributeApplied
        ? `${state.lastRoundSummary.antiTributeReason ?? '触发抗贡'}，已直接进入下一局`
        : state.roundPhase === 'playing'
          ? '已进入下一局'
          : state.pendingTribute?.requiredAction === 'return'
            ? '下一局已准备，请先完成还贡'
            : '下一局已准备，请先完成交供';

    return res.status(200).json({
      success: true,
      message,
      ...state
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(resolveErrorStatus(message)).json({
      success: false,
      message
    });
  }
});

router.post('/tribute', async (req, res) => {
  try {
    const { matchId, cardId } = req.body ?? {};
    const playerId = readPlayerId(req.body?.playerId);
    const llmConfig = readLLMConfig(req);

    if (typeof matchId !== 'string' || matchId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'matchId 不能为空'
      });
    }
    if (typeof cardId !== 'string' || cardId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'cardId 不能为空'
      });
    }

    const match = await submitBattleTributeSelection(matchId.trim(), playerId, cardId.trim(), llmConfig);
    const state = toBattleViewState(match, playerId);

    return res.status(200).json({
      success: true,
      message: state.roundPhase === 'playing' ? '交供完成，下一局开始' : '交供已记录，请继续完成剩余步骤',
      ...state
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(resolveErrorStatus(message)).json({
      success: false,
      message
    });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const battleMode = readBattleModeFilter(req.query?.battleMode);
    const limitRaw = typeof req.query?.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isNaN(limitRaw) ? 12 : limitRaw;
    const sessions = await getRecentBattleMatches(battleMode, limit);

    return res.status(200).json({
      success: true,
      sessions
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(500).json({
      success: false,
      message
    });
  }
});

/**
 * @route   POST /api/battle/play
 * @desc    提交实战出牌（空数组代表 Pass）
 * @access  Public
 */
router.post('/play', async (req, res) => {
  try {
    const { matchId, cards } = req.body ?? {};
    const playerId = readPlayerId(req.body?.playerId);
    const llmConfig = readLLMConfig(req);

    if (typeof matchId !== 'string' || matchId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'matchId 不能为空'
      });
    }

    if (!Array.isArray(cards)) {
      return res.status(400).json({
        success: false,
        message: 'cards 必须为数组，空数组表示 Pass'
      });
    }

    const outcome = await submitPlay(matchId.trim(), playerId, cards as RuntimeCard[], llmConfig);
    const state = toBattleViewState(outcome.match, playerId);

    return res.status(200).json({
      success: true,
      message: '操作成功',
      turnEvents: outcome.turnEvents,
      ...state
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(resolveErrorStatus(message)).json({
      success: false,
      message
    });
  }
});

/**
 * @route   POST /api/battle/play/stream
 * @desc    提交实战出牌并流式推送 AI 实时决策
 * @access  Public
 */
router.post('/play/stream', async (req, res) => {
  const { matchId, cards } = req.body ?? {};
  const playerId = readPlayerId(req.body?.playerId);
  const llmConfig = readLLMConfig(req);

  if (typeof matchId !== 'string' || matchId.trim() === '') {
    res.status(400).json({
      success: false,
      message: 'matchId 不能为空'
    });
    return;
  }

  if (!Array.isArray(cards)) {
    res.status(400).json({
      success: false,
      message: 'cards 必须为数组，空数组表示 Pass'
    });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let clientClosed = false;
  const heartbeat = setInterval(() => {
    if (clientClosed || res.writableEnded) {
      return;
    }
    res.write(': ping\n\n');
  }, 15000);

  const markClientClosed = () => {
    clientClosed = true;
    clearInterval(heartbeat);
  };

  req.on('aborted', markClientClosed);
  res.on('close', markClientClosed);

  try {
    writeSSEvent(res, 'ready', {
      success: true,
      matchId: matchId.trim()
    });

    const outcome = await submitPlayWithProgress(matchId.trim(), playerId, cards as RuntimeCard[], llmConfig, {
      onPlayerActionApplied: async ({ action, cards: appliedCards, match }) => {
        if (clientClosed || res.writableEnded) {
          return;
        }
        writeSSEvent(res, 'player_action_applied', {
          action,
          cards: appliedCards,
          state: {
            success: true,
            message: '玩家动作已提交',
            ...toBattleViewState(match, playerId)
          }
        });
      },
      onAiTurnStart: async ({ playerId: aiPlayerId, playerSeat, match }) => {
        if (clientClosed || res.writableEnded) {
          return;
        }
        writeSSEvent(res, 'ai_turn_start', {
          playerId: aiPlayerId,
          playerSeat,
          state: {
            success: true,
            message: 'AI 开始思考',
            ...toBattleViewState(match, playerId)
          }
        });
      },
      onAiTurnEvent: async ({ event, match }) => {
        if (clientClosed || res.writableEnded) {
          return;
        }
        writeSSEvent(res, 'ai_turn_event', {
          event,
          state: {
            success: true,
            message: 'AI 已完成本次动作',
            ...toBattleViewState(match, playerId)
          }
        });
      }
    });

    const state = toBattleViewState(outcome.match, playerId);
    writeSSEvent(res, 'complete', {
      success: true,
      message: '操作成功',
      turnEvents: outcome.turnEvents,
      ...state
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';

    if (!res.writableEnded) {
      writeSSEvent(res, 'error', {
        success: false,
        message
      });
    }
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      res.end();
    }
  }
});

/**
 * @route   POST /api/battle/advance/stream
 * @desc    流式推进 AI 自动对战/观战
 * @access  Public
 */
router.post('/advance/stream', async (req, res) => {
  const { matchId } = req.body ?? {};
  const playerId = readPlayerId(req.body?.playerId);
  const llmConfig = readLLMConfig(req);

  if (typeof matchId !== 'string' || matchId.trim() === '') {
    res.status(400).json({
      success: false,
      message: 'matchId 不能为空'
    });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let clientClosed = false;
  const heartbeat = setInterval(() => {
    if (clientClosed || res.writableEnded) {
      return;
    }
    res.write(': ping\n\n');
  }, 15000);

  const markClientClosed = () => {
    clientClosed = true;
    clearInterval(heartbeat);
  };

  req.on('aborted', markClientClosed);
  res.on('close', markClientClosed);

  try {
    writeSSEvent(res, 'ready', {
      success: true,
      matchId: matchId.trim()
    });

    const outcome = await advanceBattleWithProgress(matchId.trim(), playerId, llmConfig, {
      onAiTurnStart: async ({ playerId: aiPlayerId, playerSeat, match }) => {
        if (clientClosed || res.writableEnded) {
          return;
        }
        writeSSEvent(res, 'ai_turn_start', {
          playerId: aiPlayerId,
          playerSeat,
          state: {
            success: true,
            message: 'AI 开始思考',
            ...toBattleViewState(match, playerId)
          }
        });
      },
      onAiTurnEvent: async ({ event, match }) => {
        if (clientClosed || res.writableEnded) {
          return;
        }
        writeSSEvent(res, 'ai_turn_event', {
          event,
          state: {
            success: true,
            message: 'AI 已完成本次动作',
            ...toBattleViewState(match, playerId)
          }
        });
      }
    });

    const state = toBattleViewState(outcome.match, playerId);
    writeSSEvent(res, 'complete', {
      success: true,
      message: 'AI 自动推进完成',
      turnEvents: outcome.turnEvents,
      ...state
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';

    if (!res.writableEnded) {
      writeSSEvent(res, 'error', {
        success: false,
        message
      });
    }
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      res.end();
    }
  }
});

/**
 * @route   GET /api/battle/metrics
 * @desc    获取 AI 决策与对局指标快照
 * @access  Public
 */
router.get('/metrics', (_req, res) => {
  return res.status(200).json({
    success: true,
    ...getAIMetricsSnapshot()
  });
});

/**
 * @route   POST /api/battle/metrics/reset
 * @desc    重置内存指标（测试/调试使用）
 * @access  Public
 */
router.post('/metrics/reset', (_req, res) => {
  resetAIMetrics();
  return res.status(200).json({
    success: true,
    message: 'metrics reset'
  });
});

export default router;
