---
summary: Defines the local replay of Factory's recorded MCP bursts that measures how long agents wait on RankWrangler.
read_when:
  - a change may affect MCP latency for agents, keyword results, Keepa pacing, or catalog-search workers
  - measuring before/after wall time for agent bursts without touching production
---

# Agent Latency Replay

`apps/server/src/scripts/latency-replay/run.sh` boots a development server with job workers, replays
Factory's recorded RankWrangler MCP calls against it burst by burst, and prints per-operation and
per-burst wall time. It never targets production: the client refuses non-loopback servers, and the
server is preloaded with `upstream-stub.ts`, which answers Keepa `token` and `search` after a
calibrated delay and fails every other non-loopback host closed, so no provider key is spent.

```bash
RW_REPLAY_DB_PORT=5433 apps/server/src/scripts/latency-replay/run.sh \
  --client parallel --lanes 4 --out /tmp/replay.json
```

| Option | Meaning |
| --- | --- |
| `--client factory` | Factory's runner today: a fresh MCP client per call, one call at a time per factory. |
| `--client parallel` | Each burst at its recorded launch offsets, all calls in flight together. |
| `--lanes N` | Bursts replayed side by side; keep it fixed when comparing runs. |
| `--term-prefix P` | Keyword-results terms become `P <term>`; the default is unique per run, so a run starts cold. |
| `--only OP`, `--limit N` | Replay only bursts containing an operation, or the first N bursts. |
| `RW_REPLAY_AGE_TERM_PREFIX=P` | Before replaying, age stored runs for prefix `P` past the 24h window, as a backfill leaves them. |
| `RW_REPLAY_KEEPA_SEARCH_MS` | Keepa search latency of the stand-in (default 14000; use 4000 with a database RTT). |
| `RW_REPLAY_DB_RTT_MS` | Round trip added to every database statement through a local TCP proxy (default 0). |
| `RW_REPLAY_SPAPI_CATALOG_MS` | SP-API Catalog search latency of the stand-in, answered through the SDK (default 700). |
| `RW_REPLAY_NEW_PRODUCT_SHARE` | Share of a search's results RankWrangler has never resolved (default 1). |

The dataset is `calls.jsonl` from Factory's handoff (`RW_REPLAY_DATASET`, default
`~/.factory/handoff/rankwrangler-latency/calls.jsonl`). Recorded ASINs map onto fresh local Products,
so the database needs `bun run db:seed:dev` within the last day.

## Calibration

Production holds Keepa about 4s for an interactive search and answers a live `keyword results` in
about 16s; the rest is saving the run and SP-API enrichment of new result Products against a remote
database. `RW_REPLAY_KEEPA_SEARCH_MS=4000 RW_REPLAY_DB_RTT_MS=20` reproduces that: a lone live call
takes 5.0s at 0ms and 15.6s at 20ms, so it makes about 530 sequential database round trips. Without
a database RTT, the 14s Keepa default folds all of that into Keepa time instead. With
`--client factory` the replay reproduces the recorded total burst wall time to within about 10%.

## Reading results

Compare `bursts … wall total` between runs: it is the time agents spend blocked on RankWrangler.
The stand-in logs `keepa.search start inFlight=N` to the server log (`$TMPDIR/latency-replay-server-<port>.log`),
which shows how many live searches RankWrangler lets run at once.
