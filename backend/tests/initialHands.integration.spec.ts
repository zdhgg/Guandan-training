import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/services/gameService';
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

function makeCard(playerIndex: number, index: number): RuntimeCard {
  const suits: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: CardRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  const suit = suits[index % suits.length];
  const rank = ranks[(index + playerIndex * 2) % ranks.length];

  return {
    id: `p${playerIndex + 1}-card-${index}`,
    suit,
    rank,
    deckIndex: playerIndex,
    logicValue: RANK_ORDER[rank] * 10 + SUIT_BONUS[suit],
    isWildcard: suit === 'hearts' && rank === '8' && index < 2,
    isSelected: false
  };
}

function buildInitialHands(): RuntimeCard[][] {
  return Array.from({ length: 4 }, (_, playerIndex) =>
    Array.from({ length: 27 }, (_, index) => makeCard(playerIndex, index))
  );
}

const createdMatchIds: string[] = [];

afterAll(async () => {
  if (createdMatchIds.length > 0) {
    await prisma.actionLog.deleteMany({
      where: { matchId: { in: createdMatchIds } }
    });
    await prisma.matchRecord.deleteMany({
      where: { id: { in: createdMatchIds } }
    });
  }
  await prisma.$disconnect();
});

describe('initial hands endpoint integration', () => {
  it('可创建对局并按 player1/player2 拉取各自 27 张开局手牌', async () => {
    const initialHands = buildInitialHands();

    const createRes = await request(app).post('/api/matches').send({ initialHands });
    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(typeof createRes.body.matchId).toBe('string');

    const matchId = createRes.body.matchId as string;
    createdMatchIds.push(matchId);

    const p1Res = await request(app).get(`/api/matches/${matchId}/hands/initial?playerId=player1`);
    expect(p1Res.status).toBe(200);
    expect(p1Res.body.success).toBe(true);
    expect(p1Res.body.cards).toHaveLength(27);
    expect(p1Res.body.cards.map((card: RuntimeCard) => card.id)).toEqual(initialHands[0].map((card) => card.id));

    const p2Res = await request(app).get(`/api/matches/${matchId}/hands/initial?playerId=player2`);
    expect(p2Res.status).toBe(200);
    expect(p2Res.body.success).toBe(true);
    expect(p2Res.body.cards).toHaveLength(27);
    expect(p2Res.body.cards.map((card: RuntimeCard) => card.id)).toEqual(initialHands[1].map((card) => card.id));
  });

  it('playerId 非法时返回 400', async () => {
    const initialHands = buildInitialHands();
    const createRes = await request(app).post('/api/matches').send({ initialHands });
    expect(createRes.status).toBe(201);
    const matchId = createRes.body.matchId as string;
    createdMatchIds.push(matchId);

    const badPlayerRes = await request(app).get(`/api/matches/${matchId}/hands/initial?playerId=player9`);
    expect(badPlayerRes.status).toBe(400);
    expect(badPlayerRes.body.success).toBe(false);
  });

  it('不存在的 matchId 返回 404', async () => {
    const unknownRes = await request(app).get('/api/matches/non-existent-match/hands/initial?playerId=player1');
    expect(unknownRes.status).toBe(404);
    expect(unknownRes.body.success).toBe(false);
  });

  it('GET /api/matches/:id/logs 可返回按步数排序的对局日志', async () => {
    const initialHands = buildInitialHands();
    const createRes = await request(app).post('/api/matches').send({ initialHands });
    expect(createRes.status).toBe(201);

    const matchId = createRes.body.matchId as string;
    createdMatchIds.push(matchId);

    const playedCard = initialHands[0]![0]!;
    const playRes = await request(app)
      .post(`/api/matches/${matchId}/play`)
      .send({ playerId: 'player1', cards: [playedCard] });

    expect(playRes.status).toBe(200);
    expect(playRes.body.success).toBe(true);

    const logsRes = await request(app).get(`/api/matches/${matchId}/logs`);
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.success).toBe(true);
    expect(logsRes.body.totalLogs).toBe(1);
    expect(Array.isArray(logsRes.body.logs)).toBe(true);
    expect(logsRes.body.logs[0]).toMatchObject({
      stepNumber: 1,
      playerId: 'player1',
      actionType: 'PLAY',
      cards: [playedCard.id]
    });
  });

  it('GET /api/matches/:id/logs 对不存在的对局返回 404', async () => {
    const response = await request(app).get('/api/matches/non-existent-match/logs');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
