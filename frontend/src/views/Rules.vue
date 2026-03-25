<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PokerCard from '../components/PokerCard.vue'
import type { RuntimeCard } from '../types/cards'

type AcademyTab = 'rules' | 'terms' | 'tips' | 'training'

const activeTab = ref<AcademyTab>('rules')
const router = useRouter()

const tabs: Array<{ key: AcademyTab; icon: string; label: string }> = [
  { key: 'rules', icon: '📖', label: '规则' },
  { key: 'terms', icon: '💬', label: '术语' },
  { key: 'tips', icon: '💡', label: '技巧' },
  { key: 'training', icon: '🎯', label: '训练' },
]

const demoWildcard: RuntimeCard = {
  id: 'academy-demo-wildcard',
  suit: 'hearts',
  rank: '8',
  deckIndex: 0,
  logicValue: 8,
  isWildcard: true,
  isSelected: false,
}

const demoStraightFlush: RuntimeCard[] = [
  {
    id: 'academy-demo-sf-10',
    suit: 'spades',
    rank: '10',
    deckIndex: 0,
    logicValue: 10,
    isWildcard: false,
    isSelected: false,
  },
  {
    id: 'academy-demo-sf-j',
    suit: 'spades',
    rank: 'J',
    deckIndex: 0,
    logicValue: 11,
    isWildcard: false,
    isSelected: false,
  },
  {
    id: 'academy-demo-sf-q',
    suit: 'spades',
    rank: 'Q',
    deckIndex: 0,
    logicValue: 12,
    isWildcard: false,
    isSelected: false,
  },
  {
    id: 'academy-demo-sf-k',
    suit: 'spades',
    rank: 'K',
    deckIndex: 0,
    logicValue: 13,
    isWildcard: false,
    isSelected: false,
  },
  {
    id: 'academy-demo-sf-a',
    suit: 'spades',
    rank: 'A',
    deckIndex: 0,
    logicValue: 14,
    isWildcard: false,
    isSelected: false,
  },
]

const configItems = [
  { label: '人数', value: '4 人（2V2）' },
  { label: '牌数', value: '双副牌 108 张（含 4 王）' },
  { label: '发牌', value: '每人 27 张' },
  { label: '座位', value: '对家为同队' },
]

const upgradeItems = [
  { result: '头游 + 二游（双上）', level: '升 3 级' },
  { result: '头游 + 三游', level: '升 2 级' },
  { result: '头游 + 末游', level: '升 1 级' },
]

const basicPatternItems = [
  '单张、对子、三张（三同张）是最基础的出牌单位。',
  '顺子固定为 5 张；连对（如 334455）、钢板（如 333444）常用于缩短手数。',
  '顺子支持 A-2-3-4-5 与 2-3-4-5-6，不支持 10-J-Q-K-A-2 这类跨边界连接。',
  '同牌型且张数一致时按牌点比较；同点数不比花色，压不过就过牌。',
]

const termItems = [
  {
    title: '级牌',
    desc: '当前局要打的点数。系列赛从 2 逐步升级到 A；单牌比较时，级牌高于所有普通牌。',
  },
  {
    title: '逢人配',
    desc: '仅红桃级牌是逢人配，可替代任意牌；其他花色的级牌只按级牌比较，不具备百搭能力。',
  },
  {
    title: '头游',
    desc: '第一个出完牌的玩家，常决定本局节奏归属。',
  },
  {
    title: '双上',
    desc: '同队包揽头游与二游，升级收益最高。',
  },
  {
    title: '双下',
    desc: '本方两人包揽倒数两名。若系统开启“双下双贡”，下一局会增加第二组进贡流程。',
  },
  {
    title: '抗贡',
    desc: '当前系统支持“双大王抗贡”：下一局发牌后，若末游拿到两张大王，则该组进贡免除。',
  },
  {
    title: '进贡 / 还贡',
    desc: '末游必须进当前最大牌给头游；头游再按当前还贡规则还回 1 张牌，影响下一局起手结构。',
  },
  {
    title: '接风',
    desc: '队友先走后你拿到优先出牌权，可用于止损或反抢节奏。',
  },
]

