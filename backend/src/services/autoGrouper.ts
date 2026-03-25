import type { CardRank, CardSuit, RuntimeCard } from '../core/cardEngine';
import { identifyPattern } from '../core/ruleValidator';

interface RankWindow {
  key: string;
  ranks: CardRank[];
  score: number;
}

const ORDERED_SUITS: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANK_SEQUENCE: CardRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const STRAIGHT_BASE_SEQUENCE: CardRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const NON_STRAIGHT_RANKS = new Set<CardRank>(['JOKER']);

const STRAIGHT_WINDOWS: RankWindow[] = (() => {
  const windows: RankWindow[] = [];

  // 常规顺子：3-4-5-6-7 到 10-J-Q-K-A
  for (let start = 0; start <= STRAIGHT_BASE_SEQUENCE.length - 5; start += 1) {
    const ranks = STRAIGHT_BASE_SEQUENCE.slice(start, start + 5);
    windows.push({
      key: ranks.join('-'),
      ranks,
      score: start
    });
  }

  // 低端顺子：A-2-3-4-5（合法）
  const lowEdge: CardRank[] = ['A', '2', '3', '4', '5'];
  windows.push({
    key: lowEdge.join('-'),
    ranks: lowEdge,
    score: -1
  });

  return windows;
})();

const TUBE_WINDOWS: RankWindow[] = (() => {
  const windowMap = new Map<string, RankWindow>();

  for (const straight of STRAIGHT_WINDOWS) {
    for (let i = 0; i <= 2; i += 1) {
      const ranks = straight.ranks.slice(i, i + 3);
      const key = ranks.join('-');
      const firstRank = ranks[0];
      const score = key === 'A-2-3' ? -1 : RANK_SEQUENCE.indexOf(firstRank);
      const existing = windowMap.get(key);
      if (!existing || score > existing.score) {
        windowMap.set(key, { key, ranks, score });
      }
    }
  }

  return Array.from(windowMap.values());
})();

const STEEL_PLATE_WINDOWS: RankWindow[] = (() => {
  const windowMap = new Map<string, RankWindow>();

  for (const straight of STRAIGHT_WINDOWS) {
    for (let i = 0; i <= 3; i += 1) {
      const ranks = straight.ranks.slice(i, i + 2);
      const key = ranks.join('-');
      const firstRank = ranks[0];
      const score = key === 'A-2' ? -1 : RANK_SEQUENCE.indexOf(firstRank);
      const existing = windowMap.get(key);
      if (!existing || score > existing.score) {
        windowMap.set(key, { key, ranks, score });
      }
    }
  }

  return Array.from(windowMap.values());
})();

const compareCardByLogic = (left: RuntimeCard, right: RuntimeCard): number => {
  if (left.logicValue !== right.logicValue) {
    return right.logicValue - left.logicValue;
  }
  return left.id.localeCompare(right.id);
};

function isJokerCard(card: RuntimeCard): boolean {
  return card.suit === 'joker' || card.rank === 'JOKER';
}

function removeCardsById(pool: RuntimeCard[], cardsToRemove: RuntimeCard[]): void {
  const idSet = new Set(cardsToRemove.map((card) => card.id));
  for (let i = pool.length - 1; i >= 0; i -= 1) {
    if (idSet.has(pool[i].id)) {
      pool.splice(i, 1);
    }
  }
}

function getCardKey(card: RuntimeCard): string {
  if (card.rank === 'JOKER') {
    return card.logicValue > 165 ? 'BIG_JOKER' : 'SMALL_JOKER';
  }
  return card.rank;
}

function buildRankMap(cards: RuntimeCard[]): Map<string, RuntimeCard[]> {
  const rankMap = new Map<string, RuntimeCard[]>();
  for (const card of cards) {
    const key = getCardKey(card);
    const bucket = rankMap.get(key);
    if (bucket) {
      bucket.push(card);
    } else {
      rankMap.set(key, [card]);
    }
  }

  for (const bucket of rankMap.values()) {
    bucket.sort(compareCardByLogic);
  }
  return rankMap;
}

function buildSuitRankMap(cards: RuntimeCard[]): Map<CardSuit, Map<string, RuntimeCard[]>> {
  const suitRankMap = new Map<CardSuit, Map<string, RuntimeCard[]>>();
  for (const card of cards) {
    const byRank = suitRankMap.get(card.suit) ?? new Map<string, RuntimeCard[]>();
    const key = getCardKey(card);
    const bucket = byRank.get(key);
    if (bucket) {
      bucket.push(card);
    } else {
      byRank.set(key, [card]);
    }
    suitRankMap.set(card.suit, byRank);
  }

  for (const byRank of suitRankMap.values()) {
    for (const bucket of byRank.values()) {
      bucket.sort(compareCardByLogic);
    }
  }
  return suitRankMap;
}

function buildFrequencyMap(cards: RuntimeCard[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const card of cards) {
    const key = getCardKey(card);
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }
  return frequency;
}

function isStraightRank(rank: CardRank): boolean {
  return !NON_STRAIGHT_RANKS.has(rank);
}

