import { Request, Response } from 'express';
import { generateDeck, shuffleDeck, type RuntimeCard } from '../core/cardEngine';
import { identifyPattern } from '../core/ruleValidator';
import { autoGroupCards, generateAllGroupings } from '../services/autoGrouper';

interface TrainingGroupValidationResult {
  groupIndex: number;
  cardCount: number;
  isValid: boolean;
  patternType: string;
  powerLevel: number;
}

function readGroupsPayload(body: unknown): unknown {
  if (body && typeof body === 'object' && 'groups' in body) {
    return (body as { groups?: unknown }).groups;
  }
  return body;
}

function readCardsPayload(body: unknown): unknown {
  if (body && typeof body === 'object' && 'cards' in body) {
    return (body as { cards?: unknown }).cards;
  }
  return body;
}

function normalizeGroupsPayload(payload: unknown): RuntimeCard[][] | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  const groups: RuntimeCard[][] = [];
  for (const item of payload) {
    if (Array.isArray(item)) {
      groups.push(item as RuntimeCard[]);
      continue;
    }

    if (item && typeof item === 'object' && Array.isArray((item as { cards?: unknown }).cards)) {
      groups.push((item as { cards: RuntimeCard[] }).cards);
      continue;
    }

    return null;
  }

  return groups;
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

function validateGroupShape(groups: RuntimeCard[][]): { valid: true } | { valid: false; message: string } {
  if (groups.length === 0) {
    return {
      valid: false,
      message: '至少需要提供一组牌堆'
    };
  }

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    if (!Array.isArray(group) || group.length === 0) {
      return {
        valid: false,
        message: `第${i + 1}组为空，请仅提交非空牌堆`
      };
    }

    if (group.some((card) => !isRuntimeCard(card))) {
      return {
        valid: false,
        message: `第${i + 1}组包含无效牌数据`
      };
    }
  }

  return { valid: true };
}

function validateHandShape(cards: RuntimeCard[]): { valid: true } | { valid: false; message: string } {
  if (!Array.isArray(cards) || cards.length === 0) {
    return {
      valid: false,
      message: '请提供手牌数据'
    };
  }

  if (cards.length !== 27) {
    return {
      valid: false,
      message: `理牌训练需要27张手牌，当前为${cards.length}张`
    };
  }

  if (cards.some((card) => !isRuntimeCard(card))) {
    return {
      valid: false,
      message: '手牌中包含无效牌数据'
    };
  }

  const uniqueIds = new Set(cards.map((card) => card.id));
  if (uniqueIds.size !== cards.length) {
    return {
      valid: false,
      message: '手牌中存在重复牌ID，请检查数据来源'
    };
  }

  return { valid: true };
}

export function validateTrainingGroups(req: Request, res: Response) {
  try {
    const rawGroups = readGroupsPayload(req.body);
    const groups = normalizeGroupsPayload(rawGroups);

    if (!groups) {
      return res.status(400).json({
        success: false,
        message: '请求体格式错误，请提供二维数组或包含 cards 字段的对象数组'
      });
    }

    const groupShapeResult = validateGroupShape(groups);
    if (!groupShapeResult.valid) {
      return res.status(400).json({
        success: false,
        message: groupShapeResult.message
      });
    }

    const validationResults: TrainingGroupValidationResult[] = groups.map((group, index) => {
      const patternResult = identifyPattern(group);
      return {
        groupIndex: index,
        cardCount: group.length,
        isValid: patternResult.isValid,
        patternType: patternResult.patternType,
        powerLevel: patternResult.powerLevel
      };
    });

    const invalidResult = validationResults.find((result) => !result.isValid);
    if (invalidResult) {
      return res.status(200).json({
        success: false,
        message: `第${invalidResult.groupIndex + 1}组牌型不合法`,
        invalidGroupIndex: invalidResult.groupIndex,
        invalidGroup: groups[invalidResult.groupIndex],
        invalidGroupResult: invalidResult,
        groupResults: validationResults
      });
    }

    return res.status(200).json({
      success: true,
      message: '全部牌堆校验通过',
      totalMoves: validationResults.length,
      groupResults: validationResults
    });
  } catch (error) {
    console.error('训练模式批量校验失败:', error);
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

export function autoGroupTrainingCards(req: Request, res: Response) {
  try {
    const rawCards = readCardsPayload(req.body);
    const cards = Array.isArray(rawCards) ? (rawCards as RuntimeCard[]) : null;

    if (!cards) {
      return res.status(400).json({
        success: false,
        message: '请求体格式错误，请提供 cards 数组'
      });
    }

    const handShapeResult = validateHandShape(cards);
    if (!handShapeResult.valid) {
      return res.status(400).json({
        success: false,
        message: handShapeResult.message
      });
    }

    const allGroupings = generateAllGroupings(cards, { mode: 'training' });
    const best = allGroupings[0] || { groups: [] };

    return res.status(200).json({
      success: true,
      message: '智能理牌完成',
      groupedCards: best.groups,
      allGroupings,
      totalGroups: best.groups.length
    });
  } catch (error) {
    console.error('智能理牌失败:', error);
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

export function newTrainingHand(_req: Request, res: Response) {
  try {
    const currentLevel = '8';
    const fullDeck = generateDeck(currentLevel);
    const shuffledDeck = shuffleDeck(fullDeck);
    const cards = shuffledDeck.slice(0, 27).map((card) => ({
      ...card,
      isSelected: false
    }));

    return res.status(200).json({
      success: true,
      message: '新手牌发放成功',
      cards,
      totalCards: cards.length
    });
  } catch (error) {
    console.error('发放训练新手牌失败:', error);
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}
