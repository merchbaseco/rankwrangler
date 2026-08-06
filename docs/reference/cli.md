---
summary: Defines final RankWrangler CLI commands, authentication, configuration, refresh flags, JSON envelopes, and exit behavior.
read_when:
  - invoking RankWrangler from an agent, shell script, or CI job
  - changing a CLI command, flag, environment variable, configuration key, or output envelope
---

# CLI

The `rw` CLI is the agent-oriented interface to the public API. `rankwrangler` is an equivalent
binary alias.

## Install and authenticate

```bash
npm install -g @rankwrangler/cli
rw auth set ak_...
rw auth status
```

For non-interactive secret entry:

```bash
printf %s "$MERCHBASE_API_KEY" | rw auth set --stdin
```

API-key resolution order is the `MERCHBASE_API_KEY` environment override, platform secure store,
then `MISSING_CONFIG`. Auth commands never print the secret.

## Commands

| Command | Result |
| --- | --- |
| `rw product get <ASIN>` | Product summary plus compact bucketed history. |
| `rw product search <keyword>` | Completed Product search data and freshness. |
| `rw product history <ASIN>` | Compact bucketed Product history. |
| `rw keyword get <keyword>` | Current keyword evidence. |
| `rw keyword search <text>` | Filtered keyword evidence. |
| `rw keyword history <keyword>` | Keyword evidence over time. |
| `rw auth status\|set\|clear` | Inspect or update secure-store authentication. |
| `rw config show\|get\|set\|unset\|reset` | Inspect or update non-secret local configuration. |
| `rw --version` | Installed version as plain text. |
| `rw changelog` | Latest bundled release entry as plain text. |

Catalog, Operation, plural `products`, summary, and polling commands are not part of the CLI.

## Options

All Product and keyword retrieval commands accept `--refresh` to request fresh data under the
server-owned retrieval policy. Common options are `--baseUrl`, `--marketplace`, and `--limit`.

Product history options:

```bash
rw product get B0DV53VS61 --refresh --metrics bsr,price --bucket week --days 365
rw product history B0DV53VS61 --metrics bsr --startAt 2025-01-01 --endAt 2025-12-31
```

| Option | Values and default |
| --- | --- |
| `--metrics <list>` | `bsr,price`; default both. |
| `--bucket <unit>` | `auto`, `day`, `week`, `month`; default `auto`. |
| `--days <N>` | 30–3650; default 365. Cannot combine with explicit range bounds. |
| `--rangeDays <N>` | Keyword history range, 7–365; default 90. |
| `--startAt <ISO>` / `--endAt <ISO>` | Product history range bounds. |
| `--limit <N>` | Product history max 10,000; keyword search max 100. |
| `--cursor <N>` | Keyword search offset; default 0. |
| `-m, --marketplace <id>` | Marketplace override; Product defaults to US. |
| `--baseUrl <origin>` | API-origin override; `/api` is normalized away. |

The CLI returns compact agent history buckets and summaries, never raw point series. History
responses include `freshness: { stale, updatedAt }`; no command exposes Operation identifiers,
provider status, or polling state. Missing data is `NOT_FOUND`; temporary capacity/deadline
failures are retryable `TIMEOUT` errors with a retry hint.

## Configuration and precedence

Supported config keys are `base-url`, `marketplace`, and `storage-dir`. The active config is
`<storage-dir>/config.json`; the default is `~/.rankwrangler`.

| Setting | Resolution order |
| --- | --- |
| Merchbase API key | `MERCHBASE_API_KEY`, secure store |
| API origin | `--baseUrl`, saved `base-url`, `RR_API_URL`, production origin |
| Marketplace | `--marketplace`, saved `marketplace`, `RR_MARKETPLACE_ID`, US marketplace |
| Storage directory | `RR_STORAGE_DIR`, saved global pointer, `~/.rankwrangler` |
| History metrics | `--metrics`, `RR_HISTORY_METRICS`, `bsr,price` |

## Machine-readable output

API, auth, and config commands write one JSON envelope:

```json
{ "ok": true, "data": {} }
```

Failures go to stderr and exit with status 1:

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Product not found" } }
```

Help, version, and changelog output are plain text. The dispatcher is
[`packages/cli/src/index.ts`](../../packages/cli/src/index.ts).
