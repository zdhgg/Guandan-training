import assert from 'node:assert/strict';
import { identifyPattern } from '../src/core/ruleValidator';
import { RuntimeCard, CardSuit, CardRank } from '../src/core/cardEngine';

function makeCard(
  id: string,
  suit: CardSuit,
  rank: CardRank,
  isWildcard = false
): RuntimeCard {
  return {
    id,
    suit,
    rank,
    deckIndex: 0,
    logicValue: 10,
    isWildcard,
    isSelected: false
  };
}

// 1) 普通顺子
{
  const cards: RuntimeCard[] = [
    makeCard('1', 'hearts', '5'),
    makeCard('2', 'diamonds', '6'),
    makeCard('3', 'clubs', '7'),
    makeCard('4', 'spades', '8'),
    makeCard('5', 'hearts', '9')
  ];
  const result = identifyPattern(cards);
  assert.equal(result.isValid, true);
  assert.equal(result.patternType, 'straight');
}

// 2) 含逢人配顺子
{
  const cards: RuntimeCard[] = [
    makeCard('1', 'hearts', '5'),
    makeCard('2', 'diamonds', '6'),
    makeCard('3', 'clubs', '7'),
    makeCard('4', 'spades', '8'),
    makeCard('5', 'hearts', '9', true)
  ];
  const result = identifyPattern(cards);
  assert.equal(result.isValid, true);
  assert.equal(result.patternType, 'straight');
}

// 3) 逢人配顺子严格约束：存在多余重复牌时应判无效
{
  const cards: RuntimeCard[] = [
    makeCard('1', 'hearts', '5'),
    makeCard('2', 'diamonds', '5'),
    makeCard('3', 'clubs', '6'),
    makeCard('4', 'spades', '7'),
    makeCard('5', 'hearts', '8'),
    makeCard('6', 'hearts', '9', true)
  ];
  const result = identifyPattern(cards);
  assert.equal(result.isValid, false);
}

// 4) 含逢人配炸弹
{
  const cards: RuntimeCard[] = [
    makeCard('1', 'hearts', '8'),
    makeCard('2', 'diamonds', '8'),
    makeCard('3', 'clubs', '8'),
    makeCard('4', 'hearts', '9', true)
  ];
  const result = identifyPattern(cards);
  assert.equal(result.isValid, true);
  assert.equal(result.patternType, 'bomb');
}

// 5) 炸弹严格约束：普通牌点数不一致时应判无效
{
  const cards: RuntimeCard[] = [
    makeCard('1', 'hearts', '8'),
    makeCard('2', 'diamonds', '8'),
    makeCard('3', 'clubs', '9'),
    makeCard('4', 'hearts', '8', true)
  ];
  const result = identifyPattern(cards);
  assert.equal(result.isValid, false);
}

// 6) 直接木板（三带二）判定：5张牌
{
  const cards: RuntimeCard[] = [
    makeCard('1', 'hearts', '3'),
    makeCard('2', 'diamonds', '3'),
    makeCard('3', 'clubs', '3'),
    makeCard('4', 'hearts', '4'),
    makeCard('5', 'spades', '4')
  ];
  const result = identifyPattern(cards);
  assert.equal(result.isValid, true);
  assert.equal(result.patternType, 'plate');
}

// 7) 含逢人配木板（三带二）判定：3+1+wildcard => 3+2
{
  const cards: RuntimeCard[] = [
    makeCard('1', 'hearts', '3'),
    makeCard('2', 'diamonds', '3'),
    makeCard('3', 'clubs', '3'),
    makeCard('4', 'hearts', '4'),
    makeCard('5', 'hearts', '9', true)
  ];
  const result = identifyPattern(cards);
  assert.equal(result.isValid, true);
  assert.equal(result.patternType, 'plate');
}

console.log('ruleValidator tests passed');
