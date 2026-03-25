/**
 * 掼蛋游戏核心牌引擎
 * 处理扑克牌的生成、洗牌和分发逻辑
 */

// 牌的花色类型
export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';
// 牌的点数类型 (3-10, J, Q, K, A, 2, JOKER)
export type CardRank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2' | 'JOKER';

/**
 * 基础牌接口
 */
export interface BaseCard {
  /** 唯一标识符 */
  id: string;
  /** 花色 */
  suit: CardSuit;
  /** 点数 */
  rank: CardRank;
  /** 所属牌堆索引 (0: 第一副牌, 1: 第二副牌) */
  deckIndex: number;
}

/**
 * 运行时牌接口（包含游戏逻辑属性）
 */
export interface RuntimeCard extends BaseCard {
  /** 逻辑值 - 用于比较大小 */
  logicValue: number;
  /** 是否为逢人配（万能配牌） */
  isWildcard: boolean;
  /** 是否被选中 */
  isSelected: boolean;
}

/**
 * 花色配置
 */
const SUITS: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

/**
 * 普通点数（除大小王外）
 */
const NORMAL_RANKS: CardRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

/**
 * 根据级牌计算基本逻辑值
 * 规则：2最小，A最大，级牌更大，大王最大，小王次大
 */
function calculateBaseLogicValue(rank: CardRank, currentLevel: string): number {
  const rankOrder: Record<CardRank, number> = {
    '2': 1,
    '3': 2,
    '4': 3,
    '5': 4,
    '6': 5,
    '7': 6,
    '8': 7,
    '9': 8,
    '10': 9,
    'J': 10,
    'Q': 11,
    'K': 12,
    'A': 13,
    'JOKER': 14 // 大小王基础值，后续会调整
  };

  let baseValue = rankOrder[rank];
  
  // 如果是级牌，提升逻辑值
  if (rank === currentLevel) {
    baseValue = 15; // 级牌比2大
  }
  
  return baseValue;
}

/**
 * 生成完整的两副扑克牌（108张）
 * @param currentLevel 当前级牌，如 '8'
 * @returns 生成的牌堆
 */
export function generateDeck(currentLevel: string): RuntimeCard[] {
  const deck: RuntimeCard[] = [];
  let cardId = 0;

  // 生成两副牌
  for (let deckIndex = 0; deckIndex < 2; deckIndex++) {
    // 生成普通牌（52张）
    for (const suit of SUITS) {
      for (const rank of NORMAL_RANKS) {
        const baseValue = calculateBaseLogicValue(rank, currentLevel);
        const isWildcard = (suit === 'hearts' && rank === currentLevel);
        
        // 调整逻辑值：花色影响小分值
        let logicValue = baseValue * 10;
        switch (suit) {
          case 'hearts': logicValue += 4; break;
          case 'diamonds': logicValue += 3; break;
          case 'clubs': logicValue += 2; break;
          case 'spades': logicValue += 1; break;
        }

        deck.push({
          id: `card_${cardId++}`,
          suit,
          rank,
          deckIndex,
          logicValue,
          isWildcard,
          isSelected: false
        });
      }
    }

    // 生成大小王（4张 - 每副牌大小王各一）
    // 小王
    deck.push({
      id: `card_${cardId++}`,
      suit: 'joker',
      rank: 'JOKER',
      deckIndex,
      // 同级别王在比较上必须视为等值，不能因副牌索引出现“大王压大王”。
      logicValue: 160, // 小王逻辑值
      isWildcard: false,
      isSelected: false
    });

    // 大王
    deck.push({
      id: `card_${cardId++}`,
      suit: 'joker',
      rank: 'JOKER',
      deckIndex,
      logicValue: 170, // 大王逻辑值
      isWildcard: false,
      isSelected: false
    });
  }

  // 验证牌的数量
  if (deck.length !== 108) {
    console.warn(`警告：生成的牌数量为 ${deck.length}，应为 108`);
  }

  return deck;
}

/**
 * Fisher-Yates 洗牌算法
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 对运行时牌堆进行洗牌（不会修改原数组）
 */
export function shuffleDeck(deck: RuntimeCard[]): RuntimeCard[] {
  return shuffleArray(deck);
}

/**
 * 玩家手牌接口
 */
export interface PlayerHands {
  player1: RuntimeCard[];
  player2: RuntimeCard[];
  player3: RuntimeCard[];
  player4: RuntimeCard[];
}

/**
 * 洗牌并分发给4个玩家
 * @param deck 牌堆
 * @returns 4个玩家的手牌
 */
export function dealCards(deck: RuntimeCard[]): PlayerHands {
  // 洗牌
  const shuffledDeck = shuffleDeck(deck);
  
  // 初始化玩家手牌
  const playerHands: PlayerHands = {
    player1: [],
    player2: [],
    player3: [],
    player4: []
  };

  // 均分牌给4个玩家
  const cardsPerPlayer = Math.floor(shuffledDeck.length / 4);
  
  for (let i = 0; i < shuffledDeck.length; i++) {
    const playerIndex = i % 4;
    switch (playerIndex) {
      case 0:
        playerHands.player1.push(shuffledDeck[i]);
        break;
      case 1:
        playerHands.player2.push(shuffledDeck[i]);
        break;
      case 2:
        playerHands.player3.push(shuffledDeck[i]);
        break;
      case 3:
        playerHands.player4.push(shuffledDeck[i]);
        break;
    }
  }

  // 验证每个玩家的牌数
  const expectedCards = 27; // 108 ÷ 4 = 27
  [playerHands.player1, playerHands.player2, playerHands.player3, playerHands.player4].forEach((hand, index) => {
    if (hand.length !== expectedCards) {
      console.warn(`玩家 ${index + 1} 手牌数量为 ${hand.length}，应为 ${expectedCards}`);
    }
  });

  return playerHands;
}

/**
 * 测试函数
 */
export function testCardEngine(): void {
  console.log('=== 掼蛋牌引擎测试 ===');
  
  // 测试生成牌堆
  const deck = generateDeck('8');
  console.log(`生成牌堆数量: ${deck.length}张`);
  
  // 检查逢人配（红桃8）
  const wildcards = deck.filter(card => card.isWildcard);
  console.log(`逢人配数量: ${wildcards.length}张`);
  console.log('逢人配详情:', wildcards.map(card => ({
    id: card.id,
    suit: card.suit,
    rank: card.rank,
    deckIndex: card.deckIndex
  })));
  
  // 测试洗牌和发牌
  const playerHands = dealCards(deck);
  console.log('\n玩家手牌分布:');
  console.log(`玩家1: ${playerHands.player1.length}张`);
  console.log(`玩家2: ${playerHands.player2.length}张`);
  console.log(`玩家3: ${playerHands.player3.length}张`);
  console.log(`玩家4: ${playerHands.player4.length}张`);
  
  // 显示一些牌的逻辑值示例
  console.log('\n牌值示例:');
  const sampleCards = deck.slice(0, 5);
  sampleCards.forEach(card => {
    console.log(`${card.suit}${card.rank}: 逻辑值=${card.logicValue}, 逢人配=${card.isWildcard}`);
  });
  
  console.log('\n=== 测试完成 ===');
}
