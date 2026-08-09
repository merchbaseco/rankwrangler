---
summary: Defines RankWrangler CLI commands, authentication, caller-synchronous retrieval, JSON envelopes, and exit behavior.
read_when:
  - invoking RankWrangler from an agent, shell script, or CI job
  - changing a CLI command, flag, environment variable, configuration key, or output envelope
---

# CLI

**Status:** Authentication, configuration, and command families are shipped. Retrieval options and
data shapes below are the accepted public target.

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
| `rw product get <ASIN...>` | One full Product, or basic results when given 2–200 ASINs. |
| `rw product search <keyword>` | Keyword, search time, and compact Product results with placement. |
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

Public freshness policy is server-owned for Product `get/history` and keyword reads; those
commands accept no `--refresh`. Product Search retains its separate search contract. Common options
are `--baseUrl`, `--marketplace`, and `--limit`.

Product history options:

```bash
rw product get B0DV53VS61
rw product get B0DV53VS61 B012345678
rw product history B0DV53VS61 --metrics salesRank,price --bucket week --days 365
```

`product get` routes one ASIN to the full Product retrieval contract. With 2–200 unique ASINs it
routes to the basic Product batch and returns a fixed-shape array in argument order. Each result
contains identity, nullable title, resolved thumbnail, and `isUnavailable`. A true value means the
Amazon listing is effectively deleted and unavailable for customers to purchase in that
marketplace. Retained title or thumbnail values are last-known data; an unavailable thumbnail alone
means no usable image. Every ASIN uses the marketplace resolved from `--marketplace`, saved
configuration, or the normal US default.

| Option | Values and default |
| --- | --- |
| `--metrics <list>` | `salesRank,price`; default both; Product history only. |
| `--bucket <unit>` | `auto`, `day`, `week`, `month`; default `auto`. |
| `--days <N>` | 30–3650; default 365. Cannot combine with explicit range bounds. |
| `--rangeDays <N>` | Keyword history range, 7–365; default 90. |
| `--startAt <ISO>` / `--endAt <ISO>` | Product history range bounds. |
| `--limit <N>` | Product history max 10,000; keyword search max 100. |
| `--cursor <N>` | Keyword search offset; default 0. |
| `--refresh` | Product Search only; requests a replacement Search run. |
| `-m, --marketplace <id>` | Marketplace override; Product defaults to US. |
| `--baseUrl <origin>` | API-origin override; `/api` is normalized away. |

Product Search returns the public compact projection: placement plus identity, title, brand,
resolved thumbnail, classification, category, current sales rank, price, and
bought-in-the-past-month evidence. It does not return full Products.

Product history reports its resolved range `interval`. Requested series always contain a summary;
empty series return `points: []` with `first`, `latest`, `min`, and `max` all `null`. Price history
has minor-currency unit and currency code, without a scale field.

Each data command returns policy-current final data or fails. Missing or policy-expired data may
wait while durable work runs. No command exposes stale/pending Product data, freshness, Operations,
provider metadata, or polling state. Product output preserves `isMerchListing: true | false | null`;
missing classification is `null`, not `false`. Missing data is `NOT_FOUND`; retryable provider
failure or deadline exhaustion is `TIMEOUT` with a retry hint.

## Configuration and precedence

Supported config keys are `base-url`, `marketplace`, and `storage-dir`. The active config is
`<storage-dir>/config.json`; the default is `~/.rankwrangler`.

| Setting | Resolution order |
| --- | --- |
| Merchbase API key | `MERCHBASE_API_KEY`, secure store |
| API origin | `--baseUrl`, saved `base-url`, `RR_API_URL`, production origin |
| Marketplace | `--marketplace`, saved `marketplace`, `RR_MARKETPLACE_ID`, US marketplace |
| Storage directory | `RR_STORAGE_DIR`, saved global pointer, `~/.rankwrangler` |
| History metrics | `--metrics`, `RR_HISTORY_METRICS`, `salesRank,price` |

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
