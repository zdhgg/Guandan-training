/**
 * 游戏服务层 - 处理对局操作和数据库写入
 */

import { identifyPattern, PatternResult } from '../core/ruleValidator';
import { RuntimeCard } from '../core/cardEngine';
import { PrismaClient } from '@prisma/client';
import { ActionType } from '@prisma/client';

const prisma = new PrismaClient();

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