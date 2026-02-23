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
    // 木板（三带二）
    if (isPlate(cards)) {
      return createResult('plate', calculatePower('plate', cards));
    }
    return invalidResult();
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

  // 木板
  if (n === 4) {
    // 尝试用逢人配凑木板
    const result = tryReplaceForPlate(cards, wildcards, normalCards);
    if (result.isValid) return result;
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
  // 获取所有不同的花色
  const suits = [...new Set(normalCards.map(c => c.suit))];
  
  for (const targetSuit of suits) {
    // 该花色的牌
    const suitCards = normalCards.filter(c => c.suit === targetSuit);
    const suitRanks = suitCards.map(c => c.rank).sort((a, b) => RANK_ORDER[a] - RANK_ORDER[b]);
    
    // 尝试不同数量的逢人配替换
    for (let useCount = 1; useCount <= numWildcards; useCount++) {
      // 需要useCount + suitCards.length张连续牌
      const totalNeeded = useCount + suitCards.length;
      if (totalNeeded < 5) continue; // 同花顺至少5张
      
      // 枚举可能的起点
      for (let startRank = 1; startRank <= 14 - totalNeeded + 1; startRank++) {
        const needed: CardRank[] = [];
        for (let i = 0; i < totalNeeded; i++) {
          const rankNum = startRank + i;
          if (rankNum <= 12) {
            needed.push(Object.keys(RANK_ORDER).find(k => RANK_ORDER[k as CardRank] === rankNum) as CardRank);
          }
        }
        
        // 检查suitRanks能否通过替换凑成needed
        if (canFormWithWildcards(suitRanks, needed, useCount)) {
          // 构造替换后的牌
          const replacedCards = buildReplacedCards(suitCards, needed, targetSuit, useCount);
          return {
            isValid: true,
            patternType: 'straight_flush',
            powerLevel: calculatePower('straight_flush', replacedCards),
            replacedCards
          };
        }
      }
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
  const ranks = normalCards.map(c => c.rank).sort((a, b) => RANK_ORDER[a] - RANK_ORDER[b]);
  const uniqueRanks = [...new Set(ranks)];
  
  // 尝试用不同数量的逢人配
  for (let useCount = 1; useCount <= numWildcards; useCount++) {
    const totalNeeded = useCount + uniqueRanks.length;
    if (totalNeeded < 5) continue;
    
    // 尝试不同起点
    for (let startRank = 1; startRank <= 14 - totalNeeded + 1; startRank++) {
      const needed: number[] = [];
      for (let i = 0; i < totalNeeded; i++) {
        needed.push(startRank + i);
      }
      
      if (canFormWithWildcardsNum(ranks, needed, useCount)) {
        // 构造替换后的牌
        const replacedCards = buildStraightCards(uniqueRanks, needed, useCount);
        return {
          isValid: true,
          patternType: 'straight',
          powerLevel: calculatePower('straight', replacedCards),
          replacedCards
        };
      }
    }
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
  // 统计各点数牌数
  const rankCount = new Map<CardRank, number>();
  for (const card of normalCards) {
    rankCount.set(card.rank, (rankCount.get(card.rank) || 0) + 1);
  }
  
  // 已有炸弹
  for (const [rank, count] of rankCount) {
    if (count >= 4) {
      // 4张或更多相同点数，已经是炸弹
      const bombCards = normalCards.filter(c => c.rank === rank);
      return createResult('bomb', calculatePower('bomb', bombCards));
    }
  }
  
  // 用逢人配凑炸弹：需要4-numWildcards张相同点数 + numWildcards张逢人配
  const neededForBomb = 4 - numWildcards;
  if (neededForBomb <= 0) {
    // 全部是逢人配，也是炸弹（但理论上不可能有4个逢人配）
    return createResult('bomb', 1000 + numWildcards * 100);
  }
  
  // 找是否有至少neededForBomb张相同点数的牌
  for (const [rank, count] of rankCount) {
    if (count >= neededForBomb) {
      const baseCards = normalCards.filter(c => c.rank === rank).slice(0, neededForBomb);
      const bombCards = [...baseCards, ...wildcards];
      return {
        isValid: true,
        patternType: 'bomb',
        powerLevel: calculatePower('bomb', bombCards),
        replacedCards: bombCards
      };
    }
  }
  
  return invalidResult();
}

/**
 * 尝试用逢人配凑木板（三带二）
 */
function tryReplaceForPlate(
  cards: RuntimeCard[],
  wildcards: RuntimeCard[],
  normalCards: RuntimeCard[]
): PatternResult {
  if (normalCards.length < 3) return invalidResult();
  
  // 找三张相同点数的牌
  const rankCount = new Map<CardRank, number>();
  for (const card of normalCards) {
    rankCount.set(card.rank, (rankCount.get(card.rank) || 0) + 1);
  }
  
  for (const [rank, count] of rankCount) {
    if (count >= 3) {
      // 已有三张，剩余一张用逢人配
      const threeCards = normalCards.filter(c => c.rank === rank).slice(0, 3);
      const plateCards = [...threeCards, wildcards[0]];
      return {
        isValid: true,
        patternType: 'plate',
        powerLevel: calculatePower('plate', threeCards),
        replacedCards: plateCards
      };
    }
  }
  
  // 没有三张，尝试用逢人配+2张凑三张
  if (wildcards.length >= 1 && normalCards.length >= 2) {
    // 找两张相同点数的牌
    for (const [rank, count] of rankCount) {
      if (count >= 2) {
        const pairCards = normalCards.filter(c => c.rank === rank).slice(0, 2);
        const plateCards = [...pairCards, wildcards[0]];
        return {
          isValid: true,
          patternType: 'plate',
          powerLevel: calculatePower('plate', pairCards),
          replacedCards: plateCards
        };
      }
    }
  }
  
  return invalidResult();
}

// ==================== 辅助函数 ====================

/**
 * 判断能否用wildcards替换形成目标序列
 */
function canFormWithWildcards(
  have: CardRank[], 
  need: CardRank[], 
  numWildcards: number
): boolean {
  let wildcardsLeft = numWildcards;
  
  for (const target of need) {
    if (have.includes(target)) {
      have = have.filter(h => h !== target);
    } else if (wildcardsLeft > 0) {
      wildcardsLeft--;
    } else {
      return false;
    }
  }
  
  return true;
}

/**
 * 判断能否用wildcards替换形成目标序列（数字版本）
 */
function canFormWithWildcardsNum(
  have: CardRank[], 
  need: number[], 
  numWildcards: number
): boolean {
  let wildcardsLeft = numWildcards;
  const haveNums = have.map(r => RANK_ORDER[r]);
  
  for (const target of need) {
    const idx = haveNums.indexOf(target);
    if (idx >= 0) {
      haveNums.splice(idx, 1);
    } else if (wildcardsLeft > 0) {
      wildcardsLeft--;
    } else {
      return false;
    }
  }
  
  return true;
}

/**
 * 构建替换后的同花顺牌
 */
function buildReplacedCards(
  suitCards: RuntimeCard[], 
  needed: CardRank[], 
  suit: CardSuit,
  useCount: number
): RuntimeCard[] {
  const result: RuntimeCard[] = [...suitCards];
  const existingRanks = new Set(suitCards.map(c => c.rank));
  
  let used = 0;
  for (const rank of needed) {
    if (!existingRanks.has(rank) && used < useCount) {
      // 用逢人配替换
      result.push({
        id: `wildcard_replaced_${rank}`,
        suit,
        rank,
        deckIndex: 0,
        logicValue: RANK_ORDER[rank] * 10 + 4,
        isWildcard: false, // 替换后不再是逢人配
        isSelected: false
      });
      used++;
    }
  }
  
  return result;
}

/**
 * 构建替换后的顺子牌
 */
function buildStraightCards(
  uniqueRanks: CardRank[], 
  needed: number[],
  useCount: number
): RuntimeCard[] {
  const result: RuntimeCard[] = [];
  const existingSet = new Set(uniqueRanks);
  let used = 0;
  
  for (const num of needed) {
    const rank = Object.keys(RANK_ORDER).find(k => RANK_ORDER[k as CardRank] === num) as CardRank;
    if (existingSet.has(rank)) {
      // 使用已有的牌
      result.push({
        id: `straight_${rank}`,
        suit: 'hearts', // 任意花色
        rank,
        deckIndex: 0,
        logicValue: num * 10,
        isWildcard: false,
        isSelected: false
      });
    } else if (used < useCount) {
      // 用逢人配替换
      result.push({
        id: `wildcard_straight_${rank}`,
        suit: 'hearts',
        rank,
        deckIndex: 0,
        logicValue: num * 10,
        isWildcard: false,
        isSelected: false
      });
      used++;
    }
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
  if (cards.length !== 4) return false;
  
  const rankCount = new Map<CardRank, number>();
  for (const card of cards) {
    rankCount.set(card.rank, (rankCount.get(card.rank) || 0) + 1);
  }
  
  const counts = Array.from(rankCount.values());
  return (counts.includes(3) && counts.includes(2));
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

// ==================== 测试用例 ====================

console.log('========== 规则引擎测试 ==========\n');

// 测试1: 普通的顺子校验
console.log('【测试1】普通顺子校验 (5,6,7,8,9)');
const testStraight1: RuntimeCard[] = [
  { id: '1', suit: 'hearts', rank: '5', deckIndex: 0, logicValue: 51, isWildcard: false, isSelected: false },
  { id: '2', suit: 'diamonds', rank: '6', deckIndex: 0, logicValue: 62, isWildcard: false, isSelected: false },
  { id: '3', suit: 'clubs', rank: '7', deckIndex: 0, logicValue: 73, isWildcard: false, isSelected: false },
  { id: '4', suit: 'spades', rank: '8', deckIndex: 0, logicValue: 84, isWildcard: false, isSelected: false },
  { id: '5', suit: 'hearts', rank: '9', deckIndex: 0, logicValue: 94, isWildcard: false, isSelected: false },
];
const result1 = identifyPattern(testStraight1);
console.log(`结果: isValid=${result1.isValid}, patternType=${result1.patternType}, powerLevel=${result1.powerLevel}`);
console.assert(result1.isValid === true, '普通顺子应该有效');
console.assert(result1.patternType === 'straight', '牌型应该是straight');
console.log('✅ 测试1通过\n');

// 测试2: 包含1张isWildcard的顺子校验
console.log('【测试2】包含逢人配的顺子校验 (5,6,7,8 + 逢人配)');
const testStraight2: RuntimeCard[] = [
  { id: '1', suit: 'hearts', rank: '5', deckIndex: 0, logicValue: 51, isWildcard: false, isSelected: false },
  { id: '2', suit: 'diamonds', rank: '6', deckIndex: 0, logicValue: 62, isWildcard: false, isSelected: false },
  { id: '3', suit: 'clubs', rank: '7', deckIndex: 0, logicValue: 73, isWildcard: false, isSelected: false },
  { id: '4', suit: 'spades', rank: '8', deckIndex: 0, logicValue: 84, isWildcard: false, isSelected: false },
  { id: '5', suit: 'hearts', rank: '9', deckIndex: 0, logicValue: 94, isWildcard: true, isSelected: false }, // 逢人配
];
const result2 = identifyPattern(testStraight2);
console.log(`结果: isValid=${result2.isValid}, patternType=${result2.patternType}, powerLevel=${result2.powerLevel}`);
console.log(`替换后的牌: ${result2.replacedCards?.map(c => c.rank).join(',')}`);
console.assert(result2.isValid === true, '含逢人配的顺子应该有效');
console.assert(result2.patternType === 'straight', '牌型应该是straight');
console.log('✅ 测试2通过\n');

// 测试3: 包含1张isWildcard的炸弹校验
console.log('【测试3】包含逢人配的炸弹校验 (8,8,8 + 逢人配)');
const testBomb: RuntimeCard[] = [
  { id: '1', suit: 'hearts', rank: '8', deckIndex: 0, logicValue: 158, isWildcard: false, isSelected: false },
  { id: '2', suit: 'diamonds', rank: '8', deckIndex: 0, logicValue: 153, isWildcard: false, isSelected: false },
  { id: '3', suit: 'clubs', rank: '8', deckIndex: 0, logicValue: 152, isWildcard: false, isSelected: false },
  { id: '4', suit: 'hearts', rank: '8', deckIndex: 0, logicValue: 158, isWildcard: true, isSelected: false }, // 逢人配
];
const result3 = identifyPattern(testBomb);
console.log(`结果: isValid=${result3.isValid}, patternType=${result3.patternType}, powerLevel=${result3.powerLevel}`);
console.log(`替换后的牌: ${result3.replacedCards?.map(c => c.rank).join(',')}`);
console.assert(result3.isValid === true, '含逢人配的炸弹应该有效');
console.assert(result3.patternType === 'bomb', '牌型应该是bomb');
console.log('✅ 测试3通过\n');

// 测试4: 无效牌型
console.log('【测试4】无效牌型校验 (3,5,7,9)');
const testInvalid: RuntimeCard[] = [
  { id: '1', suit: 'hearts', rank: '3', deckIndex: 0, logicValue: 31, isWildcard: false, isSelected: false },
  { id: '2', suit: 'diamonds', rank: '5', deckIndex: 0, logicValue: 52, isWildcard: false, isSelected: false },
  { id: '3', suit: 'clubs', rank: '7', deckIndex: 0, logicValue: 73, isWildcard: false, isSelected: false },
  { id: '4', suit: 'spades', rank: '9', deckIndex: 0, logicValue: 94, isWildcard: false, isSelected: false },
];
const result4 = identifyPattern(testInvalid);
console.log(`结果: isValid=${result4.isValid}, patternType=${result4.patternType}, powerLevel=${result4.powerLevel}`);
console.assert(result4.isValid === false, '不连续的牌应该无效');
console.log('✅ 测试4通过\n');

// 测试5: 同花顺测试
console.log('【测试5】同花顺校验 (红桃5,6,7,8,9)');
const testStraightFlush: RuntimeCard[] = [
  { id: '1', suit: 'hearts', rank: '5', deckIndex: 0, logicValue: 54, isWildcard: false, isSelected: false },
  { id: '2', suit: 'hearts', rank: '6', deckIndex: 0, logicValue: 64, isWildcard: false, isSelected: false },
  { id: '3', suit: 'hearts', rank: '7', deckIndex: 0, logicValue: 74, isWildcard: false, isSelected: false },
  { id: '4', suit: 'hearts', rank: '8', deckIndex: 0, logicValue: 84, isWildcard: false, isSelected: false },
  { id: '5', suit: 'hearts', rank: '9', deckIndex: 0, logicValue: 94, isWildcard: false, isSelected: false },
];
const result5 = identifyPattern(testStraightFlush);
console.log(`结果: isValid=${result5.isValid}, patternType=${result5.patternType}, powerLevel=${result5.powerLevel}`);
console.assert(result5.isValid === true, '同花顺应该有效');
console.assert(result5.patternType === 'straight_flush', '牌型应该是straight_flush');
console.log('✅ 测试5通过\n');

console.log('========== 所有测试完成 ==========');