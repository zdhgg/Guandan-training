# Guandan Training Backend

Express + TypeScript backend for Guandan training, battle simulation, and LLM-assisted decision experiments.

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- npm 10+

## Setup

1. Copy `backend/.env.example` to `backend/.env`
2. Install dependencies and initialize the SQLite database

```bash
cd backend
npm install
npx prisma migrate deploy
```

3. Start the server

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

## Environment variables

Important variables in `.env`:

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

Notes:

- `LLM_*` values are optional if you only use built-in fallback logic.
- The frontend settings page can override LLM connection and model headers at runtime.

## Scripts

- `npm run dev`: start the development server with `nodemon`
- `npm run dev:ts`: start the server with `ts-node`
- `npm run build`: compile TypeScript into `dist/`
- `npm start`: run the compiled backend
- `npm test`: run Vitest suites
- `npm run clean`: remove `dist/`

## API summary

Base URL: `http://localhost:8005`

Core endpoints:

- `GET /health`: health check
- `POST /api/matches`: create a persisted match record
- `GET /api/matches/:id/hands/initial`: fetch one player's initial 27 cards
- `POST /api/matches/:id/play`: submit a play in match mode
- `GET /api/matches/:id/logs`: fetch persisted action logs

Training endpoints:

- `GET /api/training/new-hand`
- `POST /api/training/validate-groups`
- `POST /api/training/auto-group`

Battle endpoints:

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

LLM utility endpoint:

- `POST /api/llm/ping`

## Testing

```bash
npm test
```

The backend test suite covers core rule validation, battle services, battle routes, initial hand retrieval, training validation, and LLM route integration.
