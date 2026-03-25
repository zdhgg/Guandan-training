# Guandan Training Backend

这是 Guandan Training 的后端服务，基于 Express + TypeScript + Prisma，负责训练模式、实战模式、对局记录以及 LLM 相关能力。

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`
- npm 10+

## 启动方式

1. 将 `backend/.env.example` 复制为 `backend/.env`
2. 安装依赖并初始化 SQLite 数据库

```bash
cd backend
npm install
npx prisma migrate deploy
```

3. 启动开发环境

```bash
npm run dev
```

生产构建：

```bash
npm run build
npm start
```

## 环境变量

`.env` 中常用配置如下：

```bash
PORT=8005
NODE_ENV=development
CORS_ORIGIN=http://localhost:3005
DATABASE_URL="file:./prisma/dev.db"
LLM_API_KEY=your_llm_api_key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_DECISION_MODE=candidate
```

说明：

- 如果只使用内置回退逻辑，`LLM_*` 配置不是必填项。
- 前端设置页可以在运行时通过请求头覆盖 LLM 地址、模型和人格配置。

## 常用脚本

- `npm run dev`：使用 `nodemon` 启动开发服务
- `npm run dev:ts`：使用 `ts-node` 启动服务
- `npm run build`：编译 TypeScript 到 `dist/`
- `npm start`：运行编译后的后端
- `npm test`：执行 Vitest 测试
- `npm run clean`：删除 `dist/`

## API 概览

基础地址：`http://localhost:8005`

核心接口：

- `GET /health`：健康检查
- `POST /api/matches`：创建持久化对局
- `GET /api/matches/:id/hands/initial`：获取某个玩家的开局 27 张手牌
- `POST /api/matches/:id/play`：在基础对局模式中提交出牌
- `GET /api/matches/:id/logs`：获取持久化操作日志

训练模式接口：

- `GET /api/training/new-hand`
- `POST /api/training/validate-groups`
- `POST /api/training/auto-group`

实战模式接口：

- `POST /api/battle/start`
- `POST /api/battle/play`
- `POST /api/battle/play/stream`
- `POST /api/battle/advance`
- `POST /api/battle/advance/stream`
- `GET /api/battle/state`
- `GET /api/battle/sessions`
- `POST /api/battle/next-round`
- `POST /api/battle/tribute`
- `GET /api/battle/metrics`
- `POST /api/battle/metrics/reset`

LLM 工具接口：

- `POST /api/llm/ping`

## 测试

```bash
npm test
```

当前后端测试覆盖了规则校验、实战服务、实战路由、开局手牌查询、训练校验和 LLM 路由集成。
