# @rankwrangler/cli

Official agent-oriented CLI for RankWrangler.

```bash
npm install -g @rankwrangler/cli

rw auth set ak_...
rw product get B0DV53VS61
rw product search "retro gardening shirt"
rw product history B0DV53VS61 --refresh --bucket week
rw keyword get "retro gardening shirt"
rw keyword search "retro gardening"
rw keyword history "retro gardening shirt" --rangeDays 90
```

The final public command surface is Product `get/search/history`, keyword `get/search/history`,
auth, config, version, and changelog. Product and keyword retrieval commands accept `--refresh`.
Output is a JSON `{ ok, data }` envelope; failures use `{ ok: false, error }` on stderr. The CLI
does not expose Catalog, Operation, provider status, or polling commands.

See the [CLI reference](../../docs/reference/cli.md) for options and release workflow.
