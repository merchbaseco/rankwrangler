# RankWrangler Server

Server documentation index:

- `docs/server/index.md`

Key sections:

- Runtime + local dev: `docs/server/runtime-and-local-dev.md`
- Auth + API surfaces: `docs/server/auth-and-surfaces.md`
- API examples: `docs/server/api-examples.md`
- Jobs + events: `docs/server/jobs-and-events.md`
- Keepa + history behavior: `docs/server/keepa-history-behavior.md`
- Database + deployment: `docs/server/database-and-deployment.md`

Recent app API additions:

- `api.app.searchTermsList` - paginated Search Terms rows from DB snapshots.
- `api.app.searchTermsStatus` - fetch lifecycle status for a Search Terms window.
- `api.app.searchTermsRefresh` - enqueues a pg-boss fetch job for the requested window (deduplicated while in progress).
