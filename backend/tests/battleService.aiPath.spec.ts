import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  askLLMForNextPlayMock,
  buildAISpeechMock,
  calculateBattleNextPlayMock,
  calculateNextPlayMock,
} = vi.hoisted(() => ({
  askLLMForNextPlayMock: vi.fn(),
  buildAISpeechMock: vi.fn(() => '测试发言'),
  calculateBattleNextPlayMock: vi.fn(() => ({ cards: [], reasoning: '根据实战策略，当前选择不出' })),
  calculateNextPlayMock: vi.fn(() => ({ cards: [], reasoning: '根据基础规则，当前选择不出' })),
}));

vi.mock('../src/services/aiService', async () => {
  const actual = await vi.importActual<typeof import('../src/services/aiService')>('../src/services/aiService');

  return {
    ...actual,
    askLLMForNextPlay: askLLMForNextPlayMock,
    buildAISpeech: buildAISpeechMock,
    calculateBattleNextPlay: calculateBattleNextPlayMock,
    calculateNextPlay: calculateNextPlayMock,
  };
});

import {
  clearActiveMatchesForTest,
  clearPersistedBattleMatchesForTest,
  startBattle,
  submitPlay,
} from '../src/services/battleService';

afterEach(async () => {
  clearActiveMatchesForTest();
  await clearPersistedBattleMatchesForTest();
  askLLMForNextPlayMock.mockReset();
  buildAISpeechMock.mockClear();
  calculateBattleNextPlayMock.mockClear();
  calculateNextPlayMock.mockClear();
});

describe('battleService AI decision path', () => {
  it('无 LLM 配置时，AI 轮次会使用实战策略决策而不是基础规则', async () => {
    const started = startBattle();
    const player0 = started.players[0];
    const firstCard = player0.handCards[0];

    if (!firstCard) {
      throw new Error('测试初始化失败：玩家0无可出牌');
    }

    const result = await submitPlay(started.matchId, player0.id, [firstCard]);

    expect(result.match.currentTurn).toBe(0);
    expect(result.turnEvents).toHaveLength(3);
    expect(result.turnEvents.every((event) => event.action === 'pass')).toBe(true);
    expect(calculateBattleNextPlayMock).toHaveBeenCalledTimes(3);
    expect(calculateNextPlayMock).not.toHaveBeenCalled();
    expect(askLLMForNextPlayMock).not.toHaveBeenCalled();
  });
});
