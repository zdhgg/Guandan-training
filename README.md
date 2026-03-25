# Guandan Training

[![CI](https://github.com/zdhgg/Guandan-training/actions/workflows/ci.yml/badge.svg)](https://github.com/zdhgg/Guandan-training/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/zdhgg/Guandan-training)](https://github.com/zdhgg/Guandan-training/releases/tag/v1.0.0)
[![License](https://img.shields.io/github/license/zdhgg/Guandan-training)](https://github.com/zdhgg/Guandan-training/blob/main/LICENSE)

Guandan Training 是一个面向掼蛋训练的智能化系统仓库，采用前后端分离的 monorepo 结构，包含 TypeScript 后端和 Vue 3 前端。

当前 `1.0.0` 版本主要包含以下能力：

- 最少手数理牌训练与牌组合法性校验
- 人机实战模式
- 全 AI 对战观战模式
- 对局时间轴回放与最近对局恢复
- LLM 连通性测试、座位人格配置与策略调参

## 仓库结构

```text
guandan-training/
|- backend/   # Express + TypeScript + Prisma 后端
|- frontend/  # Vue 3 + Vite 前端
|- CHANGELOG.md
`- README.md
```

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`
- npm 10+

由于前端使用 Vite 7，建议整个仓库统一使用 Node 20.19 及以上版本。

## 快速开始

1. 准备后端

   将 `backend/.env.example` 复制为 `backend/.env`，再按需要修改配置：

   ```bash
   cd backend
   npm install
   npx prisma migrate deploy
   npm run dev
   ```

2. 在第二个终端准备前端

   如果需要覆盖默认配置，可将 `frontend/.env.example` 复制为 `frontend/.env`：

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. 打开本地服务

- 前端：`http://localhost:3005`
- 后端健康检查：`http://localhost:8005/health`

## 验证情况

当前代码已完成以下验证：

- `backend`: `npm test`, `npm run build`
- `frontend`: `npm test`, `npm run build`

## 后端概览

后端目前提供：

- 对局创建、开局手牌查询、出牌提交、操作日志查询
- 训练模式的新手牌生成、合法性校验、自动理牌
- 实战模式的开局、出牌、流式出牌、AI 推进、下一局、进贡流程、指标和会话恢复
- LLM 连通性测试与运行时请求头覆盖配置

详细说明见 [backend/README.md](backend/README.md)。

## 前端概览

前端目前包含：

- 首页大厅与模式选择
- 带时间轴回看的实战牌桌
- 最少手数理牌训练流程
- 规则说明页面
- LLM 与人格配置面板

详细说明见 [frontend/README.md](frontend/README.md)。

## 参与贡献

开发环境、测试要求、issue 提交流程和 PR 规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。
