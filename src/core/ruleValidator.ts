/**
 * 掼蛋核心规则引擎
 * 负责牌型识别、校验和力量计算
 */

import { RuntimeCard, CardRank, CardSuit } from './cardEngine';

// ==================== 类型定义 ====================

/** 牌型类型 */
export type PatternType = 
  | 'single'    // 单张
  | 'pair'       // 对子
  | 'tube'       // 三连对/钢板（三张相同点数）
  | 'plate'      // 三带二/木板
  | 'straight'   // 顺子
  | 'bomb'       // 炸弹
  | 'straight_flush' // 同花顺
  | 'invalid';   // 无效牌型

/** 牌型校验结果 */
export interface PatternResult {
  isValid: boolean;
  patternType: PatternType;
  powerLevel: number;
  replacedCards?: RuntimeCard[]; // 替换逢人配后的牌
}

/** 点数排序 */
const RANK_ORDER: Record<CardRank, number> = {
  '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6,
  '9': 7, '10': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12, '2': 13, 'JOKER': 14
};

/** 数值到点数的反向映射 */
const VALUE_TO_RANK: Record<number, CardRank> = {
  1: '3',
  2: '4',
  3: '5',
  4: '6',
  5: '7',
  6: '8',
  7: '9',
  8: '10',
  9: 'J',
  10: 'Q',
  11: 'K',
  12: 'A',
  13: '2',
  14: 'JOKER'
};

/** 非王牌点数 */
const NON_JOKER_RANKS: CardRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

// ==================== 核心函数 ====================

/**
 * 主校验函数：识别牌型并计算力量
 * @param cards 待校验的牌数组
 * @returns 校验结果
 */
export function identifyPattern(cards: RuntimeCard[]): PatternResult {
  if (!cards || cards.length === 0) {
    return { isValid: false, patternType: 'invalid', powerLevel: 0 };
  }

  // 提取逢人配
  const wildcards = cards.filter(c => c.isWildcard);
  const normalCards = cards.filter(c => !c.isWildcard);

  // 无逢人配，直接校验
  if (wildcards.length === 0) {
    return identifyPatternDirect(cards);
  }

  // 有逢人配，尝试动态替换
  return identifyPatternWithWildcards(cards, wildcards, normalCards);
}

/**
 * 直接校验（无逢人配）
 */
function identifyPatternDirect(cards: RuntimeCard[]): PatternResult {
  const n = cards.length;
  
  if (n === 1) {
    return createResult('single', calculatePower('single', cards));
  }

  if (n === 2) {
    if (cards[0].rank === cards[1].rank) {
      return createResult('pair', calculatePower('pair', cards));
    }
    return invalidResult();
  }

  if (n === 3) {
    // 钢板（三张相同）
    if (cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank) {
      return createResult('tube', calculatePower('tube', cards));
    }
    return invalidResult();
  }

  if (n === 4) {
    // 炸弹（四张相同）
    if (isAllSameRank(cards)) {
      return createResult('bomb', calculatePower('bomb', cards));
    }
    return invalidResult();
  }

  if (n === 5) {
    // 木板（三带二）
    if (isPlate(cards)) {
      return createResult('plate', calculatePower('plate', cards));
    }
  }

  if (n >= 5) {
    // 优先检查同花顺
    const straightFlushResult = checkStraightFlush(cards);
    if (straightFlushResult.isValid) {
      return straightFlushResult;
    }

    // 检查顺子
    const straightResult = checkStraight(cards);
    if (straightResult.isValid) {
      return straightResult;
    }

    // 检查炸弹（5张以上可能是炸弹）
    if (isBomb(cards)) {
      return createResult('bomb', calculatePower('bomb', cards));
    }
  }

  return invalidResult();
}

/**
 * 带逢人配的校验（核心难点）
 */
