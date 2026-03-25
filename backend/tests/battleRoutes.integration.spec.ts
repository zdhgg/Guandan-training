import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import type { RuntimeCard } from '../src/core/cardEngine';
import { clearActiveMatchesForTest, clearPersistedBattleMatchesForTest, mutateActiveMatchForTest } from '../src/services/battleService';

afterEach(async () => {
  clearActiveMatchesForTest();
  await clearPersistedBattleMatchesForTest();
});

describe('battle routes integration', () => {
  it('OPTIONS /api/battle/start 会放行前端实际使用的自定义请求头', async () => {
    const response = await request(app)
      .options('/api/battle/start')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'X-Battle-Anti-Tribute, X-Battle-Double-Down-Tribute, X-Battle-Return-Tribute-Rule, X-LLM-Seat0-Personality'
      );

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-headers']).toContain('X-Battle-Anti-Tribute');
    expect(response.headers['access-control-allow-headers']).toContain('X-Battle-Double-Down-Tribute');
    expect(response.headers['access-control-allow-headers']).toContain('X-Battle-Return-Tribute-Rule');
    expect(response.headers['access-control-allow-headers']).toContain('X-LLM-Seat0-Personality');
  });

  it('POST /api/battle/start 返回初始化实战状态', async () => {
    const response = await request(app).post('/api/battle/start').send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.matchId).toBe('string');
    expect(response.body.playerId).toBe('player1');
    expect(response.body.battleMode).toBe('human_vs_ai');
    expect(response.body.antiTributeEnabled).toBe(true);
    expect(response.body.currentLevel).toBe('2');
    expect(response.body.currentTurn).toBe(0);
    expect(response.body.passCount).toBe(0);
    expect(Array.isArray(response.body.handCards)).toBe(true);
    expect(response.body.handCards).toHaveLength(27);
    expect(Array.isArray(response.body.opponents)).toBe(true);
    expect(response.body.opponents).toHaveLength(3);
    expect(response.body.lastPlay).toBeNull();
  });

  it('POST /api/battle/start 支持初始化全 AI 对局', async () => {
    const response = await request(app).post('/api/battle/start').send({ battleMode: 'ai_vs_ai' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.battleMode).toBe('ai_vs_ai');
    expect(response.body.currentTurn).toBe(0);
    expect(response.body.handCards).toHaveLength(27);
  });

  it('POST /api/battle/start 支持通过请求头关闭抗贡规则', async () => {
    const response = await request(app)
      .post('/api/battle/start')
      .set('X-Battle-Anti-Tribute', 'false')
      .set('X-Battle-Double-Down-Tribute', 'false')
      .set('X-Battle-Return-Tribute-Rule', 'lowest_only')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.antiTributeEnabled).toBe(false);
    expect(response.body.doubleDownTributeEnabled).toBe(false);
    expect(response.body.returnTributeRule).toBe('lowest_only');
  });

  it('POST /api/battle/play 出牌后会自动推进 AI 并返回最新状态', async () => {
    const started = await request(app).post('/api/battle/start').send({});
    const matchId = started.body.matchId as string;
    const firstCard = (started.body.handCards as RuntimeCard[])[0];

    const playResponse = await request(app)
      .post('/api/battle/play')
      .send({ matchId, cards: [firstCard] });

    expect(playResponse.status).toBe(200);
    expect(playResponse.body.success).toBe(true);
    expect(playResponse.body.currentLevel).toBe('2');
    expect(playResponse.body.currentTurn).toBe(0);
    expect(playResponse.body.passCount).toBeGreaterThanOrEqual(0);
    expect(playResponse.body.passCount).toBeLessThan(3);
    expect(playResponse.body.handCards).toHaveLength(26);
    expect(Array.isArray(playResponse.body.turnEvents)).toBe(true);

    if (playResponse.body.lastPlay) {
      expect([1, 2, 3]).toContain(playResponse.body.lastPlay.playerSeat);
      expect(playResponse.body.lastPlay.cards.length).toBeGreaterThan(0);
    }
  });

  it('POST /api/battle/play/stream 会逐步返回实时 AI 事件并以 complete 结束', async () => {
    const started = await request(app).post('/api/battle/start').send({});
    const matchId = started.body.matchId as string;
    const firstCard = (started.body.handCards as RuntimeCard[])[0];

    const playResponse = await request(app)
      .post('/api/battle/play/stream')
      .send({ matchId, cards: [firstCard] });

    expect(playResponse.status).toBe(200);
    expect(playResponse.headers['content-type']).toContain('text/event-stream');
    expect(playResponse.text).toContain('event: ready');
    expect(playResponse.text).toContain('event: player_action_applied');
    expect(playResponse.text).toContain('event: ai_turn_start');
    expect(playResponse.text).toContain('event: complete');
  });

  it('POST /api/battle/play 在首出轮次提交空数组会返回 400', async () => {
    const started = await request(app).post('/api/battle/start').send({});
    const matchId = started.body.matchId as string;

    const passResponse = await request(app)
      .post('/api/battle/play')
      .send({ matchId, cards: [] });

    expect(passResponse.status).toBe(400);
    expect(passResponse.body.success).toBe(false);
    expect(passResponse.body.message).toContain('不能选择Pass');
  });

  it('GET /api/battle/state 可返回指定对局当前状态', async () => {
    const started = await request(app).post('/api/battle/start').send({});
    const matchId = started.body.matchId as string;

    const response = await request(app)
      .get('/api/battle/state')
      .query({ matchId, playerId: 'player1' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.matchId).toBe(matchId);
    expect(response.body.playerId).toBe('player1');
    expect(response.body.battleMode).toBe('human_vs_ai');
    expect(Array.isArray(response.body.handCards)).toBe(true);
    expect(response.body.handCards).toHaveLength(27);
  });

  it('GET /api/battle/state 可在内存清空后从数据库恢复时间轴', async () => {
    const started = await request(app).post('/api/battle/start').send({});
    const matchId = started.body.matchId as string;
    const firstCard = (started.body.handCards as RuntimeCard[])[0];

    await request(app)
      .post('/api/battle/play')
      .send({ matchId, cards: [firstCard] })
      .expect(200);

    clearActiveMatchesForTest();

    const response = await request(app)
      .get('/api/battle/state')
      .query({ matchId, playerId: 'player1' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.matchId).toBe(matchId);
    expect(Array.isArray(response.body.timelineEntries)).toBe(true);
    expect(response.body.timelineEntries.length).toBeGreaterThan(0);
    expect(response.body.timelineEntries[0]?.state?.matchId).toBe(matchId);
  });

  it('GET /api/battle/sessions 可返回当前模式的最近对局', async () => {
    const first = await request(app).post('/api/battle/start').send({ battleMode: 'ai_vs_ai' });
    const second = await request(app).post('/api/battle/start').send({ battleMode: 'ai_vs_ai' });

    const response = await request(app)
      .get('/api/battle/sessions')
      .query({ battleMode: 'ai_vs_ai', limit: 5 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.sessions)).toBe(true);
    expect(response.body.sessions.length).toBeGreaterThanOrEqual(2);
    expect(response.body.sessions[0]?.battleMode).toBe('ai_vs_ai');
    expect(typeof response.body.sessions[0]?.roundNumber).toBe('number');
    expect(typeof response.body.sessions[0]?.antiTributeEnabled).toBe('boolean');
    expect(response.body.sessions.some((session: { matchId: string }) => session.matchId === first.body.matchId)).toBe(true);
    expect(response.body.sessions.some((session: { matchId: string }) => session.matchId === second.body.matchId)).toBe(true);
  });

  it('POST /api/battle/next-round 可按结算结果进入下一局并返回交供状态', async () => {
    const started = await request(app).post('/api/battle/start').send({});
    const matchId = started.body.matchId as string;
    mutateActiveMatchForTest(matchId, (match) => {
      match.antiTributeEnabled = false;
      match.currentLevel = '5';
      match.roundPhase = 'finished';
      match.finishedSeats = [1, 2, 3];
      match.players[1]!.rank = 1;
      match.players[2]!.rank = 2;
      match.players[3]!.rank = 3;
      match.players[0]!.rank = 4;
      match.lastRoundSummary = null;
      match.pendingTribute = null;
    });

    const response = await request(app)
      .post('/api/battle/next-round')
      .send({ matchId, playerId: 'player1' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.roundNumber).toBe(2);
    expect(response.body.currentLevel).toBe('7');
    expect(response.body.roundPhase).toBe('awaiting_tribute');
    expect(response.body.pendingTribute?.requiredAction).toBe('give');
    expect(response.body.handCards).toHaveLength(27);
  });

  it('POST /api/battle/tribute 可提交进贡并开始下一局', async () => {
    const started = await request(app).post('/api/battle/start').send({});
    const matchId = started.body.matchId as string;
    mutateActiveMatchForTest(matchId, (match) => {
      match.antiTributeEnabled = false;
      match.currentLevel = '5';
      match.roundPhase = 'finished';
      match.finishedSeats = [1, 2, 3];
      match.players[1]!.rank = 1;
      match.players[2]!.rank = 2;
      match.players[3]!.rank = 3;
      match.players[0]!.rank = 4;
      match.lastRoundSummary = null;
      match.pendingTribute = null;
    });

    const nextRound = await request(app)
      .post('/api/battle/next-round')
      .send({ matchId, playerId: 'player1' })
      .expect(200);

    const hand = nextRound.body.handCards as RuntimeCard[];
    const tributeCard = [...hand].sort((left, right) => right.logicValue - left.logicValue || left.id.localeCompare(right.id))[0];
    if (!tributeCard) {
      throw new Error('测试初始化失败：未找到可进贡卡牌');
    }

    const response = await request(app)
      .post('/api/battle/tribute')
      .send({ matchId, playerId: 'player1', cardId: tributeCard.id });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.roundPhase).toBe('playing');
    expect(response.body.pendingTribute).toBeNull();
    expect(response.body.handCards).toHaveLength(27);
  });

  it('POST /api/battle/advance/stream 会推进全 AI 对局并以 complete 结束', async () => {
    const started = await request(app).post('/api/battle/start').send({ battleMode: 'ai_vs_ai' });
    const matchId = started.body.matchId as string;

    const advanceResponse = await request(app)
      .post('/api/battle/advance/stream')
      .send({ matchId });

    expect(advanceResponse.status).toBe(200);
    expect(advanceResponse.headers['content-type']).toContain('text/event-stream');
    expect(advanceResponse.text).toContain('event: ready');
    expect(advanceResponse.text).toContain('event: ai_turn_start');
    expect(advanceResponse.text).toContain('event: ai_turn_event');
    expect(advanceResponse.text).toContain('event: complete');
  });

  it('POST /api/battle/auto-group 支持非27张实战手牌智能理牌', async () => {
    const started = await request(app).post('/api/battle/start').send({});
    const battleCards = (started.body.handCards as RuntimeCard[]).slice(0, 25);

    const response = await request(app).post('/api/battle/auto-group').send({ cards: battleCards });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.totalCards).toBe(25);
    expect(Array.isArray(response.body.groupedCards)).toBe(true);
    expect(Array.isArray(response.body.allGroupings)).toBe(true);
    expect(typeof response.body.allGroupings?.[0]?.score).toBe('number');
    expect(response.body.allGroupings?.[0]?.scoreBreakdown).toBeTruthy();
    const flattened = (response.body.groupedCards as RuntimeCard[][]).flat();
    expect(flattened).toHaveLength(25);
  });

  it('POST /api/battle/auto-group 可接收局势上下文并触发防守标签', async () => {
    const started = await request(app).post('/api/battle/start').send({});
    const battleCards = (started.body.handCards as RuntimeCard[]).slice(0, 20);

    const response = await request(app)
      .post('/api/battle/auto-group')
      .send({
        cards: battleCards,
        context: {
          players: [
            { seat: 0, cardsLeft: 20, isTeammate: false },
            { seat: 1, cardsLeft: 4, isTeammate: false },
            { seat: 2, cardsLeft: 10, isTeammate: true },
            { seat: 3, cardsLeft: 9, isTeammate: false }
          ],
          currentTurn: 0,
          currentLevel: '2',
          lastPlay: null
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.allGroupings)).toBe(true);
    const best = response.body.allGroupings?.[0];
    expect(Array.isArray(best?.reasonTags)).toBe(true);
    expect(best?.reasonTags).toContain('enemy_sprint_risk');
  });
});
