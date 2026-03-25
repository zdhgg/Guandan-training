# Guandan Training

Guandan Training is a monorepo for a Guandan practice system with a TypeScript backend and a Vue 3 frontend.

The current `1.0.0` scope focuses on:

- Least-moves hand grouping training and legality validation
- Human-vs-AI battle mode
- Full AI battle spectating mode
- Battle timeline replay and recent session recovery
- LLM connectivity testing, seat personalities, and strategy tuning

## Repository layout

```text
guandan-training/
|- backend/   # Express + TypeScript + Prisma API
|- frontend/  # Vue 3 + Vite client
|- CHANGELOG.md
`- README.md
```

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- npm 10+

The frontend uses Vite 7, so Node 20.19+ is the safe baseline for the whole repository.

## Quick start

1. Prepare the backend

   Copy `backend/.env.example` to `backend/.env`, then adjust the values you need.

   ```bash
   cd backend
   npm install
   npx prisma migrate deploy
   npm run dev
   ```

2. Prepare the frontend in a second terminal

   Copy `frontend/.env.example` to `frontend/.env` if you need to override defaults.

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open the app

- Frontend: `http://localhost:3005`
- Backend health check: `http://localhost:8005/health`

## Validation status

The current codebase has been checked with:

- `backend`: `npm test`, `npm run build`
- `frontend`: `npm test`, `npm run build`

## Backend overview

The backend exposes:

- Match creation, initial-hand lookup, play submission, and action logs
- Training APIs for new hands, legality validation, and auto grouping
- Battle APIs for start, play, stream play, AI advance, next round, tribute flow, metrics, and session recovery
- LLM connectivity ping and runtime header overrides

See [backend/README.md](backend/README.md) for backend setup details.

## Frontend overview

The frontend includes:

- Lobby and mode selection
- Battle table with timeline review
- Least-moves training workflow
- Rules page
- LLM and persona settings panel

See [frontend/README.md](frontend/README.md) for frontend details.
