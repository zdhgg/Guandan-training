import { describe, expect, it } from 'vitest';
import type { CardRank, CardSuit, RuntimeCard } from '../src/core/cardEngine';
import { identifyPattern } from '../src/core/ruleValidator';
import { autoGroupCards, evaluateHandValue, generateAllGroupings } from '../src/services/autoGrouper';

const RANK_ORDER: Record<CardRank, number> = {
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

const SUIT_BONUS: Record<CardSuit, number> = {
  hearts: 4,
  diamonds: 3,
  clubs: 2,
  spades: 1,
  joker: 0
};

function makeCard(
  id: string,
  suit: CardSuit,
  rank: CardRank,
  options: { deckIndex?: number; isWildcard?: boolean } = {}
): RuntimeCard {
  return {
    id,
    suit,
    rank,
    deckIndex: options.deckIndex ?? 0,
    logicValue: RANK_ORDER[rank] * 10 + SUIT_BONUS[suit],
    isWildcard: options.isWildcard ?? false,
    isSelected: false
  };
}

function buildFullHand(): RuntimeCard[] {
  return [
    makeCard('b-hq', 'hearts', 'Q'),
    makeCard('b-dq', 'diamonds', 'Q'),
    makeCard('b-cq', 'clubs', 'Q'),
    makeCard('b-sq', 'spades', 'Q'),

    makeCard('sf-s3', 'spades', '3'),
    makeCard('sf-s4', 'spades', '4'),
    makeCard('sf-s5', 'spades', '5'),
    makeCard('sf-s6', 'spades', '6'),
    makeCard('sf-s7', 'spades', '7'),

    makeCard('st-h8', 'hearts', '8'),
    makeCard('st-d9', 'diamonds', '9'),
    makeCard('st-c10', 'clubs', '10'),
    makeCard('st-sj', 'spades', 'J'),
    makeCard('st-hk', 'hearts', 'K'),

    makeCard('p-ha', 'hearts', 'A'),
    makeCard('p-da', 'diamonds', 'A'),
    makeCard('p-ca', 'clubs', 'A'),
    makeCard('p-h2', 'hearts', '2'),
    makeCard('p-s2', 'spades', '2'),

    makeCard('pair-d4', 'diamonds', '4', { deckIndex: 1 }),
    makeCard('pair-c4', 'clubs', '4', { deckIndex: 1 }),

    makeCard('single-h3', 'hearts', '3', { deckIndex: 1 }),
    makeCard('single-d5', 'diamonds', '5', { deckIndex: 1 }),
    makeCard('single-c6', 'clubs', '6', { deckIndex: 1 }),
    makeCard('single-s8', 'spades', '8', { deckIndex: 1 }),
    makeCard('single-j1', 'joker', 'JOKER'),
    makeCard('single-wild', 'hearts', '9', { isWildcard: true })
  ];
}

describe('autoGroupCards', () => {
  it('覆盖全部手牌，且百搭牌不会以单牌形式孤立输出', () => {
    const hand = buildFullHand();
    const grouped = autoGroupCards(hand);

    const flatten = grouped.flat();
    const uniqueIds = new Set(flatten.map((card) => card.id));

    expect(flatten).toHaveLength(hand.length);
    expect(uniqueIds.size).toBe(hand.length);

    const wildcardSingle = grouped.find((group) => group.length === 1 && group[0].isWildcard);
    expect(wildcardSingle).toBeFalsy();
  });

  it('提取顺序先同花顺再炸弹，且同花顺严格为 5 张', () => {
    const hand: RuntimeCard[] = [
      makeCard('b-h9', 'hearts', '9'),
      makeCard('b-d9', 'diamonds', '9'),
      makeCard('b-c9', 'clubs', '9'),
      makeCard('b-s9', 'spades', '9'),

      makeCard('sf-h3', 'hearts', '3'),
      makeCard('sf-h4', 'hearts', '4'),
      makeCard('sf-h5', 'hearts', '5'),
      makeCard('sf-h6', 'hearts', '6'),
      makeCard('sf-h7', 'hearts', '7'),
      makeCard('sf-h8', 'hearts', '8'),

      makeCard('x-1', 'clubs', 'K'),
      makeCard('x-2', 'spades', '2')
    ];

    const grouped = autoGroupCards(hand);
    const patternTypes = grouped.map((group) => identifyPattern(group).patternType);

    expect(patternTypes[0]).toBe('straight_flush');

    const straightFlushGroups = grouped.filter(
      (group) => identifyPattern(group).patternType === 'straight_flush'
    );

    expect(straightFlushGroups.length).toBeGreaterThan(0);
    for (const group of straightFlushGroups) {
      expect(group).toHaveLength(5);
    }
  });

  it('百搭牌在收尾阶段应被并入有效组合，不能以单牌孤立输出', () => {
    const hand: RuntimeCard[] = [
      makeCard('s3', 'spades', '3'),
      makeCard('d4', 'diamonds', '4'),
      makeCard('c6', 'clubs', '6'),
      makeCard('h7', 'hearts', '7'),
      makeCard('s8', 'spades', '8'),
      makeCard('wild-h8', 'hearts', '8', { isWildcard: true }),
      makeCard('single-j', 'joker', 'JOKER')
    ];

    const grouped = autoGroupCards(hand);
    const wildcardSingle = grouped.find((group) => group.length === 1 && group[0].isWildcard);
    expect(wildcardSingle).toBeFalsy();

    const wildcardMergedGroup = grouped.find(
      (group) => group.length > 1 && group.some((card) => card.isWildcard)
    );
    expect(wildcardMergedGroup).toBeTruthy();
  });

  it('百搭不会与王组合，且会优先与同级非百搭牌组成对子', () => {
    const hand: RuntimeCard[] = [
      makeCard('wild-h8', 'hearts', '8', { isWildcard: true }),
      makeCard('lvl-d8', 'diamonds', '8'),
      makeCard('joker-1', 'joker', 'JOKER'),
      makeCard('single-k', 'spades', 'K')
    ];

    const grouped = autoGroupCards(hand);

    const wildcardWithJoker = grouped.find(
      (group) =>
        group.some((card) => card.isWildcard) &&
        group.some((card) => card.suit === 'joker' || card.rank === 'JOKER')
    );
    expect(wildcardWithJoker).toBeFalsy();

    const wildcardLevelPair = grouped.find(
      (group) =>
        group.length === 2 &&
        group.some((card) => card.isWildcard) &&
        group.some((card) => !card.isWildcard && card.rank === '8' && card.suit !== 'joker')
    );
    expect(wildcardLevelPair).toBeTruthy();
  });

  it('training 评分比 battle 更强调手数与散牌惩罚', () => {
    const straight = [
      makeCard('s3', 'spades', '3'),
      makeCard('h4', 'hearts', '4'),
      makeCard('d5', 'diamonds', '5'),
      makeCard('c6', 'clubs', '6'),
      makeCard('s7', 'spades', '7')
    ];
    const bomb = [
      makeCard('hq', 'hearts', 'Q'),
      makeCard('dq', 'diamonds', 'Q'),
      makeCard('cq', 'clubs', 'Q'),
      makeCard('sq', 'spades', 'Q')
    ];

    const compactGroups: RuntimeCard[][] = [straight, bomb];
    const singleHeavyGroups: RuntimeCard[][] = [...straight, ...bomb].map((card) => [card]);

    const compactTraining = evaluateHandValue(compactGroups, { mode: 'training' });
    const singleHeavyTraining = evaluateHandValue(singleHeavyGroups, { mode: 'training' });
    const compactBattle = evaluateHandValue(compactGroups, { mode: 'battle' });
    const singleHeavyBattle = evaluateHandValue(singleHeavyGroups, { mode: 'battle' });

    expect(compactTraining).toBeGreaterThan(singleHeavyTraining);
    expect(compactBattle).toBeGreaterThan(singleHeavyBattle);
    expect(compactTraining - singleHeavyTraining).toBeGreaterThan(compactBattle - singleHeavyBattle);
  });

  it('generateAllGroupings 会产出 BeamSearch TopK 方案', () => {
    const hand = buildFullHand();
    const results = generateAllGroupings(hand, { mode: 'training' });

    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some(
        (result) =>
          result.strategyName.startsWith('BeamSearch#') ||
          result.reasonTags?.includes('beam_search_topk')
      )
    ).toBe(true);
  });
});
