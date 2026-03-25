/**
 * 游戏服务层 - 处理对局操作和数据库写入
 */

import { identifyPattern, PatternResult } from '../core/ruleValidator';
import { RuntimeCard } from '../core/cardEngine';
import { PrismaClient } from '@prisma/client';
import { ActionType } from '@prisma/client';

const prisma = new PrismaClient();
const PLAYER_INDEX_BY_ID: Record<string, number> = {
  player1: 0,
  player2: 1,
  player3: 2,
  player4: 3
};

/**
 * 验证出牌输入
 */
function validatePlayInput(matchId: string, playerId: string, cards: RuntimeCard[]): string | null {
  if (!matchId || matchId.trim() === '') {
    return '对局ID不能为空';
  }
  
  if (!playerId || playerId.trim() === '') {
    return '玩家ID不能为空';
  }
  
  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return '牌组不能为空';
  }
  
  // 验证每张牌的必需字段
  for (const card of cards) {
    if (!card.id || !card.rank || !card.suit) {
      return '牌组包含无效的牌对象';
    }
  }
  
  return null;
}

/**
 * 处理玩家出牌操作
 * @param matchId 对局ID
 * @param playerId 玩家ID
 * @param cards 玩家出的牌
 * @returns 操作结果
 */
export async function processPlay(
  matchId: string,
  playerId: string,
  cards: RuntimeCard[]
): Promise<{ success: boolean; message: string; patternResult?: PatternResult }> {
  try {
    // 0. 输入验证
    const validationError = validatePlayInput(matchId, playerId, cards);
    if (validationError) {
      return {
        success: false,
        message: validationError
      };
    }
    
    // 1. 校验牌型是否合法
    const patternResult = identifyPattern(cards);
    
    if (!patternResult.isValid) {
      return {
        success: false,
        message: '牌型不合法，请检查出牌规则'
      };
    }

    // TODO: 2. 获取当前步数（需要查询数据库获取对局的当前步数）
    const currentStep = await getCurrentStepNumber(matchId);

    // 3. 创建操作日志记录
    const actionLog = await prisma.actionLog.create({
      data: {
        matchId,
        stepNumber: currentStep + 1,
        playerId,
        actionType: ActionType.PLAY,
        cards: JSON.stringify(cards.map(card => card.id)), // 存储牌ID数组
      }
    });

    console.log(`✅ 出牌记录已保存: 对局 ${matchId}, 玩家 ${playerId}, 步数 ${currentStep + 1}`);

    return {
      success: true,
      message: '出牌成功',
      patternResult
    };

  } catch (error) {
    console.error('❌ 处理出牌时发生错误:', error);
    return {
      success: false,
      message: `服务器错误: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

/**
 * 获取对局的当前步数
 * @param matchId 对局ID
 * @returns 当前步数（如果没有记录则返回0）
 */
async function getCurrentStepNumber(matchId: string): Promise<number> {
  try {
    const latestLog = await prisma.actionLog.findFirst({
      where: { matchId },
      orderBy: { stepNumber: 'desc' },
      select: { stepNumber: true }
    });

    return latestLog?.stepNumber || 0;
  } catch (error) {
    console.error('❌ 获取当前步数时发生错误:', error);
    return 0;
  }
}

/**
 * 创建新对局
 * @param initialHands 初始手牌（4个玩家的牌组）
 * @returns 创建的对局记录
 */
export async function createMatch(initialHands: RuntimeCard[][]): Promise<{ matchId: string; success: boolean; message: string }> {
  try {
    const matchRecord = await prisma.matchRecord.create({
      data: {
        startTime: new Date(),
        initialHands: JSON.stringify(initialHands)
      }
    });

    return {
      matchId: matchRecord.id,
      success: true,
      message: '对局创建成功'
    };
  } catch (error) {
    console.error('❌ 创建对局时发生错误:', error);
    return {
      matchId: '',
      success: false,
      message: `创建对局失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

/**
 * 获取开局手牌（单个玩家）
 * @param matchId 对局ID
 * @param playerId 玩家标识，默认 player1
 */
export async function getInitialHands(
  matchId: string,
  playerId = 'player1'
): Promise<{ success: boolean; message: string; cards?: RuntimeCard[] }> {
  try {
    if (!matchId || matchId.trim() === '') {
      return {
        success: false,
        message: '对局ID不能为空'
      };
    }

    const normalizedPlayerId = playerId.trim().toLowerCase();
    const playerIndex = resolvePlayerIndex(normalizedPlayerId);
    if (playerIndex === -1) {
      return {
        success: false,
        message: '玩家ID无效，仅支持 player1-player4'
      };
    }

    const match = await prisma.matchRecord.findUnique({
      where: { id: matchId },
      select: { initialHands: true }
    });

    if (!match) {
      return {
        success: false,
        message: '对局不存在'
      };
    }

    const parsed = parseInitialHands(match.initialHands);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.message
      };
    }

    const playerHands = parsed.cards[playerIndex];
    if (!playerHands || !Array.isArray(playerHands)) {
      return {
        success: false,
        message: '开局手牌数据缺失'
      };
    }

    if (playerHands.length !== 27) {
      return {
        success: false,
        message: `开局手牌数量异常，期望27张，实际${playerHands.length}张`
      };
    }

    return {
      success: true,
      message: '获取开局手牌成功',
      cards: playerHands
    };
  } catch (error) {
    console.error('❌ 获取开局手牌时发生错误:', error);
    return {
      success: false,
      message: `获取开局手牌失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

export interface MatchActionLogView {
  id: string;
  stepNumber: number;
  playerId: string;
  actionType: ActionType;
  cards: string[];
}

/**
 * 获取对局操作日志
 * @param matchId 对局ID
 */
export async function getMatchLogs(
  matchId: string
): Promise<{ success: boolean; message: string; totalLogs?: number; logs?: MatchActionLogView[] }> {
  try {
    if (!matchId || matchId.trim() === '') {
      return {
        success: false,
        message: '对局ID不能为空'
      };
    }

    const match = await prisma.matchRecord.findUnique({
      where: { id: matchId },
      select: { id: true }
    });

    if (!match) {
      return {
        success: false,
        message: '对局不存在'
      };
    }

    const logs = await prisma.actionLog.findMany({
      where: { matchId },
      orderBy: { stepNumber: 'asc' },
      select: {
        id: true,
        stepNumber: true,
        playerId: true,
        actionType: true,
        cards: true
      }
    });

    const normalizedLogs: MatchActionLogView[] = logs.map((log) => ({
      id: log.id,
      stepNumber: log.stepNumber,
      playerId: log.playerId,
      actionType: log.actionType,
      cards: parseLoggedCards(log.cards)
    }));

    return {
      success: true,
      message: '获取对局日志成功',
      totalLogs: normalizedLogs.length,
      logs: normalizedLogs
    };
  } catch (error) {
    console.error('❌ 获取对局日志时发生错误:', error);
    return {
      success: false,
      message: `获取对局日志失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

/**
 * 结束对局
 * @param matchId 对局ID
 */
export async function endMatch(matchId: string): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.matchRecord.update({
      where: { id: matchId },
      data: { endTime: new Date() }
    });

    return {
      success: true,
      message: '对局结束成功'
    };
  } catch (error) {
    console.error('❌ 结束对局时发生错误:', error);
    return {
      success: false,
      message: `结束对局失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

// 导出Prisma客户端以便其他模块使用
export { prisma };

function resolvePlayerIndex(playerId: string): number {
  if (playerId in PLAYER_INDEX_BY_ID) {
    return PLAYER_INDEX_BY_ID[playerId];
  }

  const numeric = Number(playerId);
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 4) {
    return numeric - 1;
  }

  return -1;
}

function parseInitialHands(raw: string): { success: boolean; message: string; cards: RuntimeCard[][] } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 4) {
      return {
        success: false,
        message: '开局手牌数据格式错误',
        cards: []
      };
    }

    const hands = parsed as RuntimeCard[][];
    return {
      success: true,
      message: 'ok',
      cards: hands
    };
  } catch {
    return {
      success: false,
      message: '开局手牌数据无法解析',
      cards: []
    };
  }
}

function parseLoggedCards(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((cardId): cardId is string => typeof cardId === 'string') : [];
  } catch {
    return [];
  }
}
