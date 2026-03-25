import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeCard, CardRank, CardSuit } from '../src/core/cardEngine';
import { canBeat } from '../src/core/ruleValidator';

const { mockChatCompletionCreate } = vi.hoisted(() => ({
  mockChatCompletionCreate: vi.fn()
}));

vi.mock('openai', () => {
  class OpenAI {
    chat = {
      completions: {
        create: mockChatCompletionCreate
      }
    };

    constructor(_config: unknown) { }
  }

  return { default: OpenAI };
});

import { askLLMForNextPlay, calculateBattleNextPlay, calculateNextPlay } from '../src/services/aiService';

function createCard(params: {
  id: string;
  rank: CardRank;
  suit?: CardSuit;
  logicValue: number;
  deckIndex?: number;
  isWildcard?: boolean;
}): RuntimeCard {
  return {
    id: params.id,
    suit: params.suit ?? 'spades',
    rank: params.rank,
    deckIndex: params.deckIndex ?? 0,
    logicValue: params.logicValue,
    isWildcard: params.isWildcard ?? false,
    isSelected: false
  };
}

function muteConsoleOutput(): void {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

describe('aiService.calculateNextPlay', () => {
  it('首发时会打出最小非百搭单牌', () => {
    const handCards: RuntimeCard[] = [
      createCard({ id: 'w1', rank: '8', suit: 'hearts', logicValue: 64, isWildcard: true }),
      createCard({ id: 'c1', rank: '5', logicValue: 51 }),
      createCard({ id: 'c2', rank: '9', logicValue: 91 })
    ];

    const result = calculateNextPlay(handCards, null);
    expect(result.cards.map((card) => card.id)).toEqual(['c1']);
    expect(typeof result.reasoning).toBe('string');
  });

  it('接单张时会选择最小可压过的非百搭单牌', () => {
    const handCards: RuntimeCard[] = [
      createCard({ id: 'w1', rank: '9', suit: 'hearts', logicValue: 94, isWildcard: true }),
      createCard({ id: 'c1', rank: '6', logicValue: 61 }),
      createCard({ id: 'c2', rank: '7', logicValue: 71 }),
      createCard({ id: 'c3', rank: '8', logicValue: 81 })
    ];
    const lastPlayCard = createCard({ id: 'l1', rank: '6', logicValue: 64 });

    const result = calculateNextPlay(handCards, {
      playerId: 'playerX',
      cards: [lastPlayCard]
    });

    expect(result.cards.map((card) => card.id)).toEqual(['c2']);
    expect(typeof result.reasoning).toBe('string');
  });

  it('接对子时会选择最小可压过的非百搭对子', () => {
    const handCards: RuntimeCard[] = [
      createCard({ id: 'p8a', rank: '8', suit: 'spades', logicValue: 81 }),
      createCard({ id: 'p8b', rank: '8', suit: 'diamonds', logicValue: 83 }),
      createCard({ id: 'p9a', rank: '9', suit: 'spades', logicValue: 91 }),
      createCard({ id: 'p9b', rank: '9', suit: 'clubs', logicValue: 92 }),
      createCard({ id: 'w1', rank: '8', suit: 'hearts', logicValue: 84, isWildcard: true })
    ];
    const lastPlayCards: RuntimeCard[] = [
      createCard({ id: 'l1', rank: '7', suit: 'spades', logicValue: 71 }),
      createCard({ id: 'l2', rank: '7', suit: 'hearts', logicValue: 74 })
    ];

    const result = calculateNextPlay(handCards, {
      playerId: 'playerX',
      cards: lastPlayCards
    });

    expect(result.cards.map((card) => card.id)).toEqual(['p8a', 'p8b']);
    expect(typeof result.reasoning).toBe('string');
  });

  it('上一手是复杂牌型时直接返回 Pass', () => {
    const handCards: RuntimeCard[] = [
      createCard({ id: 'c1', rank: '9', logicValue: 91 }),
      createCard({ id: 'c2', rank: '10', logicValue: 101 }),
      createCard({ id: 'c3', rank: 'J', logicValue: 111 })
    ];
    const tubeCards: RuntimeCard[] = [
      createCard({ id: 't1', rank: '6', logicValue: 61 }),
      createCard({ id: 't2', rank: '6', logicValue: 62 }),
      createCard({ id: 't3', rank: '6', logicValue: 64 })
    ];

    const result = calculateNextPlay(handCards, {
      playerId: 'playerX',
      cards: tubeCards
    });

    expect(result.cards).toEqual([]);
    expect(typeof result.reasoning).toBe('string');
  });
});

describe('aiService.askLLMForNextPlay fallback behavior', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockChatCompletionCreate.mockReset();
  });

  it('大模型超时超过3000ms时会触发降级策略', async () => {
    vi.useFakeTimers();
    muteConsoleOutput();
    mockChatCompletionCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              choices: [{ message: { content: '{"action":"play","cards":["c3"]}' } }]
            });
          }, 3200);
        })
    );

    const handCards: RuntimeCard[] = [
      createCard({ id: 'c1', rank: '6', logicValue: 61 }),
      createCard({ id: 'c2', rank: '7', logicValue: 71 }),
      createCard({ id: 'c3', rank: '9', logicValue: 91 })
    ];
    const lastPlay = {
      playerId: 'playerX',
      cards: [createCard({ id: 'l1', rank: '6', suit: 'hearts', logicValue: 64 })]
    };
    const expectedFallback = calculateNextPlay(handCards, lastPlay).cards.map((card) => card.id);

    const resultPromise = askLLMForNextPlay(handCards, lastPlay, '2', 'balanced', undefined, {
      apiKey: 'test-key',
      baseUrl: 'https://mock.llm/v1',
      model: 'mock-model',
      timeoutMs: 3000,
      seat: 1
    });

    await vi.advanceTimersByTimeAsync(3001);
    const result = await resultPromise;

    expect(result.cards.map((card) => card.id)).toEqual(expectedFallback);
    expect(typeof result.reasoning).toBe('string');
    expect(mockChatCompletionCreate).toHaveBeenCalledTimes(1);
  });

  it('大模型返回非JSON时会触发降级策略', async () => {
    muteConsoleOutput();
    mockChatCompletionCreate.mockResolvedValue({
      choices: [{ message: { content: '我觉得应该出对3' } }]
    });

    const handCards: RuntimeCard[] = [
      createCard({ id: 'c1', rank: '6', logicValue: 61 }),
      createCard({ id: 'c2', rank: '7', logicValue: 71 }),
      createCard({ id: 'c3', rank: '9', logicValue: 91 })
    ];
    const lastPlay = {
      playerId: 'playerX',
      cards: [createCard({ id: 'l1', rank: '6', suit: 'hearts', logicValue: 64 })]
    };
    const expectedFallback = calculateNextPlay(handCards, lastPlay).cards.map((card) => card.id);

    const result = await askLLMForNextPlay(handCards, lastPlay, '2', 'balanced', undefined, {
      apiKey: 'test-key',
      baseUrl: 'https://mock.llm/v1',
      model: 'mock-model',
      timeoutMs: 3000,
      seat: 2
    });

    expect(result.cards.map((card) => card.id)).toEqual(expectedFallback);
    expect(typeof result.reasoning).toBe('string');
    expect(mockChatCompletionCreate).toHaveBeenCalledTimes(2);
  });

  it('大模型返回手牌外ID时会被拦截并触发降级策略', async () => {
    muteConsoleOutput();
    mockChatCompletionCreate.mockResolvedValue({
      choices: [{ message: { content: '{"action":"play","cards":["ghost_A_spades"]}' } }]
    });

    const handCards: RuntimeCard[] = [
      createCard({ id: 'c1', rank: '6', logicValue: 61 }),
      createCard({ id: 'c2', rank: '7', logicValue: 71 }),
      createCard({ id: 'c3', rank: '9', logicValue: 91 })
    ];
    const lastPlay = {
      playerId: 'playerX',
      cards: [createCard({ id: 'l1', rank: '6', suit: 'hearts', logicValue: 64 })]
    };
    const expectedFallback = calculateNextPlay(handCards, lastPlay).cards.map((card) => card.id);

    const result = await askLLMForNextPlay(handCards, lastPlay, '2', 'aggressive', undefined, {
      apiKey: 'test-key',
      baseUrl: 'https://mock.llm/v1',
      model: 'mock-model',
      timeoutMs: 3000,
      seat: 3
    });

    expect(result.cards.map((card) => card.id)).toEqual(expectedFallback);
    expect(typeof result.reasoning).toBe('string');
    expect(mockChatCompletionCreate).toHaveBeenCalledTimes(2);
  });
});

