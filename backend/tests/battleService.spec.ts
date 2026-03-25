import { afterEach, describe, expect, it } from 'vitest';
import {
  advanceBattle,
  clearActiveMatchesForTest,
  clearPersistedBattleMatchesForTest,
  mutateActiveMatchForTest,
  setNextRoundHandsForTest,
  setPlayerAiFlagForTest,
  startNextBattleRound,
  startBattle,
  submitBattleTributeSelection,
  submitPlay
} from '../src/services/battleService';

afterEach(async () => {
  clearActiveMatchesForTest();
  await clearPersistedBattleMatchesForTest();
});

describe('battleService', () => {
  it('startBattle 会初始化 4 人对局和首轮状态', () => {
    const match = startBattle();

    expect(match.matchId).toMatch(/^battle_/);
    expect(match.battleMode).toBe('human_vs_ai');
    expect(match.antiTributeEnabled).toBe(true);
    expect(match.currentLevel).toBe('2');
    expect(match.players).toHaveLength(4);
    expect(match.currentTurn).toBe(0);
    expect(match.lastPlay).toBeNull();
    expect(match.passCount).toBe(0);

    for (const player of match.players) {
      expect(player.handCards).toHaveLength(27);
    }
  });

  it('startBattle 支持初始化全 AI 观战对局', () => {
    const match = startBattle({ battleMode: 'ai_vs_ai' });

    expect(match.battleMode).toBe('ai_vs_ai');
    expect(match.players).toHaveLength(4);
    expect(match.players.every((player) => player.isAI)).toBe(true);
    expect(match.currentTurn).toBe(0);
  });

  it('submitPlay 会自动推进 AI 轮次并最终回到真人座位', async () => {
    const started = startBattle();
    const player0 = started.players[0];
    const firstCard = player0.handCards[0];
    if (!firstCard) {
      throw new Error('测试初始化失败：玩家0无可出牌');
    }

    const afterFirstPlay = await submitPlay(started.matchId, player0.id, [firstCard]);
    expect(afterFirstPlay.match.currentTurn).toBe(0);
    expect(afterFirstPlay.match.passCount).toBeGreaterThanOrEqual(0);
    expect(afterFirstPlay.match.passCount).toBeLessThan(3);
    expect(afterFirstPlay.match.players[0]?.handCards).toHaveLength(26);
    expect(Array.isArray(afterFirstPlay.turnEvents)).toBe(true);
    expect(afterFirstPlay.turnEvents.length).toBeGreaterThanOrEqual(0);

    if (afterFirstPlay.match.lastPlay) {
      expect([1, 2, 3]).toContain(afterFirstPlay.match.lastPlay.playerSeat);
      expect(afterFirstPlay.match.lastPlay.cards.length).toBeGreaterThan(0);
    }
  });

  it('submitPlay 会拒绝非当前轮次玩家的出牌', async () => {
    const started = startBattle();
    const player1 = started.players[1];
    const player1FirstCard = player1.handCards[0];
    if (!player1FirstCard) {
      throw new Error('测试初始化失败：玩家1无可出牌');
    }

    await expect(submitPlay(started.matchId, player1.id, [player1FirstCard])).rejects.toThrow(
      '还未轮到当前玩家出牌'
    );
  });

  it('首出轮次选择 Pass 会被拒绝', async () => {
    const started = startBattle();
    await expect(submitPlay(started.matchId, started.players[0].id, [])).rejects.toThrow('不能选择Pass');
  });

  it('advanceBattle 会自动跑完整局全 AI 对战', async () => {
    const started = startBattle({ battleMode: 'ai_vs_ai' });

    const result = await advanceBattle(started.matchId, started.players[0].id);

    expect(result.turnEvents.length).toBeGreaterThan(0);
    expect(result.match.finishedSeats.length).toBeGreaterThanOrEqual(2);
  });

  it('advanceBattle 会兼容旧版 ai_vs_ai 对局里 seat0 被错误标记为真人的情况', async () => {
    const started = startBattle({ battleMode: 'ai_vs_ai' });
    setPlayerAiFlagForTest(started.matchId, 0, false);

    const result = await advanceBattle(started.matchId, started.players[0].id);

    expect(result.turnEvents.length).toBeGreaterThan(0);
    expect(result.match.players.every((player) => player.isAI)).toBe(true);
  });

  it('startNextBattleRound 会按上一局名次升级并进入待进贡状态', async () => {
    const started = startBattle({ antiTributeEnabled: false });
    mutateActiveMatchForTest(started.matchId, (match) => {
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

    const nextRound = await startNextBattleRound(started.matchId, started.players[0]!.id);

    expect(nextRound.roundNumber).toBe(2);
    expect(nextRound.currentLevel).toBe('7');
    expect(nextRound.roundPhase).toBe('awaiting_tribute');
    expect(nextRound.pendingTribute?.phase).toBe('awaiting_tribute');
    expect(nextRound.pendingTribute?.giverSeat).toBe(0);
    expect(nextRound.roundHistory).toHaveLength(1);
    expect(nextRound.roundHistory[0]?.roundNumber).toBe(1);
    expect(nextRound.roundHistory[0]?.levelAfter).toBe('7');
    expect(nextRound.players[0]?.handCards).toHaveLength(27);
  });

  it('submitBattleTributeSelection 会在真人进贡后自动完成 AI 还贡并开始下一局', async () => {
    const started = startBattle({ antiTributeEnabled: false });
    mutateActiveMatchForTest(started.matchId, (match) => {
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

    const nextRound = await startNextBattleRound(started.matchId, started.players[0]!.id);
    const hand = nextRound.players[0]?.handCards ?? [];
    const tributeCard = [...hand].sort((left, right) => right.logicValue - left.logicValue || left.id.localeCompare(right.id))[0];
    if (!tributeCard) {
      throw new Error('测试初始化失败：未找到可进贡卡牌');
    }

    const resolved = await submitBattleTributeSelection(started.matchId, started.players[0]!.id, tributeCard.id);

    expect(resolved.roundPhase).toBe('playing');
    expect(resolved.pendingTribute).toBeNull();
    expect(resolved.players[0]?.handCards).toHaveLength(27);
    expect(resolved.finishedSeats).toHaveLength(0);
  });

  it('startNextBattleRound 会在 AI 进贡后等待真人还贡', async () => {
    const started = startBattle({ antiTributeEnabled: false });
    mutateActiveMatchForTest(started.matchId, (match) => {
      match.currentLevel = 'K';
      match.roundPhase = 'finished';
      match.finishedSeats = [0, 1, 2];
      match.players[0]!.rank = 1;
      match.players[1]!.rank = 2;
      match.players[2]!.rank = 3;
      match.players[3]!.rank = 4;
      match.lastRoundSummary = null;
      match.pendingTribute = null;
    });

    const nextRound = await startNextBattleRound(started.matchId, started.players[0]!.id);

    expect(nextRound.currentLevel).toBe('A');
    expect(nextRound.roundPhase).toBe('awaiting_return');
    expect(nextRound.pendingTribute?.phase).toBe('awaiting_return');
    expect(nextRound.pendingTribute?.receiverSeat).toBe(0);
    expect(nextRound.pendingTribute?.tributeCard).toBeTruthy();

    const tributeCard = nextRound.pendingTribute?.tributeCard;
    const returnCard = nextRound.players[0]?.handCards.find(
      (card) => tributeCard && card.id !== tributeCard.id && card.logicValue < tributeCard.logicValue
    );
    if (!returnCard) {
      throw new Error('测试初始化失败：未找到可还贡卡牌');
    }

    const resolved = await submitBattleTributeSelection(started.matchId, started.players[0]!.id, returnCard.id);
    expect(resolved.roundPhase).toBe('playing');
    expect(resolved.pendingTribute).toBeNull();
    expect(resolved.players[0]?.handCards).toHaveLength(27);
  });

  it('真人还贡完成后，应由向头游进贡的玩家先出牌', async () => {
    const started = startBattle({ antiTributeEnabled: false });
    mutateActiveMatchForTest(started.matchId, (match) => {
      match.currentLevel = 'K';
      match.roundPhase = 'finished';
      match.finishedSeats = [0, 1, 2];
      match.players[0]!.rank = 1;
      match.players[1]!.rank = 2;
      match.players[2]!.rank = 3;
      match.players[3]!.rank = 4;
      match.lastRoundSummary = null;
      match.pendingTribute = null;
    });

    const nextRound = await startNextBattleRound(started.matchId, started.players[0]!.id);
    const tributeCard = nextRound.pendingTribute?.tributeCard;
    const returnCard = nextRound.players[0]?.handCards.find(
      (card) => tributeCard && card.id !== tributeCard.id && card.logicValue < tributeCard.logicValue
    );
    if (!returnCard) {
      throw new Error('测试初始化失败：未找到可还贡卡牌');
    }

    const resolved = await submitBattleTributeSelection(started.matchId, started.players[0]!.id, returnCard.id);

    expect(resolved.roundPhase).toBe('playing');
    expect(resolved.pendingTribute).toBeNull();
    expect(resolved.currentTurn).toBe(0);
    expect(resolved.lastPlay?.playerSeat).toBe(3);
    expect(resolved.lastPlay?.cards.length).toBeGreaterThan(0);
  });

  it('启用双大王抗贡时，末游下一局拿到两张大王可直接免贡', async () => {
    const started = startBattle({ antiTributeEnabled: true });
    mutateActiveMatchForTest(started.matchId, (match) => {
      match.currentLevel = '9';
      match.roundPhase = 'finished';
      match.finishedSeats = [1, 2, 3];
      match.players[1]!.rank = 1;
      match.players[2]!.rank = 2;
      match.players[3]!.rank = 3;
      match.players[0]!.rank = 4;
      match.lastRoundSummary = null;
      match.pendingTribute = null;
    });

    const hands = started.players.map((player) => player.handCards.map((card) => ({ ...card })));
    hands[0]![0] = { ...hands[0]![0]!, suit: 'joker', rank: 'JOKER', logicValue: 170, isWildcard: false };
    hands[0]![1] = { ...hands[0]![1]!, suit: 'joker', rank: 'JOKER', logicValue: 170, isWildcard: false };
    setNextRoundHandsForTest(hands);

    const nextRound = await startNextBattleRound(started.matchId, started.players[0]!.id);

    expect(nextRound.roundPhase).toBe('playing');
    expect(nextRound.pendingTribute).toBeNull();
    expect(nextRound.lastRoundSummary?.antiTributeApplied).toBe(true);
    expect(nextRound.lastRoundSummary?.antiTributeReason).toBe('双大王抗贡');
    expect(nextRound.players[0]?.handCards).toHaveLength(27);
  });

  it('启用双下双贡时，会生成两组连续交供流程', async () => {
    const started = startBattle({ antiTributeEnabled: false, doubleDownTributeEnabled: true });
    mutateActiveMatchForTest(started.matchId, (match) => {
      match.currentLevel = '6';
      match.roundPhase = 'finished';
      match.finishedSeats = [0, 2, 1];
      match.players[0]!.rank = 1;
      match.players[2]!.rank = 2;
      match.players[1]!.rank = 3;
      match.players[3]!.rank = 4;
      match.lastRoundSummary = null;
      match.pendingTribute = null;
      match.roundHistory = [];
    });

    const nextRound = await startNextBattleRound(started.matchId, started.players[0]!.id);

    expect(nextRound.tributeQueue).toHaveLength(2);
    expect(nextRound.pendingTribute?.totalExchanges).toBe(2);
    expect(nextRound.pendingTribute?.exchangeIndex).toBe(0);
    expect(nextRound.pendingTribute?.phase).toBe('awaiting_return');
    expect(nextRound.tributeQueue[0]?.receiverSeat).toBe(0);
    expect(nextRound.tributeQueue[1]?.receiverSeat).toBe(2);
  });

  it('还贡规则为最低牌时，会拒绝提交非最小牌', async () => {
    const started = startBattle({
      antiTributeEnabled: false,
      doubleDownTributeEnabled: false,
      returnTributeRule: 'lowest_only',
    });
    mutateActiveMatchForTest(started.matchId, (match) => {
      match.currentLevel = 'Q';
      match.roundPhase = 'finished';
      match.finishedSeats = [0, 1, 2];
      match.players[0]!.rank = 1;
      match.players[1]!.rank = 2;
      match.players[2]!.rank = 3;
      match.players[3]!.rank = 4;
      match.lastRoundSummary = null;
      match.pendingTribute = null;
      match.roundHistory = [];
    });

    const hands = started.players.map((player) => player.handCards.map((card) => ({ ...card })));
    hands[0] = [
      { ...hands[0]![0]!, id: 'r-low', rank: '3', logicValue: 11, suit: 'spades', isWildcard: false },
      { ...hands[0]![1]!, id: 'r-mid', rank: '7', logicValue: 51, suit: 'hearts', isWildcard: false },
      ...hands[0]!.slice(2),
    ];
    setNextRoundHandsForTest(hands);

    const nextRound = await startNextBattleRound(started.matchId, started.players[0]!.id);
    expect(nextRound.pendingTribute?.phase).toBe('awaiting_return');

    await expect(
      submitBattleTributeSelection(started.matchId, started.players[0]!.id, 'r-mid')
    ).rejects.toThrow('最小牌');
  });
});