function identifyPatternWithWildcards(
  cards: RuntimeCard[], 
  wildcards: RuntimeCard[], 
  normalCards: RuntimeCard[]
): PatternResult {
  const numWildcards = wildcards.length;
  const n = cards.length;

  // ========== 优先检查同花顺 ==========
  if (n >= 5) {
    // 尝试用逢人配凑同花顺
    const result = tryReplaceForStraightFlush(cards, wildcards, normalCards, numWildcards);
    if (result.isValid) return result;
  }

  // ========== 检查顺子 ==========
  if (n >= 5) {
    // 尝试用逢人配凑顺子
    const result = tryReplaceForStraight(cards, wildcards, normalCards, numWildcards);
    if (result.isValid) return result;
  }

  // ========== 检查炸弹 ==========
  const result = tryReplaceForBomb(cards, wildcards, normalCards, numWildcards);
  if (result.isValid) return result;

  // ========== 检查其他牌型 ==========
  // 单张
  if (n === 1) {
    return createResult('single', calculatePower('single', normalCards.length > 0 ? normalCards : cards));
  }

  // 对子
  if (n === 2 && normalCards.length >= 1) {
    return createResult('pair', calculatePower('pair', normalCards));
  }

  // 钢板
  if (n === 3 && normalCards.length >= 2) {
    // 需要至少2张相同点数的牌
    const ranks = normalCards.map(c => c.rank);
    const hasPair = ranks.some(r => ranks.filter(x => x === r).length >= 2);
    if (hasPair) {
      return createResult('tube', calculatePower('tube', normalCards));
    }
  }

  // 木板（三带二）
  if (n === 5) {
    // 尝试用逢人配凑木板
    const plateResult = tryReplaceForPlate(cards, wildcards, normalCards);
    if (plateResult.isValid) return plateResult;
  }

  return invalidResult();
}

/**
 * 尝试用逢人配凑同花顺（最高优先级）
 */
function tryReplaceForStraightFlush(
  cards: RuntimeCard[],
  wildcards: RuntimeCard[],
  normalCards: RuntimeCard[],
  numWildcards: number
): PatternResult {
  const n = cards.length;
  if (n < 5) return invalidResult();

  // 逢人配替换同花顺时，所有普通牌必须同花色且全部参与目标序列。
  const candidateSuits: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  for (const targetSuit of candidateSuits) {
    const suitCards = normalCards.filter(c => c.suit === targetSuit);
    if (suitCards.length !== normalCards.length) {
      continue;
    }

    const suitValues = suitCards.map(c => RANK_ORDER[c.rank]);
    if (hasDuplicateValues(suitValues)) {
      continue;
    }

    for (let start = 1; start <= 13 - n + 1; start++) {
      const sequence = buildSequence(start, n);
      const sequenceSet = new Set(sequence);

      if (suitValues.some(value => !sequenceSet.has(value))) {
        continue;
      }

      const missingValues = sequence.filter(value => !suitValues.includes(value));
      if (missingValues.length !== numWildcards) {
        continue;
      }

      const replacedCards = buildStraightReplacementCards(suitCards, sequence, targetSuit);
      return {
        isValid: true,
        patternType: 'straight_flush',
        powerLevel: calculatePower('straight_flush', replacedCards),
        replacedCards
      };
    }
  }

  return invalidResult();
}

/**
 * 尝试用逢人配凑顺子
 */
function tryReplaceForStraight(
  cards: RuntimeCard[],
  wildcards: RuntimeCard[],
  normalCards: RuntimeCard[],
  numWildcards: number
): PatternResult {
  const n = cards.length;
  if (n < 5) return invalidResult();

  const normalValues = normalCards.map(c => RANK_ORDER[c.rank]);
  if (hasDuplicateValues(normalValues)) {
    return invalidResult();
  }

  for (let start = 1; start <= 13 - n + 1; start++) {
    const sequence = buildSequence(start, n);
    const sequenceSet = new Set(sequence);

    if (normalValues.some(value => !sequenceSet.has(value))) {
      continue;
    }

    const missingValues = sequence.filter(value => !normalValues.includes(value));
    if (missingValues.length !== numWildcards) {
      continue;
    }

    const replacedCards = buildStraightReplacementCards(normalCards, sequence, 'hearts');
    return {
      isValid: true,
      patternType: 'straight',
      powerLevel: calculatePower('straight', replacedCards),
      replacedCards
    };
  }

  return invalidResult();
}

/**
 * 尝试用逢人配凑炸弹
 */
