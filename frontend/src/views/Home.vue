<template>
  <main class="home-lobby">
    <header class="hero">
      <router-link class="settings-link" to="/settings" aria-label="打开全局设置">⚙️ 设置</router-link>
      <h1>掼蛋高阶训练系统</h1>
    </header>

    <section class="mode-grid" aria-label="训练模式入口">
      <router-link class="mode-card" to="/game?mode=battle">
        <span class="mode-icon" aria-hidden="true">⚔️</span>
        <h2>实战模拟区</h2>
        <p>进入完整牌局节奏演练，对抗式训练当前牌型决策。</p>
      </router-link>

      <router-link class="mode-card" to="/game?mode=battle_ai">
        <span class="mode-icon" aria-hidden="true">🤖</span>
        <h2>全 AI 对战观战</h2>
        <p>观看四家 AI 自动博弈，逐手观察牌路推进与策略选择。</p>
      </router-link>

      <router-link class="mode-card" to="/game?mode=least_moves">
        <span class="mode-icon" aria-hidden="true">🧠</span>
        <h2>最少手数理牌训练</h2>
        <p>聚焦最优拆牌路径，训练如何以更少手数完成收官。</p>
      </router-link>

      <router-link class="mode-card" to="/game?mode=endgame">
        <span class="mode-icon" aria-hidden="true">🎯</span>
        <h2>残局挑战库</h2>
        <p>从高强度残局样本出发，快速提升关键回合解题能力。</p>
      </router-link>

      <router-link class="mode-card" to="/rules">
        <span class="mode-icon" aria-hidden="true">📖</span>
        <h2>基础规则学习</h2>
        <p>零基础快速上手，掌握掼蛋核心牌型与特殊机制。</p>
      </router-link>
    </section>
  </main>
</template>

<style scoped>
.home-lobby {
  min-height: 100vh;
  padding: 56px 24px 40px;
  color: #f4fff6;
  background:
    radial-gradient(circle at 14% 10%, rgba(255, 255, 255, 0.17), transparent 24%),
    radial-gradient(circle at 88% 7%, rgba(199, 255, 222, 0.18), transparent 28%),
    linear-gradient(145deg, #0e5e3b 0%, #0b4a31 50%, #083926 100%);
}

.hero {
  position: relative;
  text-align: center;
  margin-bottom: 40px;
}

.hero h1 {
  margin: 0;
  font-size: clamp(30px, 4.3vw, 52px);
  letter-spacing: 2px;
  color: #f0fff4;
  text-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}

.settings-link {
  position: absolute;
  right: 0;
  top: 6px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(243, 255, 247, 0.26);
  text-decoration: none;
  color: #f4fff7;
  font-size: 14px;
  font-weight: 700;
  background: rgba(8, 48, 30, 0.56);
  transition: transform 0.18s ease, background-color 0.18s ease;
}

.settings-link:hover {
  transform: translateY(-1px);
  background: rgba(14, 69, 44, 0.66);
}

.mode-grid {
  max-width: 980px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(280px, 1fr));
  gap: 24px;
}

.mode-card {
  min-height: 270px;
  border-radius: 20px;
  padding: 28px 24px;
  text-decoration: none;
  color: #f6fff7;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  background:
    linear-gradient(160deg, rgba(24, 111, 73, 0.72) 0%, rgba(11, 71, 47, 0.78) 100%),
    radial-gradient(circle at 84% 16%, rgba(213, 255, 231, 0.14), transparent 44%);
  border: 1px solid rgba(239, 255, 244, 0.24);
  box-shadow: 0 16px 32px rgba(3, 25, 16, 0.36);
  backdrop-filter: blur(3px);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.mode-card:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 26px 38px rgba(4, 23, 15, 0.46);
  border-color: rgba(247, 255, 249, 0.42);
}

.mode-card:focus-visible {
  outline: 2px solid rgba(255, 250, 196, 0.92);
  outline-offset: 2px;
}

.mode-icon {
  font-size: 34px;
}

.mode-card h2 {
  margin: 0;
  font-size: clamp(22px, 2vw, 28px);
  line-height: 1.25;
}

.mode-card p {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: rgba(239, 255, 244, 0.86);
}

@media (max-width: 760px) {
  .home-lobby {
    padding: 36px 16px 24px;
  }

  .hero {
    margin-bottom: 26px;
  }

  .settings-link {
    position: static;
    display: inline-flex;
    margin-bottom: 14px;
  }

  .mode-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .mode-card {
    min-height: 220px;
    padding: 22px 20px;
  }
}
</style>
