<script setup lang="ts">
import { computed } from 'vue'
import draggable from 'vuedraggable'
import type { SortableEvent } from 'sortablejs'
import PokerCard from './PokerCard.vue'
import type { CardGroup as CardGroupModel, CardMovePayload } from '../types/cards'

const props = defineProps<{
  group: CardGroupModel
}>()

const emit = defineEmits<{
  (event: 'card-move', payload: CardMovePayload): void
  (event: 'card-toggle', cardId: string): void
}>()

const groupNames: Record<string, string> = {
  spades: '黑桃',
  hearts: '红桃',
  clubs: '梅花',
  diamonds: '方块',
  joker: '王',
}

const groupTitle = computed(() => {
  const mapped = groupNames[props.group.groupId]
  if (mapped) {
    return mapped
  }

  if (props.group.groupId.startsWith('smart-group-')) {
    const index = Number(props.group.groupId.replace('smart-group-', ''))
    if (!Number.isNaN(index) && index > 0) {
      return `智能牌堆 ${index}`
    }
  }

  return props.group.groupId
})

const isSmartGroup = computed(() => props.group.groupId.startsWith('smart-group-'))

const overlapSpreadClass = computed(() => {
  const cardCount = props.group.cards.length
  if (cardCount <= 6) {
    return 'spread-wide'
  }
  if (cardCount <= 11) {
    return 'spread-relaxed'
  }
  if (cardCount <= 18) {
    return 'spread-balanced'
  }
  return 'spread-compact'
})

const readGroupId = (element: Element | null): string | undefined =>
  (element as HTMLElement | null)?.dataset.groupId

const readCardId = (element: Element | null): string | undefined =>
  (element as HTMLElement | null)?.dataset.cardId

const onAdd = (event: SortableEvent): void => {
  const cardId = readCardId(event.item)
  const fromGroupId = readGroupId(event.from)
  const toGroupId = readGroupId(event.to) ?? props.group.groupId
  if (!cardId || !fromGroupId || event.newIndex === undefined) {
    return
  }

  emit('card-move', {
    cardId,
    fromGroupId,
    toGroupId,
    newIndex: event.newIndex,
  })
}

const onUpdate = (event: SortableEvent): void => {
  const cardId = readCardId(event.item)
  const groupId = readGroupId(event.from) ?? props.group.groupId
  if (!cardId || event.newIndex === undefined) {
    return
  }

  emit('card-move', {
    cardId,
    fromGroupId: groupId,
    toGroupId: groupId,
    newIndex: event.newIndex,
  })
}
</script>

<template>
  <section class="card-group" :class="[overlapSpreadClass, { 'smart-group': isSmartGroup }]">
    <header class="group-title">{{ groupTitle }}</header>
    <draggable
      :model-value="group.cards"
      :group="{ name: 'hand-cards', pull: true, put: true }"
      item-key="id"
      class="group-cards"
      tag="div"
      :animation="180"
      :data-group-id="group.groupId"
      ghost-class="drag-ghost"
      chosen-class="drag-chosen"
      @add="onAdd"
      @update="onUpdate"
    >
      <template #item="{ element, index }">
        <div
          class="card-wrapper"
          :style="{ zIndex: index + 1 }"
          :data-card-id="element.id"
          @click.stop="emit('card-toggle', element.id)"
        >
          <PokerCard :card="element" />
        </div>
      </template>
    </draggable>
  </section>
</template>

<style scoped>
.card-group {
  --card-overlap: -48px;
  min-width: 110px;
  padding: 10px 8px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(3px);
}

.card-group.smart-group {
  min-width: 96px;
}

.card-group.spread-wide {
  --card-overlap: -10px;
}

.card-group.spread-relaxed {
  --card-overlap: -24px;
}

.card-group.spread-balanced {
  --card-overlap: -36px;
}

.card-group.spread-compact {
  --card-overlap: -48px;
}

.card-group.smart-group.spread-wide {
  --card-overlap: -36px;
}

.card-group.smart-group.spread-relaxed {
  --card-overlap: -48px;
}

.card-group.smart-group.spread-balanced {
  --card-overlap: -58px;
}

.card-group.smart-group.spread-compact {
  --card-overlap: -64px;
}

.group-title {
  font-size: 12px;
  margin-bottom: 8px;
  color: #f3fcf4;
  font-weight: 700;
  cursor: grab;
  user-select: none;
  letter-spacing: 0.04em;
}

.group-cards {
  min-height: 138px;
  display: flex;
  align-items: flex-end;
  padding-left: 2px;
}

.card-wrapper {
  transition:
    transform 0.2s ease,
    margin-left 0.2s ease;
}

.card-wrapper + .card-wrapper {
  margin-left: var(--card-overlap);
}

.card-wrapper:hover {
  transform: translateY(-8px);
}

:deep(.drag-ghost) {
  opacity: 0.5;
}

:deep(.drag-chosen) {
  cursor: grabbing;
}

@media (max-width: 768px) {
  .card-group.spread-wide {
    --card-overlap: -20px;
  }

  .card-group.spread-relaxed {
    --card-overlap: -32px;
  }

  .card-group.spread-balanced {
    --card-overlap: -42px;
  }

  .card-group.spread-compact {
    --card-overlap: -52px;
  }

  .card-group.smart-group.spread-wide {
    --card-overlap: -42px;
  }

  .card-group.smart-group.spread-relaxed {
    --card-overlap: -52px;
  }

  .card-group.smart-group.spread-balanced {
    --card-overlap: -60px;
  }

  .card-group.smart-group.spread-compact {
    --card-overlap: -66px;
  }
}
</style>
