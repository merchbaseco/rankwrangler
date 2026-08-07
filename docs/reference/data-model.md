---
summary: Defines RankWrangler's canonical product identity, persisted observations, source timestamps, history units, facets, search-term snapshots, and operational records.
read_when:
  - changing a Drizzle schema, product response, history metric, facet state, or source timestamp
  - deciding whether new Amazon or Keepa data belongs on Product, in history, or in a separate observation
---

# Data Model

**Migration status:** The owning schema now stores the durable Product listing-resolution timestamp
and nullable `products.is_merch_listing`; generated migration `0032_useful_skrulls.sql` drops the
old default/`NOT NULL` constraint without rewriting existing `false` rows. Apply the Drizzle
migration before deploying this code.

## Canonical identity

A **Product** is one Amazon listing identified by `(marketplaceId, asin)`. Discovery source does
not create a second kind of product: extension sightings, Amazon search results, SP-API sync, and
Keepa enrichment all reconcile into that identity.

An ASIN alone is insufficient because the same ASIN can have marketplace-specific listing state.
ASIN inputs are normalized to uppercase at public boundaries.

## Persistence ownership

| State | Identity | Purpose |
| --- | --- | --- |
| Product | `(marketplaceId, asin)` | Current listing fields plus latest SP-API and Keepa observations. |
| Product facet value | `(facet, name)` | Reusable normalized classification value. |
| Product facet assignment | `(productId, facetValueId)` | Current product-to-facet membership. |
| History import | generated id | One Keepa import attempt, request context, provider accounting, and outcome. |
| History point | `(productId, source, metric, categoryId, keepaMinutes)` | One source observation at one Keepa timestamp. |
| Keepa category | `(marketplaceId, categoryId)` | Display name for a Keepa category id. |
| Top Search Terms dataset | marketplace, period, and report window | Current fetch lifecycle for one Amazon Brand Analytics reporting window. |
| Top Search Terms snapshot | `(datasetId, observedDate)` | One fetched daily observation of a dataset. |
| Search-term row | `(snapshotId, searchTerm)` | Rank and top-three click/conversion shares for one term in one snapshot. |
| Operation | generated id; unique pending `(type, targetKey)` | Durable coordination record and terminal resource or safe error. |
| Catalog query | `(source, marketplaceId, normalizedTerm, page)` | Shared external-search identity, 30-day activity lease, refresh-attempt timestamps, and latest successful-run watermark. |
| Search run | generated id | One immutable successful provider execution, including zero-result runs, with `trigger: requested | automatic`. |
| Search result | `(runId, productId)` | Immutable source position and nullable metrics observed in that run. |
| Activity event | generated id | Searchable record of a product, history, job, or system action. |
| Job execution | generated id | One completed background-job run with input, output, and error state. |
| Access Projection | `(issuer, subject)` | Local Clerk identity projection, access state, stable Merchbase User, source watermark, and tombstone. |
| Service Account | fixed `rankwrangler` service plus stable Merchbase User | One mapped principal with lifetime/daily usage, limit, and reset state. |

The active schema is split by responsibility:

- [`schema.ts`](../../apps/server/src/db/schema.ts) owns products, facets, queues, Keepa history,
  categories, access projections, Service Accounts, and the guarded cutover gate.
- [`top-search-terms-schema.ts`](../../apps/server/src/db/top-search-terms-schema.ts) owns Brand
  Analytics datasets, snapshots, and daily term rows.
- [`ops-schema.ts`](../../apps/server/src/db/ops-schema.ts) owns Operations, activity events, and
  job execution records.

## Operations

Catalog-facing Operation state is `pending` or `completed`. Pending rows have no outcome. Completed
rows have exactly one outcome: a typed resource reference or a sanitized error. Product-history
Operations use the same durable record internally, but public Product-history callers receive
history or a provider-neutral retryable error instead of Operation state. The dashboard app keeps
its existing Operation workflow. Dispatch and worker timestamps support recovery but are never
exposed through the public contract.