function tryReplaceForBomb(
  cards: RuntimeCard[],
  wildcards: RuntimeCard[],
  normalCards: RuntimeCard[],
  numWildcards: number
): PatternResult {
  const n = cards.length;
  if (n < 4 || normalCards.length === 0) {
    return invalidResult();
  }

  // 严格要求：除逢人配外的所有牌点数必须一致，且全部牌都参与炸弹。
  const targetRank = normalCards[0].rank;
  if (normalCards.some(card => card.rank !== targetRank)) {
    return invalidResult();
  }

  const bombCards: RuntimeCard[] = [...normalCards];
  for (let i = 0; i < numWildcards; i++) {
    bombCards.push(createSyntheticCard(`wildcard_bomb_${targetRank}_${i}`, targetRank, 'hearts'));
  }

  if (bombCards.length !== n) {
    return invalidResult();
  }

  return {
    isValid: true,
    patternType: 'bomb',
    powerLevel: calculatePower('bomb', bombCards),
    replacedCards: bombCards
  };
}

/**
 * 尝试用逢人配凑木板（三带二）
 */
function tryReplaceForPlate(
  cards: RuntimeCard[],
  wildcards: RuntimeCard[],
  normalCards: RuntimeCard[]
): PatternResult {
  if (cards.length !== 5) return invalidResult();

  const rankCount = new Map<CardRank, number>();
  for (const card of normalCards) {
    rankCount.set(card.rank, (rankCount.get(card.rank) || 0) + 1);
  }

  let bestResult: PatternResult | null = null;

  // 穷举三张点数 + 两张点数，确保所有普通牌都能被覆盖，且逢人配数量完全匹配。
  for (const tripleRank of NON_JOKER_RANKS) {
    for (const pairRank of NON_JOKER_RANKS) {
      if (tripleRank === pairRank) continue;

      const hasForeignRank = Array.from(rankCount.keys()).some(
        rank => rank !== tripleRank && rank !== pairRank
      );
      if (hasForeignRank) continue;

      const tripleCount = rankCount.get(tripleRank) ?? 0;
      const pairCount = rankCount.get(pairRank) ?? 0;
      if (tripleCount > 3 || pairCount > 2) continue;

      const requiredWildcards = (3 - tripleCount) + (2 - pairCount);
      if (requiredWildcards !== wildcards.length) continue;

      const replacedCards = buildPlateReplacementCards(
        normalCards,
        tripleRank,
        pairRank,
        3 - tripleCount,
        2 - pairCount
      );
      const powerLevel = calculatePower('plate', replacedCards);

      if (!bestResult || powerLevel > bestResult.powerLevel) {
        bestResult = {
          isValid: true,
          patternType: 'plate',
          powerLevel,
          replacedCards
        };
      }
    }
  }

  return bestResult ?? invalidResult();
}

// ==================== 辅助函数 ====================

/**
 * 构建连续点数序列
 */
function buildSequence(start: number, length: number): number[] {
  const sequence: number[] = [];
  for (let i = 0; i < length; i++) {
    sequence.push(start + i);
  }
  return sequence;
}

/**
 * 判断点数数组是否有重复
 */
