import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8005'
  const frontendPort = Number(env.VITE_PORT || 3005)

  return {
    plugins: [vue()],
    server: {
      port: Number.isFinite(frontendPort) ? frontendPort : 3005,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
