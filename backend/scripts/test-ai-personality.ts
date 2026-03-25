import 'dotenv/config';
import type { CardRank, CardSuit, RuntimeCard } from '../src/core/cardEngine';
import { askLLMForNextPlay, type AIPlayerPersonality } from '../src/services/aiService';

function createCard(params: {
  id: string;
  rank: CardRank;
  suit: CardSuit;
  logicValue: number;
  deckIndex?: number;
  isWildcard?: boolean;
}): RuntimeCard {
  return {
    id: params.id,
    rank: params.rank,
    suit: params.suit,
    deckIndex: params.deckIndex ?? 0,
    logicValue: params.logicValue,
    isWildcard: params.isWildcard ?? false,
    isSelected: false
  };
}

function cloneCards(cards: RuntimeCard[]): RuntimeCard[] {
  return cards.map((card) => ({ ...card }));
}

function formatCards(cards: RuntimeCard[]): string {
  if (cards.length === 0) {
    return 'Pass';
  }
  return cards.map((card) => `${card.rank}-${card.suit}(${card.id})`).join(', ');
}

function isBomb(cards: RuntimeCard[]): boolean {
  if (cards.length < 4) {
    return false;
  }
  return new Set(cards.map((card) => card.rank)).size === 1;
}

async function runScenario(personality: AIPlayerPersonality, seat: number): Promise<RuntimeCard[]> {
  const apiKey = process.env.LLM_API_KEY?.trim() ?? '';
  const baseUrl = process.env.LLM_BASE_URL?.trim() || undefined;
  const model = process.env.LLM_MODEL?.trim() || undefined;

  if (!apiKey) {
    throw new Error('缺少 LLM_API_KEY，无法进行真实 personality 对比测试。');
  }

  const handCards: RuntimeCard[] = [
    createCard({ id: 'b8_spades', rank: '8', suit: 'spades', logicValue: 61 }),
    createCard({ id: 'b8_clubs', rank: '8', suit: 'clubs', logicValue: 62 }),
    createCard({ id: 'b8_diamonds', rank: '8', suit: 'diamonds', logicValue: 63 }),
    createCard({ id: 'b8_hearts', rank: '8', suit: 'hearts', logicValue: 64 }),
    createCard({ id: 'single_3', rank: '3', suit: 'spades', logicValue: 11 }),
    createCard({ id: 'single_4', rank: '4', suit: 'clubs', logicValue: 22 })
  ];

  const lastPlay = {
    playerId: 'opponent',
    cards: [createCard({ id: 'op_single_A', rank: 'A', suit: 'spades', logicValue: 121 })]
  };

  return askLLMForNextPlay(cloneCards(handCards), lastPlay, '2', personality, {
    apiKey,
    baseUrl,
    model,
    timeoutMs: 6000,
    seat
  });
}

async function main(): Promise<void> {
  console.log('=== AI Personality Endgame Scenario ===');
  console.log('Level: 2');
  console.log('Hand: bomb(8x4) + single3 + single4');
  console.log('Last Play: single A');
  console.log('');

  const aggressiveResult = await runScenario('aggressive', 1);
  const conservativeResult = await runScenario('conservative', 3);

  console.log('[aggressive]', formatCards(aggressiveResult));
  console.log('[conservative]', formatCards(conservativeResult));
  console.log('');

  const aggressiveAction = aggressiveResult.length === 0 ? 'pass' : 'play';
  const conservativeAction = conservativeResult.length === 0 ? 'pass' : 'play';

  console.log('=== Comparison ===');
  console.log(`aggressive action: ${aggressiveAction}`);
  console.log(`conservative action: ${conservativeAction}`);
  console.log(`aggressive bomb?: ${isBomb(aggressiveResult) ? 'yes' : 'no'}`);
  console.log(`conservative bomb?: ${isBomb(conservativeResult) ? 'yes' : 'no'}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '未知错误';
  console.error(`[test-ai-personality] failed: ${message}`);
  process.exitCode = 1;
});
