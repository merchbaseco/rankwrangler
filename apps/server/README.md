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

- `api.app.searchterms.list` - paginated Search Terms rows from DB snapshots.
- `api.app.searchterms.status` - fetch lifecycle status for a Search Terms window.
- `api.app.searchterms.refresh` - enqueues a pg-boss fetch job for the requested window.
- `api.app.searchterms.trend` - historical trend points and 1d/7d/30d deltas for one term.
- `api.app.amazon.search` - generic Amazon keyword search (Catalog Items API) that also enqueues
  returned ASINs for background product sync.
- `api.app.amazon.product.search` - product lookup by ASIN in the `amazon.product` namespace.
- `api.app.loadProductHistory` - now ensures product cache exists before triggering manual Keepa
  history sync.

Search Terms ingest notes:

- BA Top Search Terms ingestion requires apparel intent in Top Clicked Category `#1` or `#2`.
- Commodity/style terms (for example `100% cotton`, `button down`, `dress shirt`) are filtered out.
- Brand/IP seeded terms (for example `nike`, `gildan`, `seahawks`) are filtered out.
- Short generic apparel-only terms (for example `hoodie`, `mens sweatshirt`) are filtered out.
- Short color+gender generic apparel terms (for example `black hoodie men`) are filtered out.
- Additional product-type signals are recognized (for example `raglan`, `v neck`, `tote bag`).
- Open-period refresh timing is SLA-aligned and targets Pacific `03:00` slots after BA data
  availability windows (72h for non-Saturday daily, 48h for Saturday daily and weekly periods).
