# Changelog

## [1.0.0] - 2026-03-25

Initial public release of the Guandan Training system.

### Added

- Monorepo structure with separate `backend/` and `frontend/` applications
- Least-moves hand grouping training and group legality validation
- Human-vs-AI battle mode
- Full AI battle spectating mode
- Battle timeline playback, recent-session recovery, and persisted battle history
- LLM connectivity testing and runtime strategy/personality tuning

### Changed

- Unified frontend package version to `1.0.0`
- Expanded release documentation for root, backend, and frontend setup

### Fixed

- Completed persisted match action log endpoint: `GET /api/matches/:id/logs`
- Fixed CORS allow-list coverage for battle and seat-personality request headers
