<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeCard } from '../types/cards'

const props = defineProps<{
  card: RuntimeCard
}>()

const suitSymbols: Record<RuntimeCard['suit'], string> = {
  spades: '♠',
  hearts: '♥',
  clubs: '♣',
  diamonds: '♦',
  joker: '🃏',
}

const isRedSuit = computed(() => props.card.suit === 'hearts' || props.card.suit === 'diamonds' || (props.card.suit === 'joker' && props.card.logicValue > 165))
const displayRank = computed(() => {
  if (props.card.rank === 'JOKER') {
    return props.card.logicValue > 165 ? '大王' : '小王'
  }
  return props.card.rank
})
const suitSymbol = computed(() => {
  if (props.card.suit === 'joker') {
    return '' // 不显示角落的小符号
  }
  return suitSymbols[props.card.suit]
})
const centerSymbol = computed(() => {
  if (props.card.suit === 'joker') {
    return '🃏'
  }
  return suitSymbols[props.card.suit]
})
</script>

<template>
  <article
    class="poker-card"
    :class="{
      red: isRedSuit,
      black: !isRedSuit,
      wildcard: card.isWildcard,
      selected: card.isSelected,
      'small-joker': card.suit === 'joker' && card.logicValue <= 165
    }"
  >
    <span v-if="card.isSelected" class="selected-badge">已选</span>
    <div class="corner">
      <span class="rank" :class="{'joker-text': card.suit === 'joker'}">{{ displayRank }}</span>
      <span class="suit">{{ suitSymbol }}</span>
    </div>
    <div class="center" :class="{'joker-center': card.suit === 'joker'}">{{ centerSymbol }}</div>
    <div class="corner corner-bottom">
      <span class="rank" :class="{'joker-text': card.suit === 'joker'}">{{ displayRank }}</span>
      <span class="suit">{{ suitSymbol }}</span>
    </div>
  </article>
</template>

<style scoped>
.poker-card {
  position: relative;
  width: 88px;
  height: 128px;
  border-radius: 13px;
  border: 1px solid #cfd5de;
  background: linear-gradient(165deg, #ffffff 0%, #f3f6fb 100%);
  box-shadow: 0 7px 16px rgba(20, 31, 51, 0.22);
  padding: 9px 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.poker-card.selected {
  transform: translateY(-14px);
  border-color: #52d2a1;
  box-shadow:
    0 0 0 3px rgba(82, 210, 161, 0.55),
    0 12px 24px rgba(8, 55, 33, 0.42);
}

.poker-card.wildcard {
  border-color: #e4be53;
  background: linear-gradient(165deg, #fffdf5 0%, #fff6d8 100%);
  box-shadow:
    0 0 0 1px rgba(228, 190, 83, 0.45),
    0 8px 18px rgba(97, 74, 20, 0.22);
}

.poker-card.selected.wildcard {
  border-color: #52d2a1;
  box-shadow:
    0 0 0 3px rgba(82, 210, 161, 0.55),
    0 12px 24px rgba(8, 55, 33, 0.42);
}

.poker-card.red {
  color: #be1d2d;
}

.poker-card.black {
  color: #1f2937;
}

.corner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1;
  font-weight: 700;
  font-size: 15px;
}

.corner-bottom {
  transform: rotate(180deg);
  align-self: flex-end;
}

.center {
  align-self: center;
  font-size: 30px;
}

.joker-center {
  font-size: 52px;
  line-height: 1;
}

.small-joker .joker-center {
  filter: grayscale(100%);
  opacity: 0.85;
}

.joker-text {
  font-size: 13px;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: -2px;
}

.selected-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #083321;
  background: rgba(144, 245, 196, 0.95);
  border: 1px solid rgba(7, 75, 48, 0.25);
}
</style>
