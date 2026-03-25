# Contributing

Thanks for contributing to Guandan Training.

Chinese and English issues / pull requests are both welcome.

## Before you start

- For small fixes, direct pull requests are welcome.
- For larger changes, please open an issue first so we can align on scope.
- Keep changes focused. Avoid mixing unrelated refactors, formatting, and feature work in the same PR.

## Development setup

Requirements:

- Node.js `^20.19.0 || >=22.12.0`
- npm 10+

Backend setup:

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

Frontend setup:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:3005`
- Backend: `http://localhost:8005`

## Project structure

- `backend/`: Express + TypeScript + Prisma API
- `frontend/`: Vue 3 + Vite client
- `.github/workflows/ci.yml`: repository CI

## Branches

- Branch from `main`
- Use a short, descriptive branch name such as `fix/cors-headers` or `feat/battle-metrics`

## What to include in a contribution

- Add or update tests when behavior changes
- Update docs when setup, API behavior, or user-visible workflows change
- Keep commits readable and scoped
- Prefer follow-up cleanup in the same PR if the change introduces temporary workarounds

## Testing expectations

Run the relevant checks before opening a PR.

Backend:

```bash
cd backend
npm test
npm run build
```

Frontend:

```bash
cd frontend
npm test
npm run build
```

If you cannot run a check locally, mention that clearly in the PR description.

## Code guidelines

- Preserve the existing repository structure and naming unless there is a clear reason to change it
- Avoid committing local-only files such as `.env`, `dist/`, `node_modules/`, or editor settings
- Prefer small, reviewable changes over large rewrites
- For frontend changes, include screenshots or short recordings when the UI changes materially
- For backend changes, include example requests / responses when API behavior changes materially

## Commits

Use concise, descriptive commit messages. Examples:

- `fix: allow battle custom headers in cors preflight`
- `docs: add contribution guides and issue templates`
- `feat: persist match action logs`

## Pull request checklist

Before requesting review, make sure:

- The branch is up to date with `main`
- Relevant tests pass locally
- Docs were updated if needed
- The PR description explains what changed, why it changed, and how it was verified

## Release notes

Maintainers publish release tags and GitHub Releases. If your PR changes release-facing behavior, add a short release-note summary in the PR body so it is easy to reuse later.