const mottoItems = [
  { title: '情况不明，对子先行', desc: '局面不清晰时先用对子试探对手资源。' },
  { title: '逢五出二，逢六出三', desc: '根据对手余牌数量选择更容易卡住的牌型。' },
  { title: '七张八张正常出夯', desc: '中后段手牌可用炸弹主动提速，不拖泥带水。' },
  { title: '炸五不炸四', desc: '优先保留更灵活的高阶炸弹，减少后手断档风险。' },
  { title: '小牌先出，大牌后控', desc: '先清理低效小牌，把大牌留给关键夺权回合。' },
  { title: '单牌过河，对子当家', desc: '能走单尽早走单，对子常是中盘主力结构。' },
  { title: '谁打谁收，责任自负', desc: '主动出牌前先想清后续是否能自保。' },
  { title: '配合队友，牺牲自我', desc: '牌差时优先给队友创造头游窗口。' },
]

const memoryTips = [
  '必记：4 张王、8 个 2、8 个 A 的去向。',
  '关注：对手首轮亮出的主打牌型与提速意图。',
  '推算：根据已出牌反推剩余大牌与炸弹分布。',
]

const strategyStrong = [
  '牌力强时要主动提速，争取头游并压缩对手回合。',
  '有优势时尽量留一手高压牌，防止节奏被强拆。',
]

const strategyWeak = [
  '牌力弱时以助攻为先，优先让队友拿回牌权。',
  '必要时牺牲个人手顺，换取队友安全脱手通道。',
]

const compositionTips = [
  '先理牌再出牌，明确哪些组合可一次性跑完。',
  '优先减少总手数，避免把高价值组合拆得过碎。',
  '保留变化空间，逢人配尽量留在关键轮次使用。',
]

function goLeastMovesTraining() {
  void router.push('/game?mode=least_moves')
}
</script>