Only one pending `productHistoryRefresh` Operation exists per marketplace/ASIN target, and only
one pending `catalogSearch` Operation exists per Catalog query. Product
history, its successful import audit, Product freshness, and successful Operation completion commit
atomically. A schema migration for the Operations table must be generated before deployment.
Catalog-search success similarly commits Products, histories, the Search run/results, query
watermark, and `catalogSearchRun` Operation resource atomically. A product-search request renews
the query activity lease even when a cached run is reused; automatic refresh only considers active
queries and never backfills expired interest.

Catalog run reads never reconstruct observations from Product. Each result returns its retained
`productId`, source-qualified position, immutable `observed` fields, and a separate nullable
`currentProduct`. Missing canonical state therefore does not remove run membership.

## Product observations

The target product row combines current values from distinct providers without erasing provenance:

| Provider | Examples | Freshness fields |
| --- | --- | --- |
| Amazon listing enrichment | title, brand, bullets, thumbnail, first-available date, listing category, BSR, and deterministic Merch evidence/classification | internal `spApiFetchedAt`, `spApiResolvedAt` |
| Keepa | current BSR, new price, monthly sold, BSR averages, sales-rank drops | `keepaFetchedAt`, `keepaSourceUpdatedAt`, `keepaFirstTrackedAt` |
| RankWrangler facet classification | Semantic facet assignments | `facetsState`, `facetsUpdatedAt` |

`fetchedAt` records when RankWrangler fetched data. `sourceUpdatedAt`, where available, records the
provider's data timestamp. They answer different freshness questions and must not be substituted.

Keepa `monthlySold` is a provider observation, not a RankWrangler sales count. A missing provider
value remains `null`; it is not evidence of zero sales.

## Public product shape

The target public Product summary exposes:

- marketplace and ASIN identity;
- listing title, brand, bullets, thumbnail, first-available date, and nullable `isMerchListing`;
- current root-category id, name, and BSR;
- optional Keepa observations and their timestamps;
- `thumbnail: { status: "pending" } | { status: "available", url } | { status: "unavailable" }`;
- one Product-details freshness envelope, `freshness: { stale, updatedAt }`. Provider status is
  not part of the frontend/API DTO.

`isMerchListing` is `true` for known Merch evidence, `false` for available evidence with no known
template match, and `null` when bullet evidence is unavailable or classification has not run.
Public consumers receive only this nullable field; provider, freshness, and status metadata are
not exposed for the property.

`keepa` is `null` until Keepa-backed current observations exist. Price uses integer minor units:
`amountMinor: 1999` with `currencyCode: "USD"` means USD 19.99.

The exact TypeScript contract is [`ProductInfo`](../../apps/server/src/types/index.ts).

## Product history

History points retain source-level observations rather than one daily row. Important fields:

| Field | Meaning |
| --- | --- |
| `source` | Provider that produced the observation; currently Keepa. |
| `metric` | Provider metric such as `bsrMain`, `bsrCategory`, or `priceNew`. |
| `categoryId` | BSR category; `-1` is the sentinel for metrics without a category. |
| `observedAt` | Normal timestamp used by RankWrangler queries. |
| `keepaMinutes` | Original Keepa time coordinate used for idempotent storage. |
| `valueInt` | Integer value: rank for BSR, minor currency units for price. |
| `isMissing` | Provider explicitly represented the value as missing. |

Agent responses project those points into `day`, `week`, or `month` buckets. A bucket is a tuple
`[bucketStartIso, valueOrNull]`; summaries expose first, latest, min, max, count, and boundary
timestamps. `bsr` maps to `bsrMain`; `price` maps to `priceNew`.

## Facet lifecycle

`facetsState` is one of:

| State | Meaning |
| --- | --- |
| `pending` | Product has not completed classification. |
| `ready` | Current facet assignments are available. |
| `error` | The most recent classification attempt failed. |

Allowed facet families are `profession`, `hobby`, `animal`, `food`, `cause`, `identity`,
`culture`, `holiday`, `occasion`, `place`, and `party-theme`.

## Top Search Terms observations

Brand Analytics rows are historical observations, not Products. Each row belongs to one snapshot
and stores the source search-frequency rank, top-three click and conversion share sums in basis
points, source-row count, and RankWrangler's Merch-relevance classification with its reason.

Dates in this subsystem are report and observation dates. They are not interchangeable with
product-fetch timestamps or Keepa observation times.