describe('aiService.askLLMForNextPlay strategic fallback with battle context', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockChatCompletionCreate.mockReset();
  });

  it('队友占先时，不会为了抬队友而直接交炸弹', () => {
    const handCards: RuntimeCard[] = [
      createCard({ id: 's3', rank: '3', logicValue: 31 }),
      createCard({ id: 's4', rank: '4', logicValue: 41 }),
      createCard({ id: 'a1', rank: 'A', suit: 'spades', logicValue: 141 }),
      createCard({ id: 'a2', rank: 'A', suit: 'hearts', logicValue: 142 }),
      createCard({ id: 'a3', rank: 'A', suit: 'clubs', logicValue: 143 }),
      createCard({ id: 'a4', rank: 'A', suit: 'diamonds', logicValue: 144 }),
    ];
    const lastPlay = {
      playerId: 'teammate',
      playerSeat: 2,
      cards: [createCard({ id: 'l6', rank: '6', suit: 'hearts', logicValue: 64 })],
    };

    const result = calculateBattleNextPlay(
      handCards,
      lastPlay,
      'balanced',
      {
        mySeat: 0,
        teammateSeat: 2,
        players: [
          { seat: 0, playerId: 'self', cardsLeft: 6, isTeammate: false },
          { seat: 1, playerId: 'opp-1', cardsLeft: 9, isTeammate: false },
          { seat: 2, playerId: 'mate', cardsLeft: 5, isTeammate: true },
          { seat: 3, playerId: 'opp-2', cardsLeft: 7, isTeammate: false },
        ],
        finishedSeats: [],
      },
    );

    expect(result.cards).toEqual([]);
    expect(result.reasoning).toContain('不出');
  });

  it('队友占先且接近出线时，会优先让牌而非抬队友', async () => {
    muteConsoleOutput();

    const handCards: RuntimeCard[] = [
      createCard({ id: 'c7', rank: '7', logicValue: 71 }),
      createCard({ id: 'c9', rank: '9', logicValue: 91 }),
    ];
    const lastPlay = {
      playerId: 'teammate',
      playerSeat: 2,
      cards: [createCard({ id: 'l6', rank: '6', suit: 'hearts', logicValue: 64 })],
    };

    const result = await askLLMForNextPlay(
      handCards,
      lastPlay,
      '2',
      'balanced',
      {
        mySeat: 0,
        teammateSeat: 2,
        players: [
          { seat: 0, playerId: 'self', cardsLeft: 5, isTeammate: false },
          { seat: 1, playerId: 'opp-1', cardsLeft: 9, isTeammate: false },
          { seat: 2, playerId: 'mate', cardsLeft: 1, isTeammate: true },
          { seat: 3, playerId: 'opp-2', cardsLeft: 7, isTeammate: false },
        ],
        finishedSeats: [],
      },
      {
        apiKey: '',
        seat: 1,
      },
    );

    expect(result.cards).toEqual([]);
    expect(result.reasoning).toContain('不出');
  });

  it('对手占先且濒临出线时，会优先压制而非保守不出', async () => {
    muteConsoleOutput();

    const handCards: RuntimeCard[] = [
      createCard({ id: 'c7', rank: '7', logicValue: 71 }),
      createCard({ id: 'c9', rank: '9', logicValue: 91 }),
    ];
    const lastPlay = {
      playerId: 'opponent',
      playerSeat: 1,
      cards: [createCard({ id: 'l6', rank: '6', suit: 'hearts', logicValue: 64 })],
    };

    const result = await askLLMForNextPlay(
      handCards,
      lastPlay,
      '2',
      'balanced',
      {
        mySeat: 0,
        teammateSeat: 2,
        players: [
          { seat: 0, playerId: 'self', cardsLeft: 5, isTeammate: false },
          { seat: 1, playerId: 'opp-1', cardsLeft: 1, isTeammate: false },
          { seat: 2, playerId: 'mate', cardsLeft: 6, isTeammate: true },
          { seat: 3, playerId: 'opp-2', cardsLeft: 8, isTeammate: false },
        ],
        finishedSeats: [],
      },
      {
        apiKey: '',
        seat: 1,
      },
    );

    expect(result.cards.length).toBeGreaterThan(0);
    expect(canBeat(result.cards, lastPlay.cards)).toBe(true);
  });
});