<template>
  <main class="academy-page">
    <div class="academy-shell">
      <header class="academy-header">
        <router-link class="back-home-btn" to="/">← 返回主页</router-link>
        <h1>掼蛋学习学院</h1>
        <p>把规则、术语、心法与训练串成一条完整成长路径。</p>
      </header>

      <div class="academy-layout">
        <nav class="academy-nav" aria-label="学习模块导航">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="nav-item"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <span class="nav-icon" aria-hidden="true">{{ tab.icon }}</span>
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <section class="academy-content">
          <article v-if="activeTab === 'rules'" class="content-panel">
            <h2>📖 规则模块</h2>
            <p class="panel-intro">
              掼蛋起源于江苏淮安，核心是双人协作与升级机制。
              本页说明以当前系统实际实现为准，便于你在规则学习、设置选项与实战判定之间保持统一理解。
            </p>

            <section class="rule-section">
              <h3>游戏配置</h3>
              <div class="kv-grid">
                <article
                  v-for="item in configItems"
                  :key="item.label"
                  class="kv-item"
                >
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </article>
              </div>
            </section>

            <section class="rule-section">
              <h3>胜负判定与升级</h3>
              <p class="rule-note">名次序列：头游 → 二游 → 三游 → 末游</p>
              <div class="upgrade-grid">
                <article
                  v-for="item in upgradeItems"
                  :key="item.result"
                  class="upgrade-card"
                >
                  <strong>{{ item.result }}</strong>
                  <span>{{ item.level }}</span>
                </article>
              </div>
              <p class="rule-note">
                当前系统系列赛级别按 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → J → Q → K → A 升级，A 为封顶。
              </p>
            </section>

            <div class="split-grid">
              <section class="content-card">
                <h3>基础规则</h3>
                <ul class="rule-list">
                  <li
                    v-for="item in basicPatternItems"
                    :key="item"
                  >
                    {{ item }}
                  </li>
                </ul>
                <p class="rule-note">
                  当前局单牌顺序：大王 > 小王 > 级牌 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2；同点数比较不看花色。
                </p>
              </section>

              <section class="content-card emphasis-card">
                <h3>特殊规则</h3>
                <div class="special-rule-list">
                  <section class="special-rule-item">
                    <h4>逢人配（百搭牌）</h4>
                    <p>仅红桃级牌是逢人配，可替代任意点数和花色，常用于补顺子、补同花顺、补炸弹；其他花色级牌不是百搭。</p>
                    <div class="demo-single-card">
                      <PokerCard :card="demoWildcard" />
                    </div>
                  </section>

                  <section class="special-rule-item">
                    <h4>炸弹压制链</h4>
                    <p>
                      四王炸最高。炸弹之间先比张数，再比点数；5 张同花顺可以压 5 炸，但压不过 6 炸；同点同花顺之间也不按花色分胜负。
                    </p>
                    <div class="demo-hand">
                      <div
                        v-for="card in demoStraightFlush"
                        :key="card.id"
                        class="demo-hand-card"
                      >
                        <PokerCard :card="card" />
                      </div>
                    </div>
                  </section>

                  <section class="special-rule-item">
                    <h4>进贡与还贡</h4>
                    <p>末游需从当前手牌中进 1 张最大牌给头游；头游再还 1 张牌。系统支持“允许还任意较小牌”和“必须还最小牌”两种限制；若没有更小牌，则回退为当前可用最小牌，且不能把收到的贡牌原样还回。</p>
                  </section>

                  <section class="special-rule-item">
                    <h4>双下双贡</h4>
                    <p>开启后，若上局形成双上与双下对应关系，下一局会连续进行两组进贡：末游向头游进贡，三游向二游再进贡一张。</p>
                  </section>

                  <section class="special-rule-item">
                    <h4>双大王抗贡</h4>
                    <p>开启后，若下一局发牌后末游持有两张大王，则该组进贡会被直接跳过。系统支持在设置页按需开关。</p>
                  </section>

                  <section class="special-rule-item">
                    <h4>接风机制</h4>
                    <p>队友先出完后，若轮次传到你，你会获得这一轮的优先出牌权。高质量接风常用于止损、保队友成果或反抢节奏。</p>
                  </section>
                </div>
              </section>
            </div>
          </article>

          <article v-else-if="activeTab === 'terms'" class="content-panel">
            <h2>💬 术语模块</h2>
            <p class="panel-intro">牌桌沟通靠术语，术语一致才能高效配合。</p>
            <div class="term-grid">
              <section
                v-for="item in termItems"
                :key="item.title"
                class="term-card"
              >
                <h3>{{ item.title }}</h3>
                <p>{{ item.desc }}</p>
              </section>
            </div>
          </article>

          <article v-else-if="activeTab === 'tips'" class="content-panel">
            <h2>💡 技巧模块</h2>
            <p class="panel-intro">从“会出牌”到“会赢牌”，关键在于形成稳定决策流程。</p>

            <section class="tips-block">
              <h3>八大口诀（建议熟记）</h3>
              <ol class="motto-list">
                <li
                  v-for="item in mottoItems"
                  :key="item.title"
                >
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.desc }}</p>
                </li>
              </ol>
            </section>

            <div class="tips-grid">
              <section class="tip-card">
                <h3>记牌技巧</h3>
                <ul>
                  <li
                    v-for="item in memoryTips"
                    :key="item"
                  >
                    {{ item }}
                  </li>
                </ul>
              </section>

              <section class="tip-card">
                <h3>牌力强时（主攻）</h3>
                <ul>
                  <li
                    v-for="item in strategyStrong"
                    :key="item"
                  >
                    {{ item }}
                  </li>
                </ul>
              </section>

              <section class="tip-card">
                <h3>牌力弱时（助攻）</h3>
                <ul>
                  <li
                    v-for="item in strategyWeak"
                    :key="item"
                  >
                    {{ item }}
                  </li>
                </ul>
              </section>

              <section class="tip-card">
                <h3>组牌诀窍</h3>
                <ul>
                  <li
                    v-for="item in compositionTips"
                    :key="item"
                  >
                    {{ item }}
                  </li>
                </ul>
              </section>
            </div>
          </article>

          <article v-else class="content-panel">
            <h2>🎯 训练模块</h2>
            <p class="panel-intro">
              纸上得来终觉浅，绝知此事要躬行。前往理牌训练室，提升你的大局观。
            </p>

            <div class="training-box">
              <p>
                推荐先进入「最少手数理牌训练」，重点打磨拆牌效率、组合优先级和收官路径。
              </p>
              <button
                type="button"
                class="training-btn"
                @click="goLeastMovesTraining"
              >
                🚀 立即前往最少手数理牌训练
              </button>
            </div>

            <div class="training-extra">
              <router-link class="extra-link" to="/game?mode=endgame">进入残局挑战库</router-link>
              <router-link class="extra-link" to="/game?mode=battle">进入实战模拟区</router-link>
            </div>
          </article>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.academy-page {
  min-height: 100vh;
  color: rgba(255, 255, 255, 0.9);
  background:
    radial-gradient(circle at 12% 9%, rgba(255, 255, 255, 0.14), transparent 24%),
    radial-gradient(circle at 88% 14%, rgba(197, 255, 221, 0.12), transparent 29%),
    linear-gradient(145deg, #0e5e3b 0%, #0b4a31 52%, #083926 100%);
}

.academy-shell {
  max-width: 1120px;
  margin: 0 auto;
  padding: 32px 20px 40px;
}

.academy-header {
  margin-bottom: 22px;
}

.academy-header h1 {
  margin: 16px 0 8px;
  font-size: clamp(1.9rem, 3.8vw, 2.6rem);
  color: #f6fff8;
}

.academy-header p {
  margin: 0;
  color: rgba(237, 255, 243, 0.82);
}

.back-home-btn {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  color: #eaffef;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  transition: all 0.3s;
}

.back-home-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.back-home-btn:focus-visible {
  outline: 2px solid rgba(255, 250, 196, 0.92);
  outline-offset: 2px;
}

.academy-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
}

