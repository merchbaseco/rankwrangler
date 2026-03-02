# RankWrangler Server

Server documentation index:

- `docs/server/index.md`

Key sections:

- Runtime + local dev: `docs/server/runtime-and-local-dev.md`
- Auth + API surfaces: `docs/server/auth-and-surfaces.md`
- API examples: `docs/server/api-examples.md`
- Jobs + events: `docs/server/jobs-and-events.md`
- BA Top Search Terms purpose: `docs/server/ba-top-search-terms-purpose.md`
- Keepa + history behavior: `docs/server/keepa-history-behavior.md`
- Database + deployment: `docs/server/database-and-deployment.md`

Recent app API additions:

- `api.app.searchTermsList` - paginated Search Terms rows from DB snapshots.
- `api.app.searchTermsStatus` - fetch lifecycle status for a Search Terms window.
- `api.app.searchTermsRefresh` - enqueues a pg-boss fetch job for the requested window (deduplicated while in progress).

Search Terms ingest notes:

- BA Top Search Terms ingestion requires apparel intent in Top Clicked Category `#1` or `#2`.
- Commodity/style terms (for example `100% cotton`, `button down`, `dress shirt`) are filtered out.
- Brand/IP seeded terms (for example `nike`, `gildan`, `seahawks`) are filtered out.
- Short generic apparel-only terms (for example `hoodie`, `mens sweatshirt`) are filtered out.
- Short color+gender generic apparel terms (for example `black hoodie men`) are filtered out.
- Additional product-type signals are recognized (for example `raglan`, `v neck`, `tote bag`).