function hasDuplicateValues(values: number[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * 创建替换后的运行时牌
 */
function createSyntheticCard(id: string, rank: CardRank, suit: CardSuit): RuntimeCard {
  const suitBonus: Record<CardSuit, number> = {
    hearts: 4,
    diamonds: 3,
    clubs: 2,
    spades: 1,
    joker: 0
  };

  return {
    id,
    suit,
    rank,
    deckIndex: 0,
    logicValue: RANK_ORDER[rank] * 10 + suitBonus[suit],
    isWildcard: false,
    isSelected: false
  };
}

/**
 * 构建替换后的顺子/同花顺牌组
 */
function buildStraightReplacementCards(
  normalCards: RuntimeCard[],
  sequence: number[],
  suitForWildcard: CardSuit
): RuntimeCard[] {
  const cardByValue = new Map<number, RuntimeCard>();
  for (const card of normalCards) {
    cardByValue.set(RANK_ORDER[card.rank], card);
  }

  const result: RuntimeCard[] = [];
  let wildcardIndex = 0;

  for (const value of sequence) {
    const existingCard = cardByValue.get(value);
    if (existingCard) {
      result.push(existingCard);
      continue;
    }

    const rank = VALUE_TO_RANK[value];
    result.push(
      createSyntheticCard(
        `wildcard_sequence_${rank}_${wildcardIndex++}`,
        rank,
        suitForWildcard
      )
    );
  }

  return result;
}

/**
 * 构建替换后的木板牌组（三带二）
 */
function buildPlateReplacementCards(
  normalCards: RuntimeCard[],
  tripleRank: CardRank,
  pairRank: CardRank,
  addTripleCount: number,
  addPairCount: number
): RuntimeCard[] {
  const result: RuntimeCard[] = [...normalCards];

  for (let i = 0; i < addTripleCount; i++) {
    result.push(createSyntheticCard(`wildcard_plate_${tripleRank}_${i}`, tripleRank, 'hearts'));
  }

  for (let i = 0; i < addPairCount; i++) {
    result.push(createSyntheticCard(`wildcard_plate_${pairRank}_${i}`, pairRank, 'spades'));
  }

  return result;
}

/**
 * 检查是否为同花顺
 */
function checkStraightFlush(cards: RuntimeCard[]): PatternResult {
  const sorted = [...cards].sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
  
  // 必须花色相同
  const suits = new Set(sorted.map(c => c.suit));
  if (suits.size !== 1) return invalidResult();
  
  // 必须连续
  if (!isConsecutive(sorted.map(c => c.rank))) return invalidResult();
  
  // 同花顺至少5张
  if (sorted.length < 5) return invalidResult();
  
  return createResult('straight_flush', calculatePower('straight_flush', sorted));
}

/**
 * 检查是否为顺子
 */
function checkStraight(cards: RuntimeCard[]): PatternResult {
  const sorted = [...cards].sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
  const ranks = sorted.map(c => c.rank);
  
  // 去重
  const uniqueRanks = [...new Set(ranks)];
  if (uniqueRanks.length < 5) return invalidResult();
  
  // 必须连续
  if (!isConsecutive(uniqueRanks)) return invalidResult();
  
  return createResult('straight', calculatePower('straight', sorted));
}

/**
 * 判断点数是否连续
 */
function isConsecutive(ranks: CardRank[]): boolean {
  if (ranks.length < 2) return true;
  
  const nums = ranks.map(r => RANK_ORDER[r]).sort((a, b) => a - b);
  
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] - nums[i-1] !== 1) {
      return false;
    }
  }
  
  return true;
}

/**
 * 判断是否全为相同点数
 */
function isAllSameRank(cards: RuntimeCard[]): boolean {
  if (cards.length < 4) return false;
  const firstRank = cards[0].rank;
  return cards.every(c => c.rank === firstRank);
}

/**
 * 判断是否为炸弹
 */
function isBomb(cards: RuntimeCard[]): boolean {
  if (cards.length < 4) return false;
  return isAllSameRank(cards);
}

/**
 * 判断是否为木板（三带二）
 */
function isPlate(cards: RuntimeCard[]): boolean {
  if (cards.length !== 5) return false;
  
  const rankCount = new Map<CardRank, number>();
  for (const card of cards) {
    rankCount.set(card.rank, (rankCount.get(card.rank) || 0) + 1);
  }
  
  const counts = Array.from(rankCount.values()).sort((a, b) => b - a);
  return counts.length === 2 && counts[0] === 3 && counts[1] === 2;
}

/**
 * 创建有效结果
 */
function createResult(type: PatternType, power: number): PatternResult {
  return { isValid: true, patternType: type, powerLevel: power };
}

/**
 * 创建无效结果
 */
function invalidResult(): PatternResult {
  return { isValid: false, patternType: 'invalid', powerLevel: 0 };
}

/**
 * 计算牌型力量
 */
function calculatePower(patternType: PatternType, cards: RuntimeCard[]): number {
  if (!cards || cards.length === 0) return 0;
  
  const basePower = {
    'single': 0,
    'pair': 100,
    'tube': 200,
    'plate': 300,
    'straight': 400,
    'bomb': 500,
    'straight_flush': 600,
    'invalid': 0
  };
  
  // 基础分 + 最大牌分
  const maxCardPower = Math.max(...cards.map(c => c.logicValue));
  
  // 炸弹张数加成
  let bombBonus = 0;
  if (patternType === 'bomb') {
    bombBonus = (cards.length - 4) * 50;
  }
  
  // 同花顺张数加成
  let straightFlushBonus = 0;
  if (patternType === 'straight_flush') {
    straightFlushBonus = (cards.length - 5) * 100;
  }
  
  return basePower[patternType] + maxCardPower + bombBonus + straightFlushBonus;
}

// ==================== 导出主函数 ====================
// identifyPattern 已在上面导出
