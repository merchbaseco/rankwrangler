# RankWrangler Server

Fastify/tRPC server for RankWrangler's canonical Product catalog, source ingestion, history,
background jobs, and dashboard/public API surfaces.

Run from the repository root:

```bash
bun run server:dev
bun run server:build
```

Local development disables workers by default. Use `bun run server:dev:jobs` only when the task
needs schedules or background execution.

Documentation:

- [Architecture](../../docs/internals/architecture.md)
- [Product ingestion](../../docs/internals/product-ingestion.md)
- [Authentication](../../docs/internals/authentication.md)
- [Realtime events](../../docs/internals/realtime-events.md)
- [Background jobs](../../docs/internals/background-jobs.md)
- [Development](../../docs/operations/development.md)
- [Public API](../../docs/reference/public-api.md)
