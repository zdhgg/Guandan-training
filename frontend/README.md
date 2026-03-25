# Guandan Training Frontend

这是 Guandan Training 的前端应用，基于 Vue 3 + TypeScript + Vite，负责训练模式、实战牌桌、规则页面和 LLM 设置界面。

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`
- npm 10+

## 启动前端

如果需要修改默认端口或 API 目标地址，可先将 `frontend/.env.example` 复制为 `frontend/.env`。

```bash
cd frontend
npm install
npm run dev
```

默认本地地址：

- `http://localhost:3005`

## 当前可用模式

- `实战模拟区`：人机实战流程
- `全 AI 对战观战`：四家 AI 自动对战观战
- `最少手数理牌训练`：理牌优化训练
- `残局挑战库`：预留的残局训练入口
- `基础规则学习`：规则说明和入门内容
- `设置`：LLM 连接、模型、座位人格和策略参数配置

## 环境变量

- `VITE_PORT`：前端开发服务器端口，默认 `3005`
- `VITE_PROXY_TARGET`：开发环境 `/api` 代理目标，默认 `http://localhost:8005`
- `VITE_API_BASE_URL`：可选的后端直连地址；为空时默认走 `/api` 代理
- `VITE_PLAYER_ID`：前端默认玩家 ID，默认 `player1`

## API 行为说明

- 开发环境下，Vite 会将 `/api` 请求代理到后端服务。
- 如果设置了 `VITE_API_BASE_URL`，前端会直接请求指定后端。
- 像 `:8005` 或 `api` 这类无效值会被自动忽略，并安全回退到 `/api` 代理模式。

## 常用脚本

- `npm run dev`：启动 Vite 开发服务器
- `npm run build`：执行类型检查并构建生产资源
- `npm run preview`：预览构建后的前端
- `npm test`：执行 Vitest 测试

## 测试

```bash
npm test
```

当前前端测试覆盖了 API 客户端和训练、实战、设置相关的主要 Pinia store。
