---
summary: Defines RankWrangler CLI commands, authentication, caller-synchronous retrieval, JSON envelopes, and exit behavior.
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
rw auth set --stdin
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
| `rw product search [text]` | Filtered, paginated Products from the collected database. |
| `rw product history <ASIN>` | Compact bucketed Product history. |
| `rw keyword get <keyword>` | One keyword directory entry. |
| `rw keyword list <term>` | Keyword directory entries filtered by term. |
| `rw auth status\|set\|clear` | Inspect or update secure-store authentication. |
| `rw config show\|get\|set\|unset\|reset` | Inspect or update non-secret local configuration. |
| `rw --version` | Installed version as plain text. |
| `rw changelog` | Latest bundled release entry as plain text. |

Catalog, Operation, plural `products`, summary, and polling commands are not part of the CLI.

## Options

Public freshness policy is server-owned; no command accepts `--refresh`. Common options are
`--baseUrl`, `--marketplace`, and `--limit`. An unknown or removed option fails with an
`INVALID_INPUT` JSON envelope.

Product history options:

```bash
rw product get B0DV53VS61
rw product get B0DV53VS61 --shortName
rw product get B0DV53VS61 B012345678
rw product history B0DV53VS61 --metrics salesRank,price --bucket week --days 365
```

`product get` routes one ASIN to the full Product retrieval contract. With 2–200 unique ASINs it
sends one `{ marketplaceId, asin }` pair per ASIN to the basic Product batch and returns a
fixed-shape array in argument order. Each result contains identity, nullable title, nullable
`imageUrl`, and `amazonListingStatus: active | deleted`. Active means the detail-page listing
exists, not that an offer is in stock or buyable. Deleted means Amazon has effectively removed the
listing from that marketplace. Retained title or image values are last-known data; a null
`imageUrl` alone means no usable image. Every ASIN uses the marketplace resolved from
`--marketplace`, saved configuration, or the normal US default.
For one ASIN, `--shortName` requests an image-informed `listing.shortName` while retaining the full
Product response. It is nullable and applies only to known Merch listings with available images.
The command waits up to 20 seconds for generation; a name still generating at that deadline, or
whose generation just failed, prints as `null` instead of a `TIMEOUT`, and a later call returns it.
With several ASINs, `--shortName` fails with `INVALID_INPUT`; request each ASIN separately.

| Option | Values and default |
| --- | --- |
| `--metrics <list>` | `salesRank,price`; default both; Product history only. |
| `--shortName` | Include an image-informed short name; single Product get only. |
| `--bucket <unit>` | `auto`, `day`, `week`, `month`; default `auto`. |
| `--days <N>` | 30–3650; default 365. Cannot combine with explicit range bounds. |
| `--startAt <ISO>` / `--endAt <ISO>` | Product history range bounds. |
| `--limit <N>` | Product search 1–100, default 50; Product history max 10,000; keyword list 1–100, default 25. |
| `--cursor <value>` | Product search opaque cursor from `nextCursor`; keyword list JSON `nextCursor`. |
| `--stage <value>` | Keyword list: `graduated` (default), `trial`, `dropped`, `untracked`, `all`. |
| `--freshness <value>` | Keyword list: `all` (default), `live`, `needsSync`, `syncing`. |
| `-m, --marketplace <id>` | Marketplace override; Product defaults to US. |
| `--baseUrl <origin>` | API-origin override; `/api` is normalized away. |

Product search reads the collected database, including when no text is supplied, and returns flat
Product items and `nextCursor`. Defaults are US marketplace, known Merch listings, active listings,
hidden known official brands, and `estimatedMonthlySalesDesc` order. Unknown official-brand status
remains visible. Text matches every term in the title. Search never collects a new term; the
[live fallback](mcp.md#live-fallback) belongs to the MCP Product tool.

```bash
rw product search fishing --maxBsr 300000 --availableAfter 2026-09-01 --sort firstAvailableAtDesc
rw product search --sort salesRankAsc --limit 50
rw keyword list "fishing shirt" --stage all
```

Product search options:

| Option | Values and default |
| --- | --- |
| `--excludeWord <word>` | Exclude a title word; repeat for several words. |
| `--brand <name>` / `--excludeBrand <name>` | Exact brand filters; repeat for several brands. |
| `--includeOfficialBrands` | Include brands in the official-brand registry. |
| `--merch <value>` | `true`, `false`, or `all`; default `true`. |
| `--listingStatus <value>` | `active`, `deleted`, or `all`; default `active`. |
| `--categoryId <N>` | Category ID; repeat for several categories. |
| `--facet <facet=name>` | Facet filter; repeat for several facets. |
| `--minBsr <N>` / `--maxBsr <N>` | Inclusive current sales-rank bounds. |
| `--minPrice <N>` / `--maxPrice <N>` | Inclusive price bounds in minor currency units. |
| `--minBoughtInPastMonth <N>` / `--maxBoughtInPastMonth <N>` | Inclusive bounds on Amazon's bought-in-past-month badge. |
| `--availableAfter <ISO>` / `--availableBefore <ISO>` | First-available date bounds. |
| `--discoveredAfter <ISO>` / `--discoveredBefore <ISO>` | Discovery date bounds. |
| `--updatedAfter <ISO>` / `--updatedBefore <ISO>` | Product update date bounds. |
| `--sort <order>` | `relevance`, `salesRankAsc`, `salesRankDesc`, `firstAvailableAtAsc`, `firstAvailableAtDesc`, `discoveredAtDesc`, `updatedAtAsc`, `updatedAtDesc`, `priceAsc`, `priceDesc`, `boughtInPastMonthDesc`, or `estimatedMonthlySalesDesc`; default `estimatedMonthlySalesDesc`. |

Product history reports its resolved range `interval`. Requested series always contain a summary;
empty series return `points: []` with `first`, `latest`, `min`, and `max` all `null`. Price history
has minor-currency unit and currency code, without a scale field.

Product search returns the current database view. Other data commands return policy-current final data or fail. Missing or policy-expired data may
wait while durable work runs, except that `product get` returns a known Product's last-known listing
immediately and refreshes it in the background. No command exposes pending Product data, freshness, Operations,
provider metadata, or polling state. Product output carries `isMerchListing: true | false`; a
Product no provider has described yet is `false`. Missing data is `NOT_FOUND`; retryable provider
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

Keyword get/list read the stored keyword directory. Keyword list returns graduated keywords
unless `--stage` selects trials, dropped, untracked or all; `--freshness` narrows by data freshness.
Keyword list `--cursor` accepts the JSON `nextCursor` object returned by the previous result. Brand
Analytics inputs and history are removed. For the Products in a niche, run `rw product search` with
the same term.
