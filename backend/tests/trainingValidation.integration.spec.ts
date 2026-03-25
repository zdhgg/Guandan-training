import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import type { CardRank, CardSuit, RuntimeCard } from '../src/core/cardEngine';

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

function makeCard(id: string, suit: CardSuit, rank: CardRank): RuntimeCard {
  return {
    id,
    suit,
    rank,
    deckIndex: 0,
    logicValue: RANK_ORDER[rank] * 10 + SUIT_BONUS[suit],
    isWildcard: false,
    isSelected: false
  };
}

function buildAutoGroupHand(): RuntimeCard[] {
  return [
    makeCard('sf-s3', 'spades', '3'),
    makeCard('sf-s4', 'spades', '4'),
    makeCard('sf-s6', 'spades', '6'),
    makeCard('sf-s7', 'spades', '7'),
    { ...makeCard('sf-wild', 'hearts', '8'), isWildcard: true },

    makeCard('b-hq', 'hearts', 'Q'),
    makeCard('b-dq', 'diamonds', 'Q'),
    makeCard('b-cq', 'clubs', 'Q'),
    makeCard('b-sq', 'spades', 'Q'),

    makeCard('t-h9', 'hearts', '9'),
    makeCard('t-d9', 'diamonds', '9'),
    makeCard('t-c9', 'clubs', '9'),

    makeCard('p-hk', 'hearts', 'K'),
    makeCard('p-dk', 'diamonds', 'K'),
    makeCard('p-ck', 'clubs', 'K'),
    makeCard('p-ha', 'hearts', 'A'),
    makeCard('p-sa', 'spades', 'A'),

    { ...makeCard('s-c3', 'clubs', '3'), deckIndex: 1 },
    { ...makeCard('s-d4', 'diamonds', '4'), deckIndex: 1 },
    makeCard('s-h5', 'hearts', '5'),
    { ...makeCard('s-c6', 'clubs', '6'), deckIndex: 1 },
    { ...makeCard('s-d7', 'diamonds', '7'), deckIndex: 1 },

    makeCard('pair-h2', 'hearts', '2'),
    makeCard('pair-d2', 'diamonds', '2'),

    makeCard('single-j1', 'joker', 'JOKER'),
    { ...makeCard('single-j2', 'joker', 'JOKER'), deckIndex: 1 },
    makeCard('single-s10', 'spades', '10')
  ];
}

describe('training validate-groups endpoint integration', () => {
  it('二维数组入参全部合法时返回 success=true 与总手数', async () => {
    const groups: RuntimeCard[][] = [
      [makeCard('single-1', 'hearts', 'A')],
      [makeCard('pair-1', 'spades', '7'), makeCard('pair-2', 'hearts', '7')]
    ];

    const response = await request(app).post('/api/training/validate-groups').send({ groups });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.totalMoves).toBe(2);
    expect(Array.isArray(response.body.groupResults)).toBe(true);
  });

  it('存在非法牌堆时返回 success=false 并指出分组索引', async () => {
    const groups: RuntimeCard[][] = [
      [makeCard('single-1', 'hearts', 'A')],
      [makeCard('invalid-1', 'spades', '4'), makeCard('invalid-2', 'hearts', '9')]
    ];

    const response = await request(app).post('/api/training/validate-groups').send({ groups });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.invalidGroupIndex).toBe(1);
    expect(response.body.message).toContain('第2组');
  });

  it('支持对象数组入参格式（每项包含 cards）', async () => {
    const groups = [
      { cards: [makeCard('single-1', 'clubs', 'K')] },
      { cards: [makeCard('pair-1', 'spades', '9'), makeCard('pair-2', 'diamonds', '9')] }
    ];

    const response = await request(app).post('/api/training/validate-groups').send({ groups });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.totalMoves).toBe(2);
  });
});

describe('training auto-group endpoint integration', () => {
  it('返回智能理牌结果，并保证27张手牌完整覆盖', async () => {
    const cards = buildAutoGroupHand();

    const response = await request(app).post('/api/training/auto-group').send({ cards });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.groupedCards)).toBe(true);

    const grouped = response.body.groupedCards as RuntimeCard[][];
    const flatten = grouped.flat();
    const uniqueIds = new Set(flatten.map((card) => card.id));

    expect(flatten).toHaveLength(27);
    expect(uniqueIds.size).toBe(27);

    const wildcardSingle = grouped.find((group) => group.length === 1 && group[0].isWildcard);
    expect(wildcardSingle).toBeFalsy();
  });

  it('手牌不足27张时返回400', async () => {
    const response = await request(app).post('/api/training/auto-group').send({ cards: [makeCard('x1', 'hearts', 'A')] });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('27张');
  });
});

describe('training new-hand endpoint integration', () => {
  it('返回27张新手牌，且牌ID不重复', async () => {
    const response = await request(app).get('/api/training/new-hand');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.cards)).toBe(true);

    const cards = response.body.cards as RuntimeCard[];
    expect(cards).toHaveLength(27);
    expect(new Set(cards.map((card) => card.id)).size).toBe(27);
  });
});