.academy-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nav-item {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(7, 46, 30, 0.38);
  color: rgba(246, 255, 248, 0.88);
  border-radius: 12px;
  padding: 12px 14px;
  text-align: left;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition:
    background-color 0.22s ease,
    border-color 0.22s ease,
    transform 0.22s ease;
}

.nav-item:hover {
  background: rgba(18, 91, 60, 0.6);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.nav-item.active {
  background: rgba(21, 116, 76, 0.82);
  border-color: rgba(225, 255, 238, 0.7);
  box-shadow: inset 0 -3px 0 rgba(241, 255, 246, 0.85);
}

.nav-icon {
  font-size: 18px;
}

.academy-content {
  min-width: 0;
}

.content-panel {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  padding: 28px 26px;
}

.content-panel h2 {
  margin: 0 0 14px;
  font-size: 1.52rem;
  color: #f6fff8;
}

.panel-intro {
  margin: 0 0 16px;
  line-height: 1.75;
  color: rgba(235, 255, 242, 0.84);
}

.rule-section {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  margin-bottom: 14px;
}

.rule-section h3 {
  margin: 0 0 10px;
  font-size: 1.16rem;
}

.kv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.kv-item {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: rgba(8, 53, 34, 0.36);
}

.kv-item span {
  color: rgba(237, 255, 243, 0.82);
}

.kv-item strong {
  color: rgba(247, 255, 250, 0.96);
  white-space: nowrap;
}

.upgrade-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.upgrade-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(13, 76, 50, 0.42);
}

