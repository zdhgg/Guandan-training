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
  | 'tube'       // 三张（通常作测试使用）
  | 'consecutive_pairs' // 连对
  | 'consecutive_triples' // 钢板
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
  '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7,
  '9': 8, '10': 9, 'J': 10, 'Q': 11, 'K': 12, 'A': 13, 'JOKER': 14
};

/** 数值到点数的反向映射 */
const VALUE_TO_RANK: Record<number, CardRank> = {
  1: '2',
  2: '3',
  3: '4',
  4: '5',
  5: '6',
  6: '7',
  7: '8',
  8: '9',
  9: '10',
  10: 'J',
  11: 'Q',
  12: 'K',
  13: 'A',
  14: 'JOKER'
};

/** 非王牌点数 */
const NON_JOKER_RANKS: CardRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const STRAIGHT_BASE_RANKS: CardRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

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
    if (cards[0].rank === cards[1].rank && (cards[0].rank !== 'JOKER' || cards[0].logicValue === cards[1].logicValue)) {
      return createResult('pair', calculatePower('pair', cards));
    }
    return invalidResult();
  }

  if (n === 3) {
    // 钢板（三张相同）
    if (cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank && (cards[0].rank !== 'JOKER' || (cards[0].logicValue === cards[1].logicValue && cards[1].logicValue === cards[2].logicValue))) {
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

  if (n === 6) {
    if (isConsecutivePairs(cards)) {
      return createResult('consecutive_pairs', calculatePower('consecutive_pairs', cards));
    }
    if (isConsecutiveTriples(cards)) {
      return createResult('consecutive_triples', calculatePower('consecutive_triples', cards));
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

  // ========== 检查连对和钢板 ==========
  if (n === 6) {
    const cpResult = tryReplaceForConsecutivePairs(cards, wildcards, normalCards);
    if (cpResult.isValid) return cpResult;

    const ctResult = tryReplaceForConsecutiveTriples(cards, wildcards, normalCards);
    if (ctResult.isValid) return ctResult;
  }

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
  if (n !== 5) return invalidResult();  // 同花顺正好5张

  // 逢人配替换同花顺时，所有普通牌必须同花色且全部参与目标序列。
  const candidateSuits: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  for (const targetSuit of candidateSuits) {
    const suitCards = normalCards.filter(c => c.suit === targetSuit);
    if (suitCards.length !== normalCards.length) {
      continue;
    }

    const suitRanks = suitCards.map(c => c.rank);
    if (new Set(suitRanks).size !== suitRanks.length || suitRanks.some(rank => rank === 'JOKER')) {
      continue;
    }

    const windows = buildStraightRankWindows();
    for (const windowRanks of windows) {
      const windowSet = new Set(windowRanks);

      if (suitRanks.some(rank => !windowSet.has(rank))) {
        continue;
      }

      const missingRanks = windowRanks.filter(rank => !suitRanks.includes(rank));
      if (missingRanks.length !== numWildcards) {
        continue;
      }

      const replacedCards = buildStraightReplacementCards(suitCards, windowRanks, targetSuit);
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
  if (n !== 5) return invalidResult();  // 顺子正好5张

  const normalRanks = normalCards.map(c => c.rank);
  if (new Set(normalRanks).size !== normalRanks.length || normalRanks.some(rank => rank === 'JOKER')) {
    return invalidResult();
  }

  const windows = buildStraightRankWindows();
  for (const windowRanks of windows) {
    const windowSet = new Set(windowRanks);

    if (normalRanks.some(rank => !windowSet.has(rank))) {
      continue;
    }

    const missingRanks = windowRanks.filter(rank => !normalRanks.includes(rank));
    if (missingRanks.length !== numWildcards) {
      continue;
    }

    const replacedCards = buildStraightReplacementCards(normalCards, windowRanks, 'hearts');
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

function buildStraightRankWindows(): CardRank[][] {
  const windows: CardRank[][] = [];

  // 顺子固定为5张，生成所有可能的5张顺子窗口
  for (let start = 0; start <= STRAIGHT_BASE_RANKS.length - 5; start++) {
    windows.push(STRAIGHT_BASE_RANKS.slice(start, start + 5));
  }

  // 允许 2 作为低端参与顺子：2-3-4-5-6
  windows.push(['2', '3', '4', '5', '6']);

  // 特殊顺子：A-2-3-4-5
  windows.push(['A', '2', '3', '4', '5']);

  return windows;
}

function findMatchingStraightWindow(ranks: CardRank[]): CardRank[] | null {
  // 顺子固定为5张
  if (ranks.length !== 5) {
    return null;
  }

  if (ranks.some(rank => rank === 'JOKER')) {
    return null;
  }

  if (new Set(ranks).size !== ranks.length) {
    return null;
  }

  const rankSet = new Set(ranks);
  const windows = buildStraightRankWindows();
  for (const windowRanks of windows) {
    if (windowRanks.every(rank => rankSet.has(rank))) {
      return windowRanks;
    }
  }

  return null;
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
  sequence: CardRank[],
  suitForWildcard: CardSuit
): RuntimeCard[] {
  const cardByRank = new Map<CardRank, RuntimeCard>();
  for (const card of normalCards) {
    cardByRank.set(card.rank, card);
  }

  const result: RuntimeCard[] = [];
  let wildcardIndex = 0;

  for (const rank of sequence) {
    const existingCard = cardByRank.get(rank);
    if (existingCard) {
      result.push(existingCard);
      continue;
    }

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
  // 必须花色相同
  const suits = new Set(cards.map(c => c.suit));
  if (suits.size !== 1) return invalidResult();

  // 同花顺正好5张
  if (cards.length !== 5) return invalidResult();

  const straightWindow = findMatchingStraightWindow(cards.map(card => card.rank));
  if (!straightWindow) return invalidResult();

  return createResult('straight_flush', calculatePower('straight_flush', cards));
}

/**
 * 检查是否为顺子
 */
function checkStraight(cards: RuntimeCard[]): PatternResult {
  // 顺子正好5张
  if (cards.length !== 5) return invalidResult();
  const straightWindow = findMatchingStraightWindow(cards.map(card => card.rank));
  if (!straightWindow) return invalidResult();

  return createResult('straight', calculatePower('straight', cards));
}

/**
 * 判断是否全为相同点数
 */
function isAllSameRank(cards: RuntimeCard[]): boolean {
  if (cards.length < 4) return false;
  const firstRank = cards[0].rank;
  if (!cards.every(c => c.rank === firstRank)) return false;
  if (firstRank === 'JOKER') {
    return cards.length === 4;
  }
  return true;
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

  const rankCount = new Map<string, number>();
  for (const card of cards) {
    const key = card.rank === 'JOKER' ? `JOKER_${card.logicValue}` : card.rank;
    rankCount.set(key, (rankCount.get(key) || 0) + 1);
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

function getCardRankPower(card: RuntimeCard): number {
  return Math.floor(card.logicValue / 10);
}

function resolveRankOnlyPower(cards: RuntimeCard[]): number {
  return Math.max(...cards.map(getCardRankPower));
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
    'consecutive_pairs': 250,
    'consecutive_triples': 280,
    'plate': 300,
    'straight': 400,
    'bomb': 500,
    'straight_flush': 600,
    'invalid': 0
  };

  // 牌型内比较权重：
  // - 木板（三带二）看三张主牌点数，不看带牌
  // - 其他牌型按牌点比较，不看花色
  let comparePower: number;
  if (patternType === 'plate') {
    comparePower = resolvePlateTriplePower(cards);
  } else if (patternType === 'straight' || patternType === 'straight_flush') {
    comparePower = resolveStraightSequencePower(cards);
  } else {
    comparePower = resolveRankOnlyPower(cards);
  }

  // 炸弹张数加成
  let bombBonus = 0;
  if (patternType === 'bomb') {
    bombBonus = (cards.length - 4) * 50;
  }

  // 同花顺固定5张，无张数加成

  return basePower[patternType] + comparePower + bombBonus;
}

function resolvePlateTriplePower(cards: RuntimeCard[]): number {
  const countByRankPower = new Map<number, number>();
  for (const card of cards) {
    const rankPower = getCardRankPower(card);
    countByRankPower.set(rankPower, (countByRankPower.get(rankPower) || 0) + 1);
  }

  for (const [rankPower, count] of countByRankPower.entries()) {
    if (count === 3) {
      return rankPower;
    }
  }

  // 理论上不会触发（非合法木板），作为兜底保守返回最大点数。
  return Math.max(...Array.from(countByRankPower.keys()));
}

function resolveStraightSequencePower(cards: RuntimeCard[]): number {
  const straightWindow = findMatchingStraightWindow(cards.map(card => card.rank));
  if (!straightWindow) {
    return resolveRankOnlyPower(cards);
  }

  const isLowStraight =
    straightWindow.length === 5 &&
    straightWindow[0] === 'A' &&
    straightWindow[1] === '2' &&
    straightWindow[2] === '3' &&
    straightWindow[3] === '4' &&
    straightWindow[4] === '5';

  if (isLowStraight) {
    return 0;
  }

  const highestRank = straightWindow[straightWindow.length - 1];
  return RANK_ORDER[highestRank];
}

function isBombLikePattern(patternType: PatternType): patternType is 'bomb' | 'straight_flush' {
  return patternType === 'bomb' || patternType === 'straight_flush';
}

function isJokerBomb(cards: RuntimeCard[]): boolean {
  return cards.length === 4 && cards.every((card) => card.rank === 'JOKER');
}

/**
 * 判断 attemptCards 是否可以压过 lastPlayCards
 * @param attemptCards 尝试打出的牌
 * @param lastPlayCards 桌面上最后一手有效牌
 */
export function canBeat(attemptCards: RuntimeCard[], lastPlayCards: RuntimeCard[]): boolean {
  const attemptResult = identifyPattern(attemptCards);
  if (!attemptResult.isValid) {
    return false;
  }

  // 本轮首出：只要是合法牌型即可。
  if (!lastPlayCards || lastPlayCards.length === 0) {
    return true;
  }

  const lastResult = identifyPattern(lastPlayCards);
  if (!lastResult.isValid) {
    return false;
  }

  // 4王炸（四张大小王）是最大的。
  const attemptIsJokerBomb = attemptResult.patternType === 'bomb' && isJokerBomb(attemptCards);
  const lastIsJokerBomb = lastResult.patternType === 'bomb' && isJokerBomb(lastPlayCards);
  if (attemptIsJokerBomb || lastIsJokerBomb) {
    if (lastIsJokerBomb) {
      // 上一家是4王炸：除非你也是4王炸，否则永远压不过。
      return attemptIsJokerBomb && attemptResult.powerLevel > lastResult.powerLevel;
    }

    // 你是4王炸，上一家不是：永远可以压过。
    return true;
  }

  const attemptCount = attemptCards.length;
  const lastCount = lastPlayCards.length;
  const attemptIsBombLike = isBombLikePattern(attemptResult.patternType);
  const lastIsBombLike = isBombLikePattern(lastResult.patternType);

  // 同牌型 + 同张数，按威力比大小（常规规则）。
  if (
    attemptResult.patternType === lastResult.patternType &&
    attemptCount === lastCount &&
    attemptResult.powerLevel > lastResult.powerLevel
  ) {
    return true;
  }

  // 炸弹/同花顺可以直接压制普通牌型。
  if (attemptIsBombLike && !lastIsBombLike) {
    return true;
  }

  // 普通牌型不能压制炸弹/同花顺。
  if (!attemptIsBombLike && lastIsBombLike) {
    return false;
  }

  // 以下仅剩炸弹家族内比对。
  if (attemptResult.patternType === 'bomb' && lastResult.patternType === 'bomb') {
    if (attemptCount !== lastCount) {
      return attemptCount > lastCount;
    }
    return attemptResult.powerLevel > lastResult.powerLevel;
  }

  if (attemptResult.patternType === 'straight_flush' && lastResult.patternType === 'straight_flush') {
    if (attemptCount !== lastCount) {
      return attemptCount > lastCount;
    }
    return attemptResult.powerLevel > lastResult.powerLevel;
  }

  // 同花顺(5张)比5炸大，6炸小。
  if (attemptResult.patternType === 'straight_flush' && lastResult.patternType === 'bomb') {
    return lastCount <= 5;
  }

  if (attemptResult.patternType === 'bomb' && lastResult.patternType === 'straight_flush') {
    return attemptCount >= 6;
  }

  return false;
}


/**
 * 尝试用逢人配凑连对
 */
function tryReplaceForConsecutivePairs(cards: RuntimeCard[], wildcards: RuntimeCard[], normalCards: RuntimeCard[]): PatternResult {
  const n = cards.length;
  if (n !== 6) return invalidResult();

  const normalValues = normalCards.map(c => RANK_ORDER[c.rank]);
  const countMap = new Map<number, number>();
  for (const v of normalValues) {
    countMap.set(v, (countMap.get(v) || 0) + 1);
    if (countMap.get(v)! > 2) return invalidResult();
  }

  for (let start = 1; start <= 13 - 3 + 1; start++) {
    const sequence = [start, start + 1, start + 2];
    let wildcardNeeded = 0;
    for (const seqVal of sequence) {
      const haveCount = countMap.get(seqVal) || 0;
      wildcardNeeded += (2 - haveCount);
    }

    let outOfSeqCards = 0;
    for (const [val, count] of countMap.entries()) {
      if (!sequence.includes(val)) outOfSeqCards += count;
    }

    if (outOfSeqCards === 0 && wildcardNeeded === wildcards.length) {
      const replacedCards = [...normalCards];
      let wcIdx = 0;
      for (const seqVal of sequence) {
        const haveCount = countMap.get(seqVal) || 0;
        const addCount = 2 - haveCount;
        for (let i = 0; i < addCount; i++) {
          replacedCards.push(createSyntheticCard(`wildcard_cp_${seqVal}_${wcIdx++}`, VALUE_TO_RANK[seqVal], 'hearts'));
        }
      }
      return {
        isValid: true,
        patternType: 'consecutive_pairs',
        powerLevel: calculatePower('consecutive_pairs', replacedCards),
        replacedCards
      };
    }
  }
  return invalidResult();
}

/**
 * 尝试用逢人配凑钢板
 */
function tryReplaceForConsecutiveTriples(cards: RuntimeCard[], wildcards: RuntimeCard[], normalCards: RuntimeCard[]): PatternResult {
  const n = cards.length;
  if (n !== 6) return invalidResult();

  const normalValues = normalCards.map(c => RANK_ORDER[c.rank]);
  const countMap = new Map<number, number>();
  for (const v of normalValues) {
    countMap.set(v, (countMap.get(v) || 0) + 1);
    if (countMap.get(v)! > 3) return invalidResult();
  }

  for (let start = 1; start <= 13 - 2 + 1; start++) {
    const sequence = [start, start + 1];
    let wildcardNeeded = 0;
    let outOfSeqCards = 0;
    for (const seqVal of sequence) {
      const haveCount = countMap.get(seqVal) || 0;
      wildcardNeeded += (3 - haveCount);
    }
    for (const [val, count] of countMap.entries()) {
      if (!sequence.includes(val)) outOfSeqCards += count;
    }

    if (outOfSeqCards === 0 && wildcardNeeded === wildcards.length) {
      const replacedCards = [...normalCards];
      let wcIdx = 0;
      for (const seqVal of sequence) {
        const haveCount = countMap.get(seqVal) || 0;
        const addCount = 3 - haveCount;
        for (let i = 0; i < addCount; i++) {
          replacedCards.push(createSyntheticCard(`wildcard_ct_${seqVal}_${wcIdx++}`, VALUE_TO_RANK[seqVal], 'hearts'));
        }
      }
      return {
        isValid: true,
        patternType: 'consecutive_triples',
        powerLevel: calculatePower('consecutive_triples', replacedCards),
        replacedCards
      };
    }
  }
  return invalidResult();
}

function isConsecutivePairs(cards: RuntimeCard[]): boolean {
  if (cards.length !== 6) return false;
  const counts = new Map<number, number>();
  for (const c of cards) {
    const v = RANK_ORDER[c.rank];
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  if (counts.size !== 3) return false;
  const values = Array.from(counts.keys()).sort((a, b) => a - b);
  if (values[1] - values[0] !== 1 || values[2] - values[1] !== 1) return false;
  for (const c of counts.values()) if (c !== 2) return false;
  return true;
}

function isConsecutiveTriples(cards: RuntimeCard[]): boolean {
  if (cards.length !== 6) return false;
  const counts = new Map<number, number>();
  for (const c of cards) {
    const v = RANK_ORDER[c.rank];
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  if (counts.size !== 2) return false;
  const values = Array.from(counts.keys()).sort((a, b) => a - b);
  if (values[1] - values[0] !== 1) return false;
  for (const c of counts.values()) if (c !== 3) return false;
  return true;
}

// ==================== 导出主函数 ====================
// identifyPattern 已在上面导出
