---
summary: Defines RankWrangler CLI commands, authentication, configuration precedence, product-history flags, JSON envelopes, and exit behavior.
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
rw auth set rrk_...
rw auth status
```

For non-interactive secret entry:

```bash
printf %s "$RR_LICENSE_KEY" | rw auth set --stdin
```

License-key resolution order is:

1. `RR_LICENSE_KEY` environment override;
2. key stored in the platform secure store;
3. `MISSING_CONFIG` failure.

`rw auth set` stores secrets in the platform credential store, not the JSON config file.
`rw auth clear` removes the stored key. `auth status` reports the active source and backend without
printing the secret.

## Commands

| Command | Result |
| --- | --- |
| `rw products get <ASIN>` | Product summary plus compact bucketed history. |
| `rw products summary <ASIN>` | Product summary without importing Keepa history. |
| `rw products history <ASIN>` | Compact bucketed history without the product summary. |
| `rw operations get <operationId>` | Poll one durable Operation without starting work. |
| `rw license status` | License email, usage, and limit. |
| `rw license validate` | Validate the active license and return its current usage. |
| `rw auth status|set|clear` | Inspect or update secure-store authentication. |
| `rw config show|get|set|unset|reset` | Inspect or update non-secret local configuration. |
| `rw --version` | Installed version as plain text. |
| `rw changelog` | Latest bundled release entry as plain text. |

One product command accepts exactly one ASIN. ASINs may come from the positional argument,
`--asin`, `RR_ASIN`, or `RR_ASINS`; resolving more than one is an error.

## Product history options

```bash
rw products get B0DV53VS61 --metrics bsr,price --bucket week --days 365
rw products history B0DV53VS61 \
  --metrics bsr \
  --startAt 2025-01-01 \
  --endAt 2025-12-31 \
  --bucket month
```

| Option | Values and default |
| --- | --- |
| `--metrics <list>` | Comma-separated `bsr,price`; default both. |
| `--bucket <unit>` | `auto`, `day`, `week`, or `month`; default `auto`. |
| `--days <N>` | 30–3650; default 365. Cannot be combined explicitly with range bounds. |
| `--startAt <ISO>` | Optional range start. |
| `--endAt <ISO>` | Optional range end. |
| `--limit <N>` | Internal point cap, 1–10,000; default 5,000. |
| `-m, --marketplace <id>` | Marketplace override. |
| `--baseUrl <origin>` | API-origin override. A trailing `/api` is normalized away. |

`bsr` maps to Keepa `bsrMain`; `price` maps to `priceNew`. The CLI returns bucket tuples and
summaries, never the raw point series.

When `status` is `collecting`, the response includes `operation.id` and
`retryAfterSeconds`. Poll it with:

```bash
rw operations get 11111111-1111-4111-8111-111111111111
```

A completed Operation contains either `resource.type: "productHistory"` with marketplace/ASIN
identity or a sanitized `error`. Read Product history again after successful completion.

`auto` uses day buckets through 45 days, week buckets through 18 months, and month buckets after
that. Price values are minor currency units; consult the response's `currencyCode` and
`valueScale`.

## Configuration and precedence

Supported config keys:

- `base-url`
- `marketplace`
- `storage-dir`

The active config is `<storage-dir>/config.json`. The default storage directory is
`~/.rankwrangler`; `~/.rankwrangler/global.json` stores only the pointer to a custom storage
directory.

| Setting | Resolution order |
| --- | --- |
| License key | `RR_LICENSE_KEY`, secure store |
| API origin | `--baseUrl`, saved `base-url`, `RR_API_URL`, production origin |
| Marketplace | `--marketplace`, saved `marketplace`, `RR_MARKETPLACE_ID`, US marketplace |
| Storage directory | `RR_STORAGE_DIR`, saved global pointer, `~/.rankwrangler` |
| History metrics | `--metrics`, `RR_HISTORY_METRICS`, `bsr,price` |

`config set storage-dir` makes the target directory active and copies missing non-secret settings
from the current config. `config unset storage-dir` returns to the default directory. `config
reset` removes non-secret config and the global pointer; it does not clear secure-store auth.

## Machine-readable output

API, auth, and config commands write one pretty-printed JSON envelope.

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Failure is written to stderr and exits with status 1:

```json
{
  "ok": false,
  "error": {
    "code": "MISSING_CONFIG",
    "message": "license key is required"
  }
}
```

`error.details` is included when additional structured context exists. Help, version, and
changelog output are intentionally plain text.

The executable command dispatcher is [`packages/cli/src/index.ts`](../../packages/cli/src/index.ts).