function pickBestExactWindow(
  rankMap: Map<string, RuntimeCard[]>,
  windows: RankWindow[]
): RuntimeCard[] | null {
  let bestCards: RuntimeCard[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestTopLogic = Number.NEGATIVE_INFINITY;

  for (const window of windows) {
    const selected: RuntimeCard[] = [];
    let valid = true;

    for (const rank of window.ranks) {
      const bucket = rankMap.get(rank);
      if (!bucket || bucket.length === 0) {
        valid = false;
        break;
      }
      selected.push(bucket[0]);
    }

    if (!valid) {
      continue;
    }

    const topLogic = Math.max(...selected.map((card) => card.logicValue));
    if (
      window.score > bestScore ||
      (window.score === bestScore && topLogic > bestTopLogic)
    ) {
      bestCards = selected;
      bestScore = window.score;
      bestTopLogic = topLogic;
    }
  }

  return bestCards;
}

function pickBestAlmostStraight(singlePool: RuntimeCard[]): RuntimeCard[] | null {
  const straightSingles = singlePool.filter((card) => isStraightRank(card.rank));
  const rankMap = buildRankMap(straightSingles);

  let bestCards: RuntimeCard[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestTopLogic = Number.NEGATIVE_INFINITY;

  for (const window of STRAIGHT_WINDOWS) {
    const presentCards: RuntimeCard[] = [];
    let missing = 0;

    for (const rank of window.ranks) {
      const bucket = rankMap.get(rank);
      if (!bucket || bucket.length === 0) {
        missing += 1;
        continue;
      }
      presentCards.push(bucket[0]);
    }

    if (missing !== 1 || presentCards.length !== 4) {
      continue;
    }

    const topLogic = Math.max(...presentCards.map((card) => card.logicValue));
    if (
      window.score > bestScore ||
      (window.score === bestScore && topLogic > bestTopLogic)
    ) {
      bestCards = presentCards;
      bestScore = window.score;
      bestTopLogic = topLogic;
    }
  }

  return bestCards;
}

function extractStraightFlushes(pool: RuntimeCard[]): RuntimeCard[][] {
  const groups: RuntimeCard[][] = [];

  while (true) {
    const naturalForFlush = pool.filter(
      (card) => card.suit !== 'joker' && card.rank !== 'JOKER' && isStraightRank(card.rank)
    );
    const suitRankMap = buildSuitRankMap(naturalForFlush);

    // Phase 1: Loss evaluation (don't break 4-bombs)
    const rankMapBefore = buildRankMap(pool);
    const bombRanks = new Set<string>();
    for (const [rank, cards] of rankMapBefore.entries()) {
      if (cards.length >= 4) bombRanks.add(rank);
    }

    let best: RuntimeCard[] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestTopLogic = Number.NEGATIVE_INFINITY;

    for (const suit of ORDERED_SUITS) {
      const rankMap = suitRankMap.get(suit);
      if (!rankMap) {
        continue;
      }

      for (const window of STRAIGHT_WINDOWS) {
        const selected: RuntimeCard[] = [];
        let valid = true;
        let brokenBombs = 0;

        for (const rank of window.ranks) {
          const bucket = rankMap.get(rank);
          if (!bucket || bucket.length === 0) {
            valid = false;
            break;
          }
          selected.push(bucket[0]);
          if (bombRanks.has(rank)) {
            brokenBombs += 1;
          }
        }

        if (!valid) {
          continue;
        }

        if (brokenBombs > 0) {
          continue;
        }

        const topLogic = Math.max(...selected.map((card) => card.logicValue));
        if (
          window.score > bestScore ||
          (window.score === bestScore && topLogic > bestTopLogic)
        ) {
          best = selected;
          bestScore = window.score;
          bestTopLogic = topLogic;
        }
      }
    }

    if (!best) {
      break;
    }

    groups.push(best);
    removeCardsById(pool, best);
  }

  return groups;
}

function extractBombs(pool: RuntimeCard[]): RuntimeCard[][] {
  const rankMap = buildRankMap(pool);
  const bombs: RuntimeCard[][] = [];

  for (const cards of rankMap.values()) {
    if (cards.length >= 4) {
      bombs.push([...cards]);
    }
  }

  bombs.sort((left, right) => {
    const leftTop = Math.max(...left.map((card) => card.logicValue));
    const rightTop = Math.max(...right.map((card) => card.logicValue));
    return rightTop - leftTop;
  });

  for (const bomb of bombs) {
    removeCardsById(pool, bomb);
  }

  return bombs;
}

function extractTubes(pool: RuntimeCard[]): RuntimeCard[][] {
  const groups: RuntimeCard[][] = [];

  while (true) {
    const tubeCandidates = pool.filter((card) => card.rank !== 'JOKER' && isStraightRank(card.rank));
    const rankMap = buildRankMap(tubeCandidates);
    let selected: RuntimeCard[] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestTopLogic = Number.NEGATIVE_INFINITY;

    for (const window of TUBE_WINDOWS) {
      const candidate: RuntimeCard[] = [];
      let valid = true;

      for (const rank of window.ranks) {
        const bucket = rankMap.get(rank);
        if (!bucket || bucket.length < 2) {
          valid = false;
          break;
        }
        candidate.push(bucket[0], bucket[1]);
      }

      if (!valid || candidate.length !== 6) {
        continue;
      }

      const topLogic = Math.max(...candidate.map((card) => card.logicValue));
      if (
        window.score > bestScore ||
        (window.score === bestScore && topLogic > bestTopLogic)
      ) {
        selected = candidate;
        bestScore = window.score;
        bestTopLogic = topLogic;
      }
    }

    if (!selected || selected.length !== 6) {
      break;
    }

    groups.push(selected);
    removeCardsById(pool, selected);
  }

  return groups;
}

function extractBombsWithWildcard(pool: RuntimeCard[], wildcards: RuntimeCard[]): RuntimeCard[][] {
  const groups: RuntimeCard[][] = [];

  while (wildcards.length > 0) {
    const rankMap = buildRankMap(pool);
    const triples = Array.from(rankMap.values())
      .filter((cards) => cards.length === 3)
      .sort((a, b) => compareCardByLogic(b[0], a[0])); // DESC: big triples first

    if (triples.length === 0) {
      break;
    }

    const selectedTriple = triples[0];
    const wildcard = wildcards.shift() as RuntimeCard;
    const bomb = [...selectedTriple, wildcard];
    groups.push(bomb);
    removeCardsById(pool, selectedTriple);
  }

  return groups;
}

function extractSteelPlates(pool: RuntimeCard[]): RuntimeCard[][] {
  const groups: RuntimeCard[][] = [];

  while (true) {
    const candidates = pool.filter((card) => card.rank !== 'JOKER' && isStraightRank(card.rank));
    const rankMap = buildRankMap(candidates);
    let selected: RuntimeCard[] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestTopLogic = Number.NEGATIVE_INFINITY;

    for (const window of STEEL_PLATE_WINDOWS) {
      const candidate: RuntimeCard[] = [];
      let valid = true;

      for (const rank of window.ranks) {
        const bucket = rankMap.get(rank);
        if (!bucket || bucket.length < 3) {
          valid = false;
          break;
        }
        candidate.push(bucket[0], bucket[1], bucket[2]);
      }

      if (!valid || candidate.length !== 6) {
        continue;
      }

      const topLogic = Math.max(...candidate.map((card) => card.logicValue));
      if (
        window.score > bestScore ||
        (window.score === bestScore && topLogic > bestTopLogic)
      ) {
        selected = candidate;
        bestScore = window.score;
        bestTopLogic = topLogic;
      }
    }

    if (!selected) {
      break;
    }

    groups.push(selected);
    removeCardsById(pool, selected);
  }

  return groups;
}

function splitResidualByFrequency(pool: RuntimeCard[]): {
  triples: RuntimeCard[][];
  pairs: RuntimeCard[][];
  singles: RuntimeCard[];
} {
  const rankMap = buildRankMap(pool);
  const triples: RuntimeCard[][] = [];
  const pairs: RuntimeCard[][] = [];
  const singles: RuntimeCard[] = [];

  for (const cards of rankMap.values()) {
    if (cards.length === 3) {
      triples.push([...cards]);
      continue;
    }
    if (cards.length === 2) {
      pairs.push([...cards]);
      continue;
    }
    if (cards.length === 1) {
      singles.push(cards[0]);
      continue;
    }
  }

  triples.sort((a, b) => compareCardByLogic(a[0], b[0]));
  pairs.sort((a, b) => compareCardByLogic(a[0], b[0]));
  singles.sort(compareCardByLogic);

  return { triples, pairs, singles };
}

function extractStraightsFromSingles(singlePool: RuntimeCard[]): RuntimeCard[][] {
  const groups: RuntimeCard[][] = [];

  while (true) {
    const rankMap = buildRankMap(singlePool.filter((card) => isStraightRank(card.rank)));
    const straight = pickBestExactWindow(rankMap, STRAIGHT_WINDOWS);
    if (!straight || straight.length !== 5) {
      break;
    }

    groups.push(straight);
    removeCardsById(singlePool, straight);
  }

  return groups;
}

function tryAttachWildcardToExistingGroups(
  wildcard: RuntimeCard,
  existingGroups: RuntimeCard[][]
): boolean {
  for (const group of existingGroups) {
    if (group.length === 0) {
      continue;
    }

    // 百搭禁区：不允许与大小王发生任何组合。
    if (group.some((card) => isJokerCard(card))) {
      continue;
    }

    const merged = [...group, wildcard];
    const check = identifyPattern(merged);
    if (check.isValid) {
      group.push(wildcard);
      return true;
    }
  }

  return false;
}

function consumeWildcards(
  wildcards: RuntimeCard[],
  leftoverTriples: RuntimeCard[][],
  singles: RuntimeCard[],
  grouped: RuntimeCard[][]
): void {
  const wildcardPool = [...wildcards].sort(compareCardByLogic);

  // 5.1 三张 + 百搭 => 炸弹
  while (wildcardPool.length > 0 && leftoverTriples.length > 0) {
    const wildcard = wildcardPool.shift() as RuntimeCard;
    const triple = leftoverTriples.shift() as RuntimeCard[];
    grouped.push([...triple, wildcard]);
  }

  // 5.2 优先把百搭与同级非百搭牌配对，避免乱搭。
  while (wildcardPool.length > 0) {
    const wildcard = wildcardPool[0];
    const sameRankIndex = singles.findIndex(
      (card) => !card.isWildcard && !isJokerCard(card) && card.rank === wildcard.rank
    );
    if (sameRankIndex < 0) {
      break;
    }

    wildcardPool.shift();
    const partner = singles.splice(sameRankIndex, 1)[0];
    grouped.push([partner, wildcard]);
  }

  // 5.3 单牌四缺一顺子 + 百搭 => 顺子（尽量消灭单牌）
  while (wildcardPool.length > 0) {
    const almostStraight = pickBestAlmostStraight(singles);
    if (!almostStraight) {
      break;
    }

    const wildcard = wildcardPool.shift() as RuntimeCard;
    const merged = [...almostStraight, wildcard];
    const check = identifyPattern(merged);
    if (check.isValid) {
      grouped.push(merged);
      removeCardsById(singles, almostStraight);
      continue;
    }

    // 若当前顺子补位被校验器拒绝，则停止该策略，避免死循环。
    wildcardPool.unshift(wildcard);
    break;
  }

  // 5.4 百搭与非王单牌直接配对（王禁区）。
  singles.sort(compareCardByLogic);
  while (wildcardPool.length > 0) {
    const nonJokerSingleIndex = singles.findIndex((card) => !isJokerCard(card));
    if (nonJokerSingleIndex < 0) {
      break;
    }

    const wildcard = wildcardPool.shift() as RuntimeCard;
    const single = singles.splice(nonJokerSingleIndex, 1)[0];
    grouped.push([single, wildcard]);
  }

  // 5.5 百搭两两成对
  while (wildcardPool.length >= 2) {
    const first = wildcardPool.shift() as RuntimeCard;
    const second = wildcardPool.shift() as RuntimeCard;
    grouped.push([first, second]);
  }

  // 5.6 若还剩 1 张百搭，尝试并入已有非王牌堆；禁止和王组合。
  if (wildcardPool.length === 1) {
    const wildcard = wildcardPool.shift() as RuntimeCard;
    const attached = tryAttachWildcardToExistingGroups(wildcard, grouped);

    if (!attached) {
      const nonJokerSingleIndex = singles.findIndex((card) => !isJokerCard(card));
      if (nonJokerSingleIndex >= 0) {
        const single = singles.splice(nonJokerSingleIndex, 1)[0];
        grouped.push([single, wildcard]);
        return;
      }
    }

    if (!attached) {
      // 无法安全组合时，保留为单张，后续由收尾阶段输出。
      grouped.push([wildcard]);
    }
  }
}

function cleanupInvalidAndReturn(groups: RuntimeCard[][]): RuntimeCard[][] {
  const validGroups: RuntimeCard[][] = [];
  const invalidSingles: RuntimeCard[] = [];

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    if (group.length <= 1) {
      validGroups.push(group);
      continue;
    }

    const result = identifyPattern(group);
    if (result.isValid) {
      validGroups.push(group);
      continue;
    }

    console.warn('[autoGroupCards] 检测到并拆解非法牌堆', {
      groupIndex: i,
      size: group.length,
      patternType: result.patternType,
      cards: group.map((card) => card.id)
    });

    invalidSingles.push(...group);
  }

  invalidSingles.sort(compareCardByLogic).forEach(card => {
    validGroups.push([card]);
  });

  return validGroups;
}

function strategyBalanced(cards: RuntimeCard[]): RuntimeCard[][] {
  const wildcards = cards.filter((card) => card.isWildcard).sort(compareCardByLogic);
  const naturalPool = cards.filter((card) => !card.isWildcard).sort(compareCardByLogic);

  const grouped: RuntimeCard[][] = [];

  const allJokers = naturalPool.filter(c => c.rank === 'JOKER');
  if (allJokers.length === 4) {
    grouped.push(allJokers);
    removeCardsById(naturalPool, allJokers);
  }

  const straightFlushes = extractStraightFlushes(naturalPool);
  grouped.push(...straightFlushes);

  const bombs = extractBombs(naturalPool);
  grouped.push(...bombs);

  const wildcardBombs = extractBombsWithWildcard(naturalPool, wildcards);
  grouped.push(...wildcardBombs);

  const tubes = extractTubes(naturalPool);
  grouped.push(...tubes);

  const plates = extractSteelPlates(naturalPool);
  grouped.push(...plates);

  const { triples: leftoverTriples, pairs: residualPairs, singles } = splitResidualByFrequency(naturalPool);

  const straights = extractStraightsFromSingles(singles);
  grouped.push(...straights);

  grouped.push(...residualPairs);

  consumeWildcards(wildcards, leftoverTriples, singles, grouped);

  grouped.push(...leftoverTriples);
  singles.sort(compareCardByLogic);
  for (const single of singles) {
    grouped.push([single]);
  }

  return cleanupInvalidAndReturn(grouped);
}

function strategyMaxBombs(cards: RuntimeCard[]): RuntimeCard[][] {
  const wildcards = cards.filter((card) => card.isWildcard).sort(compareCardByLogic);
  const naturalPool = cards.filter((card) => !card.isWildcard).sort(compareCardByLogic);

  const grouped: RuntimeCard[][] = [];

  const allJokers = naturalPool.filter(c => c.rank === 'JOKER');
  if (allJokers.length === 4) {
    grouped.push(allJokers);
    removeCardsById(naturalPool, allJokers);
  }

  // MaxBombs: Extract bombs aggressively before straight flushes
  const bombs = extractBombs(naturalPool);
  grouped.push(...bombs);

  const wildcardBombs = extractBombsWithWildcard(naturalPool, wildcards);
  grouped.push(...wildcardBombs);

  // Then extract straight flushes if still possible
  const straightFlushes = extractStraightFlushes(naturalPool);
  grouped.push(...straightFlushes);

  // Skip Tubes and Plates to avoid breaking small pairs and triples
  const { triples: leftoverTriples, pairs: residualPairs, singles } = splitResidualByFrequency(naturalPool);

  // Consume wildcards strictly for triples and pairs, not straights
  while (wildcards.length > 0 && leftoverTriples.length > 0) {
    const wildcard = wildcards.shift() as RuntimeCard;
    const triple = leftoverTriples.shift() as RuntimeCard[];
    grouped.push([...triple, wildcard]);
  }

  while (wildcards.length > 1 && residualPairs.length > 0) {
    const wc1 = wildcards.shift() as RuntimeCard;
    const wc2 = wildcards.shift() as RuntimeCard;
    const pair = residualPairs.shift() as RuntimeCard[];
    grouped.push([...pair, wc1, wc2]); // Turn pair into 4-bomb
  }

  const straights = extractStraightsFromSingles(singles);
  grouped.push(...straights);
  grouped.push(...residualPairs);

  consumeWildcards(wildcards, leftoverTriples, singles, grouped);

  grouped.push(...leftoverTriples);
  singles.sort(compareCardByLogic);
  for (const single of singles) {
    grouped.push([single]);
  }

  return cleanupInvalidAndReturn(grouped);
}

function strategyMinHands(cards: RuntimeCard[]): RuntimeCard[][] {
  const wildcards = cards.filter((card) => card.isWildcard).sort(compareCardByLogic);
  const naturalPool = cards.filter((card) => !card.isWildcard).sort(compareCardByLogic);

  const grouped: RuntimeCard[][] = [];

  const allJokers = naturalPool.filter(c => c.rank === 'JOKER');
  if (allJokers.length === 4) {
    grouped.push(allJokers);
    removeCardsById(naturalPool, allJokers);
  }

  // MinHands: Prioritize long combinations
  const straightFlushes = extractStraightFlushes(naturalPool);
  grouped.push(...straightFlushes);

  const tubes = extractTubes(naturalPool);
  grouped.push(...tubes);

  const plates = extractSteelPlates(naturalPool);
  grouped.push(...plates);

  // Extracted bombs only after blocks
  const bombs = extractBombs(naturalPool);
  grouped.push(...bombs);

  const { triples: leftoverTriples, pairs: residualPairs, singles } = splitResidualByFrequency(naturalPool);

  const straights = extractStraightsFromSingles(singles);
  grouped.push(...straights);

  // Use wildcards to form straights from 4 singles first
  wildcards.sort(compareCardByLogic);
  while (wildcards.length > 0) {
    const almostStraight = pickBestAlmostStraight(singles);
    if (!almostStraight) break;
    const wildcard = wildcards.shift() as RuntimeCard;
    const merged = [...almostStraight, wildcard];
    const check = identifyPattern(merged);
    if (check.isValid) {
      grouped.push(merged);
      removeCardsById(singles, almostStraight);
    } else {
      wildcards.unshift(wildcard);
      break;
    }
  }

  const wildcardBombs = extractBombsWithWildcard(naturalPool, wildcards);
  grouped.push(...wildcardBombs);

  grouped.push(...residualPairs);
  consumeWildcards(wildcards, leftoverTriples, singles, grouped);

  grouped.push(...leftoverTriples);
  for (const single of singles) {
    grouped.push([single]);
  }

  return cleanupInvalidAndReturn(grouped);
}

function removeCardsImmutable(pool: RuntimeCard[], cardsToRemove: RuntimeCard[]): RuntimeCard[] {
  const removeSet = new Set(cardsToRemove.map((card) => card.id));
  return pool.filter((card) => !removeSet.has(card.id));
}

function makeGroupingKey(groups: RuntimeCard[][]): string {
  return groups
    .map((group) => group.map((card) => card.id).sort().join(','))
    .sort()
    .join('|');
}

function pushValidCandidate(
  candidates: RuntimeCard[][],
  dedupe: Set<string>,
  candidate: RuntimeCard[]
): void {
  if (!candidate || candidate.length === 0) {
    return;
  }
  const key = candidate.map((card) => card.id).sort().join(',');
  if (dedupe.has(key)) {
    return;
  }
  if (!identifyPattern(candidate).isValid) {
    return;
  }
  dedupe.add(key);
  candidates.push(candidate);
}

function generateBeamCandidates(pool: RuntimeCard[]): RuntimeCard[][] {
  const candidates: RuntimeCard[][] = [];
  const dedupe = new Set<string>();
  const sortedPool = [...pool].sort(compareCardByLogic);

  if (sortedPool.length === 0) {
    return candidates;
  }

  const rankMap = buildRankMap(sortedPool);
  for (const cards of rankMap.values()) {
    if (cards.length >= 4) {
      for (let size = 4; size <= Math.min(cards.length, 6); size += 1) {
        pushValidCandidate(candidates, dedupe, cards.slice(0, size));
      }
    }
    if (cards.length >= 3) {
      pushValidCandidate(candidates, dedupe, cards.slice(0, 3));
    }
    if (cards.length >= 2) {
      pushValidCandidate(candidates, dedupe, cards.slice(0, 2));
    }
  }

  const straightRankMap = buildRankMap(sortedPool.filter((card) => card.rank !== 'JOKER'));
  for (const window of STRAIGHT_WINDOWS) {
    const selected: RuntimeCard[] = [];
    let valid = true;
    for (const rank of window.ranks) {
      const bucket = straightRankMap.get(rank);
      if (!bucket || bucket.length === 0) {
        valid = false;
        break;
      }
      selected.push(bucket[0]);
    }
    if (valid) {
      pushValidCandidate(candidates, dedupe, selected);
    }
  }

  const suitRankMap = buildSuitRankMap(
    sortedPool.filter((card) => card.suit !== 'joker' && card.rank !== 'JOKER' && isStraightRank(card.rank))
  );
  for (const suit of ORDERED_SUITS) {
    const byRank = suitRankMap.get(suit);
    if (!byRank) {
      continue;
    }
    for (const window of STRAIGHT_WINDOWS) {
      const selected: RuntimeCard[] = [];
      let valid = true;
      for (const rank of window.ranks) {
        const bucket = byRank.get(rank);
        if (!bucket || bucket.length === 0) {
          valid = false;
          break;
        }
        selected.push(bucket[0]);
      }
      if (valid) {
        pushValidCandidate(candidates, dedupe, selected);
      }
    }
  }

  for (const window of TUBE_WINDOWS) {
    const selected: RuntimeCard[] = [];
    let valid = true;
    for (const rank of window.ranks) {
      const bucket = rankMap.get(rank);
      if (!bucket || bucket.length < 2) {
        valid = false;
        break;
      }
      selected.push(bucket[0], bucket[1]);
    }
    if (valid) {
      pushValidCandidate(candidates, dedupe, selected);
    }
  }

  for (const window of STEEL_PLATE_WINDOWS) {
    const selected: RuntimeCard[] = [];
    let valid = true;
    for (const rank of window.ranks) {
      const bucket = rankMap.get(rank);
      if (!bucket || bucket.length < 3) {
        valid = false;
        break;
      }
      selected.push(bucket[0], bucket[1], bucket[2]);
    }
    if (valid) {
      pushValidCandidate(candidates, dedupe, selected);
    }
  }

  let plateComboCount = 0;
  const rankEntries = Array.from(rankMap.entries());
  for (const [tripleRank, tripleCards] of rankEntries) {
    if (tripleCards.length < 3) {
      continue;
    }
    for (const [pairRank, pairCards] of rankEntries) {
      if (pairRank === tripleRank || pairCards.length < 2) {
        continue;
      }
      pushValidCandidate(candidates, dedupe, [...tripleCards.slice(0, 3), ...pairCards.slice(0, 2)]);
      plateComboCount += 1;
      if (plateComboCount >= 8) {
        break;
      }
    }
    if (plateComboCount >= 8) {
      break;
    }
  }

  const wildcards = sortedPool.filter((card) => card.isWildcard);
  if (wildcards.length > 0) {
    const nonJokerSingles = sortedPool.filter((card) => !card.isWildcard && !isJokerCard(card));
    for (const card of nonJokerSingles.slice(0, 4)) {
      pushValidCandidate(candidates, dedupe, [card, wildcards[0]]);
    }
    const almostStraight = pickBestAlmostStraight(nonJokerSingles);
    if (almostStraight) {
      pushValidCandidate(candidates, dedupe, [...almostStraight, wildcards[0]]);
    }
    if (wildcards.length >= 2) {
      pushValidCandidate(candidates, dedupe, [wildcards[0], wildcards[1]]);
    }
  }

  pushValidCandidate(candidates, dedupe, [sortedPool[0]]);
  if (sortedPool.length > 1) {
    pushValidCandidate(candidates, dedupe, [sortedPool[sortedPool.length - 1]]);
  }

  return candidates
    .sort((left, right) => {
      if (left.length !== right.length) {
        return right.length - left.length;
      }
      const leftPower = identifyPattern(left).powerLevel;
      const rightPower = identifyPattern(right).powerLevel;
      return rightPower - leftPower;
    })
    .slice(0, 24);
}

interface BeamSearchState {
  remaining: RuntimeCard[];
  groups: RuntimeCard[][];
  estimateScore: number;
}

interface BeamSearchOptions {
  beamWidth: number;
  topK: number;
  maxStates: number;
  maxMs: number;
}

function runBeamSearchGroupings(
  cards: RuntimeCard[],
  context: GroupingContext | undefined,
  options: BeamSearchOptions
): GroupingStrategyResult[] {
  if (cards.length === 0) {
    return [];
  }

  const startedAt = Date.now();
  const initialState: BeamSearchState = {
    remaining: [...cards],
    groups: [],
    estimateScore: evaluateHandValue(cards.map((card) => [card]), context)
  };

  let exploredStates = 0;
  let beam: BeamSearchState[] = [initialState];
  const completed: BeamSearchState[] = [];

  while (beam.length > 0 && exploredStates < options.maxStates) {
    if (Date.now() - startedAt > options.maxMs) {
      break;
    }

    const nextStates: BeamSearchState[] = [];
    for (const state of beam) {
      if (state.remaining.length === 0) {
        completed.push(state);
        continue;
      }

      const candidates = generateBeamCandidates(state.remaining);
      const usableCandidates = candidates.length > 0 ? candidates : [[state.remaining[0]]];

      for (const candidate of usableCandidates) {
        const remaining = removeCardsImmutable(state.remaining, candidate);
        const groups = [...state.groups, candidate];
        const optimisticTail = remaining.map((card) => [card]);
        const estimateScore = evaluateHandValue([...groups, ...optimisticTail], context);
        nextStates.push({ remaining, groups, estimateScore });
        exploredStates += 1;
        if (exploredStates >= options.maxStates) {
          break;
        }
      }

      if (exploredStates >= options.maxStates || Date.now() - startedAt > options.maxMs) {
        break;
      }
    }

    if (nextStates.length === 0) {
      break;
    }

    const dedupedNext = new Map<string, BeamSearchState>();
    for (const state of nextStates) {
      const key = `${state.remaining.map((card) => card.id).sort().join(',')}#${state.groups.length}`;
      const current = dedupedNext.get(key);
      if (!current || state.estimateScore > current.estimateScore) {
        dedupedNext.set(key, state);
      }
    }

    beam = Array.from(dedupedNext.values())
      .sort((left, right) => right.estimateScore - left.estimateScore)
      .slice(0, options.beamWidth);
  }

  if (completed.length === 0) {
    for (const state of beam) {
      const fallbackGroups = [...state.groups, ...state.remaining.map((card) => [card])];
      completed.push({
        remaining: [],
        groups: fallbackGroups,
        estimateScore: evaluateHandValue(fallbackGroups, context)
      });
    }
  }

  const dedupedResults = new Map<string, GroupingStrategyResult>();
  for (const state of completed) {
    const groups = cleanupInvalidAndReturn(state.groups.map((group) => [...group]));
    const evaluated = evaluateHandValueDetailed(groups, context);
    const key = makeGroupingKey(groups);
    const existing = dedupedResults.get(key);
    if (!existing || evaluated.totalScore > existing.score) {
      dedupedResults.set(key, {
        strategyName: 'BeamSearch',
        groups,
        score: evaluated.totalScore,
        scoreBreakdown: evaluated.breakdown,
        reasonTags: [...evaluated.reasonTags, 'beam_search_topk']
      });
    }
  }

  return Array.from(dedupedResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, options.topK)
    .map((result, index) => ({
      ...result,
      strategyName: `BeamSearch#${index + 1}`
    }));
}

export interface GroupingStrategyResult {
  strategyName: string;
  groups: RuntimeCard[][];
  score: number;
  scoreBreakdown?: GroupingScoreBreakdown;
  reasonTags?: string[];
}

export type GroupingMode = 'training' | 'battle';

export interface GroupingContextPlayer {
  cardsLeft: number;
  isTeammate?: boolean;
  rank?: number;
}

export interface GroupingContext {
  mode?: GroupingMode;
  players?: GroupingContextPlayer[];
  currentTurn?: number;
  currentLevel?: string;
  lastPlay?: unknown;
}

export interface GroupingScoreBreakdown {
  handCountPenalty: number;
  patternContribution: number;
  contextAdjustment: number;
  totalScore: number;
}

interface ScoringProfile {
  handCountPenalty: number;
  invalidGroupPenalty: number;
  singlePenalty: number;
  pairPenalty: number;
  bombBase: number;
  bombLengthBonus: number;
  straightBonus: number;
  blockPerCardBonus: number;
  highSingleBonus: number;
  highPairBonus: number;
}

const TRAINING_PROFILE: ScoringProfile = {
  handCountPenalty: 56,
  invalidGroupPenalty: 26,
  singlePenalty: 38,
  pairPenalty: 10,
  bombBase: 120,
  bombLengthBonus: 10,
  straightBonus: 42,
  blockPerCardBonus: 8,
  highSingleBonus: 4,
  highPairBonus: 2,
};

const BATTLE_PROFILE: ScoringProfile = {
  handCountPenalty: 30,
  invalidGroupPenalty: 10,
  singlePenalty: 20,
  pairPenalty: 5,
  bombBase: 150,
  bombLengthBonus: 20,
  straightBonus: 30,
  blockPerCardBonus: 5,
  highSingleBonus: 10,
  highPairBonus: 5,
};

function resolveGroupingMode(context?: GroupingContext): GroupingMode {
  if (context?.mode === 'training') {
    return 'training';
  }
  return 'battle';
}

function resolveBattleContextAdjustment(context?: GroupingContext): {
  bombWeight: number;
  singlePenaltyWeight: number;
  contextAdjustment: number;
  reasonTags: string[];
} {
  const reasonTags: string[] = [];
  let bombWeight = 1;
  let singlePenaltyWeight = 1;
  let contextAdjustment = 0;

  if (context?.players && context.players.length > 0) {
    const isEnemyDanger = context.players.some((p) => !p.isTeammate && p.cardsLeft <= 5 && !p.rank);
    if (isEnemyDanger) {
      bombWeight = 2.5;
      singlePenaltyWeight = 3;
      contextAdjustment += 35;
      reasonTags.push('enemy_sprint_risk');
    }
  }

  return { bombWeight, singlePenaltyWeight, contextAdjustment, reasonTags };
}

export function generateAllGroupings(cards: RuntimeCard[], context?: GroupingContext): GroupingStrategyResult[] {
  if (cards.length === 0) return [];

  const strategies = [
    { name: 'Balanced', run: () => strategyBalanced([...cards]) },
    { name: 'MaxBombs', run: () => strategyMaxBombs([...cards]) },
    { name: 'MinHands', run: () => strategyMinHands([...cards]) }
  ];

  const results: GroupingStrategyResult[] = [];

  for (const strat of strategies) {
    const groups = strat.run();
    const evaluated = evaluateHandValueDetailed(groups, context);
    results.push({
      strategyName: strat.name,
      groups,
      score: evaluated.totalScore,
      scoreBreakdown: evaluated.breakdown,
      reasonTags: evaluated.reasonTags,
    });
  }

  try {
    const beamResults = runBeamSearchGroupings(cards, context, {
      beamWidth: 24,
      topK: 3,
      maxStates: 2200,
      maxMs: 60
    });
    results.push(...beamResults);
  } catch (error) {
    console.warn('[AutoGrouper] beam search failed, fallback to heuristic strategies only', error);
  }

  const deduped = new Map<string, GroupingStrategyResult>();
  for (const result of results) {
    const key = makeGroupingKey(result.groups);
    const existing = deduped.get(key);
    if (!existing || result.score > existing.score) {
      deduped.set(key, result);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => b.score - a.score);
}

export function autoGroupCards(cards: RuntimeCard[], context?: any): RuntimeCard[][] {
  const results = generateAllGroupings(cards, context);
  if (results.length === 0) return [];

  const best = results[0];
  console.log(`[AutoGrouper] Selected Strategy: ${best.strategyName} with score: ${best.score}`);
  return best.groups;
}

function evaluateHandValueDetailed(groups: RuntimeCard[][], context?: GroupingContext): {
  totalScore: number;
  breakdown: GroupingScoreBreakdown;
  reasonTags: string[];
} {
  const mode = resolveGroupingMode(context);
  const profile = mode === 'training' ? TRAINING_PROFILE : BATTLE_PROFILE;
  const reasonTags: string[] = [mode === 'training' ? 'objective_min_hands' : 'objective_battle_balance'];

  let bombWeight = 1;
  let singlePenaltyWeight = 1;
  let contextAdjustment = 0;

  if (mode === 'battle') {
    const adjustment = resolveBattleContextAdjustment(context);
    bombWeight = adjustment.bombWeight;
    singlePenaltyWeight = adjustment.singlePenaltyWeight;
    contextAdjustment = adjustment.contextAdjustment;
    reasonTags.push(...adjustment.reasonTags);
  } else {
    reasonTags.push('single_control_strict');
  }

  let patternContribution = 0;
  for (const group of groups) {
    if (group.length === 0) continue;

    const pattern = identifyPattern(group);
    if (!pattern.isValid) {
      patternContribution -= group.length * profile.invalidGroupPenalty * singlePenaltyWeight;
      reasonTags.push('invalid_group_penalty');
      continue;
    }

    switch (pattern.patternType) {
      case 'bomb':
      case 'straight_flush':
        patternContribution += (profile.bombBase + group.length * profile.bombLengthBonus) * bombWeight;
        break;
      case 'single':
        patternContribution -= profile.singlePenalty * singlePenaltyWeight;
        if (pattern.powerLevel > 140) patternContribution += profile.highSingleBonus;
        break;
      case 'pair':
        patternContribution -= profile.pairPenalty * singlePenaltyWeight;
        if (pattern.powerLevel > 140) patternContribution += profile.highPairBonus;
        break;
      case 'straight':
        patternContribution += profile.straightBonus;
        break;
      case 'consecutive_pairs':
      case 'consecutive_triples':
      case 'plate':
      case 'tube':
        patternContribution += group.length * profile.blockPerCardBonus;
        break;
    }
  }

  const handCountPenalty = groups.length * profile.handCountPenalty;
  const totalScore = patternContribution + contextAdjustment - handCountPenalty;

  return {
    totalScore,
    breakdown: {
      handCountPenalty,
      patternContribution,
      contextAdjustment,
      totalScore,
    },
    reasonTags: Array.from(new Set(reasonTags)),
  };
}

export function evaluateHandValue(groups: RuntimeCard[][], context?: GroupingContext): number {
  return evaluateHandValueDetailed(groups, context).totalScore;
}
