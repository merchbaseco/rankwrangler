# @rankwrangler/cli

Official agent-oriented CLI for RankWrangler.

```bash
npm install -g @rankwrangler/cli

rw auth set ak_...
rw product get B0DV53VS61
rw product get B0DV53VS61 --shortName
rw product search "retro gardening shirt" --maxBsr 300000
rw product history B0DV53VS61 --bucket week
rw keyword get "retro gardening shirt"
rw keyword list "retro gardening"
```

The public command surface is Product `get/search/history`, keyword `get/list`, auth, config,
version, and changelog. Product search reads the collected database, matches titles, and supports
filters, sorting (default `estimatedMonthlySalesDesc`), and cursor pagination. It never waits to
collect a new term. Every read uses
server-owned freshness policy, and unknown options fail with `INVALID_INPUT`.
Output is a JSON `{ ok, data }` envelope; failures use `{ ok: false, error }` on stderr.
The CLI does not expose Catalog, Operation, provider status, or polling commands.
`--shortName` adds a nullable image-informed `listing.shortName` to a single Product get, waiting
up to 20 seconds for generation and returning `null` if it is still running.

See the [CLI reference](../../docs/reference/cli.md) for options and release workflow.
