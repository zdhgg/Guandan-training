import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import GameTable from '../views/GameTable.vue'
import Rules from '../views/Rules.vue'
import Settings from '../views/Settings.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/game',
      name: 'game-table',
      component: GameTable,
    },
    {
      path: '/rules',
      name: 'rules',
      component: Rules,
    },
    {
      path: '/settings',
      name: 'settings',
      component: Settings,
    },
  ],
})

export default router
