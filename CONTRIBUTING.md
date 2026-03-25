# 参与贡献

感谢你为 Guandan Training 做出贡献。

仓库欢迎使用中文或英文提交 issue 和 pull request。

## 开始之前

- 小范围修复可以直接发起 PR。
- 涉及范围较大的改动，建议先开一个 issue 对齐目标和范围。
- 请尽量保持改动聚焦，不要在同一个 PR 中混入无关重构、格式化和功能变更。

## 开发环境

环境要求：

- Node.js `^20.19.0 || >=22.12.0`
- npm 10+

后端启动：

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

前端启动：

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

本地默认地址：

- 前端：`http://localhost:3005`
- 后端：`http://localhost:8005`

## 项目结构

- `backend/`：Express + TypeScript + Prisma 后端
- `frontend/`：Vue 3 + Vite 前端
- `.github/workflows/ci.yml`：仓库 CI 配置

## 分支建议

- 请从 `main` 分支切出新分支
- 建议使用简短、明确的分支名，例如 `fix/cors-headers` 或 `feat/battle-metrics`

## 提交改动时建议包含

- 行为变化时补充或更新测试
- 安装方式、API 行为或用户可见流程变化时更新文档
- 保持提交信息清晰、改动范围明确
- 如果改动里引入了临时兼容逻辑，优先在同一个 PR 中顺手清理掉

## 测试要求

在发起 PR 前，请至少运行与你改动相关的检查。

后端：

```bash
cd backend
npm test
npm run build
```

前端：

```bash
cd frontend
npm test
npm run build
```

如果你本地无法运行某项检查，请在 PR 描述里明确说明原因。

## 代码规范

- 除非有明确理由，否则请保持现有目录结构和命名方式
- 不要提交本地专用文件，例如 `.env`、`dist/`、`node_modules/` 或编辑器配置
- 优先提交小而清晰、便于审查的改动
- 前端有明显 UI 变化时，请附上截图或简短录屏
- 后端有明显 API 行为变化时，请附上请求 / 响应示例

## 提交信息

建议使用简短、明确的提交信息，例如：

- `fix: allow battle custom headers in cors preflight`
- `docs: add contribution guides and issue templates`
- `feat: persist match action logs`

## PR 自查清单

在请求 review 前，请确认：

- 分支已经同步到最新的 `main`
- 相关测试已在本地通过
- 需要更新的文档已经同步更新
- PR 描述清楚说明了改了什么、为什么改、如何验证

## Release 说明

维护者会统一发布 tag 和 GitHub Release。如果你的 PR 影响发布说明，建议在 PR 描述中补一段简短的 release note 摘要，方便后续直接复用。
