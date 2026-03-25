# Guandan Training Frontend

Vue 3 + TypeScript + Vite frontend for Guandan training and battle simulation.

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- npm 10+

## Start the frontend

Optional: copy `frontend/.env.example` to `frontend/.env` if you want to change the default ports or API target.

```bash
cd frontend
npm install
npm run dev
```

Default local URL:

- `http://localhost:3005`

## Available modes

- `实战模拟区`: human vs AI battle flow
- `全 AI 对战观战`: fully automated AI-vs-AI sessions
- `最少手数理牌训练`: grouping optimization practice
- `残局挑战库`: UI entry reserved for challenge-style training
- `基础规则学习`: rules and onboarding page
- `设置`: LLM connection, model, seat personalities, and strategy tuning

## Environment variables

- `VITE_PORT`: frontend dev server port, default `3005`
- `VITE_PROXY_TARGET`: Vite proxy target for `/api`, default `http://localhost:8005`
- `VITE_API_BASE_URL`: optional direct backend base URL; when empty, the frontend uses `/api` proxying
- `VITE_PLAYER_ID`: UI player id, default `player1`

## API behavior

- Development uses the Vite proxy to forward `/api` to the backend.
- If `VITE_API_BASE_URL` is set, requests are sent directly to that backend instead.
- Invalid values such as `:8005` or `api` are ignored and safely fall back to `/api`.

## Scripts

- `npm run dev`: start the Vite dev server
- `npm run build`: type-check and build production assets
- `npm run preview`: preview the built app
- `npm test`: run Vitest suites

## Testing

```bash
npm test
```

The frontend tests cover the API client and the main Pinia stores used by training, battle, and settings flows.