.upgrade-card strong {
  display: block;
  font-size: 14px;
  margin-bottom: 6px;
}

.upgrade-card span {
  color: rgba(238, 255, 245, 0.9);
  font-weight: 700;
}

.rule-note {
  margin: 10px 0 0;
  line-height: 1.72;
  color: rgba(236, 255, 242, 0.84);
}

.split-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.content-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 18px 16px;
}

.content-card h3 {
  margin: 0 0 10px;
  font-size: 1.18rem;
}

.rule-list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.75;
  color: rgba(236, 255, 242, 0.84);
}

.emphasis-card {
  background: rgba(22, 111, 73, 0.35);
  border-color: rgba(229, 255, 239, 0.26);
}

.special-rule-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.special-rule-item {
  border-radius: 12px;
  padding: 12px;
  background: rgba(6, 49, 32, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.special-rule-item h4 {
  margin: 0 0 6px;
  font-size: 1.03rem;
  color: rgba(246, 255, 248, 0.95);
}

.special-rule-item p {
  margin: 0;
  line-height: 1.7;
  color: rgba(236, 255, 242, 0.86);
}

.demo-single-card {
  margin-top: 10px;
  display: flex;
}

.demo-hand {
  margin-top: 10px;
  display: flex;
  align-items: center;
  overflow-x: auto;
  padding: 2px 4px 6px 2px;
}

.demo-hand-card + .demo-hand-card {
  margin-left: -20px;
}

.demo-single-card :deep(.poker-card),
.demo-hand :deep(.poker-card) {
  cursor: default;
}

.term-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.term-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px 14px;
}

.term-card h3 {
  margin: 0 0 8px;
  font-size: 1.08rem;
}

.term-card p {
  margin: 0;
  line-height: 1.75;
  color: rgba(236, 255, 242, 0.84);
}

.tips-block {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 14px;
  background: rgba(255, 255, 255, 0.04);
}

.tips-block h3 {
  margin: 0 0 10px;
  font-size: 1.12rem;
}

.motto-list {
  margin: 0;
  padding-left: 18px;
}

.motto-list li + li {
  margin-top: 8px;
}

.motto-list strong {
  display: block;
  margin-bottom: 2px;
}

.motto-list p {
  margin: 0;
  line-height: 1.72;
  color: rgba(236, 255, 242, 0.84);
}

.tips-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.tip-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px 14px;
}

.tip-card h3 {
  margin: 0 0 8px;
  font-size: 1.08rem;
}

.tip-card ul {
  margin: 0;
  padding-left: 18px;
  line-height: 1.75;
  color: rgba(236, 255, 242, 0.84);
}

.training-box {
  background: rgba(22, 109, 72, 0.38);
  border: 1px solid rgba(228, 255, 238, 0.25);
  border-radius: 14px;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
}

.training-box p {
  margin: 0;
  line-height: 1.75;
  color: rgba(236, 255, 242, 0.86);
}

.training-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  color: #0b3f29;
  background: #effff3;
  border-radius: 999px;
  padding: 10px 18px;
  font-weight: 800;
  letter-spacing: 0.4px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.25);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

.training-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.32);
  background: #ffffff;
}

.training-btn:focus-visible {
  outline: 2px solid rgba(255, 250, 196, 0.92);
  outline-offset: 2px;
}

.training-extra {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.extra-link {
  text-decoration: none;
  color: rgba(239, 255, 244, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
}

.extra-link:hover {
  background: rgba(255, 255, 255, 0.12);
}

@media (max-width: 980px) {
  .academy-layout {
    grid-template-columns: 1fr;
  }

  .academy-nav {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .nav-item {
    flex: 1 1 160px;
  }

  .split-grid,
  .term-grid,
  .tips-grid,
  .kv-grid,
  .upgrade-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .academy-shell {
    padding: 24px 12px 28px;
  }

  .content-panel {
    padding: 20px 14px;
  }
}
</style>
