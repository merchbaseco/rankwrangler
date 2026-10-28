---
summary: Defines RankWrangler's canonical product identity, persisted observations, source timestamps, history units, facets, search-term snapshots, and operational records.
read_when:
  - changing a Drizzle schema, product response, history metric, facet state, or source timestamp
  - deciding whether new Amazon or Keepa data belongs on Product, in history, or in a separate observation
---

# Data Model

**Migration status:** Generated migration `0032_useful_skrulls.sql` stores the durable Product
listing-resolution timestamp and nullable `products.is_merch_listing`. Generated migration
`0034_flowery_winter_soldier.sql` adds short-lived Provider attempts. Generated migration
`0035_numerous_william_stryker.sql` replaces the Product availability boolean with canonical
`active | deleted` Amazon listing status. Apply these migrations before deploying dependent code.
Generated migration `0036_melodic_jack_flag.sql` adds the sparse Product short-name table.

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
| Product short name | `(marketplaceId, asin)` when requested | Nullable generated name, source fingerprint, and claim state; no row for never-requested Products. |
| Product cutout thumbnail | `(marketplaceId, asin)` when requested | R2 object key, source fingerprint, and claim state; no row for never-requested Products. |
| Product facet value | `(facet, name)` | Reusable normalized classification value. |
| Product facet assignment | `(productId, facetValueId)` | Current product-to-facet membership. |
| History import | generated id | One Keepa import attempt, request context, provider accounting, and outcome. |
| History point | `(productId, source, metric, categoryId, keepaMinutes)` | One source observation at one Keepa timestamp. |
| Keepa category | `(marketplaceId, categoryId)` | Display name for a Keepa category id. |
| Search-term row | `(snapshotId, searchTerm)` | Rank and top-three click/conversion shares for one term in one snapshot. |
| Operation | generated id; unique pending `(type, targetKey)` | Durable coordination record and terminal resource or safe error. |
| Catalog query | `(source, marketplaceId, normalizedTerm)` | Term interest, bounded admission, tier, demand evidence, research lease and next check. |
| Keyword membership | `(queryId, productId)` | First and latest observed membership across sources. |
| Exploration pass | generated id, at most one active per query | SP-API continuation, claimed execution, dated depth and stop reason. |
| Discovery attempt | generated id | Durable physical-attempt reservation for SP-API exploration caps. |
| Keepa capacity attempt | generated id | Work class, reserved and actual token cost independent of ingestion success. |
| History admission receipt | rollout key | Atomic baseline time and count of grandfathered Product identities. |
| Search run | generated id | One immutable successful provider execution, including zero-result runs, with `trigger: requested | automatic`. |
| Search result | `(runId, productId)` | Immutable Search-run membership, Product ordinal, and observed metrics. |
| Activity event | generated id | Searchable record of a product, history, job, or system action. |
| Job execution | generated id | One completed background-job run with input, output, and error state. |
| Provider attempt | generated id | One physical Keepa, SP-API, Gemini, or TypeSafe request with typed operation, attempt time, status/error, and latency; retained for seven days. |
| Access Projection | `(issuer, subject)` | Local Clerk identity projection, access state, stable Merchbase User, source watermark, and tombstone. |
| Service Account | fixed `rankwrangler` service plus stable Merchbase User | One mapped principal with lifetime/daily usage, limit, and reset state. |

The active schema is split by responsibility:

- [`schema.ts`](../../apps/server/src/db/schema.ts) owns products, facets, queues, Keepa history,
  categories, access projections, Service Accounts, and the guarded cutover gate.
- [`top-search-terms-schema.ts`](../../apps/server/src/db/top-search-terms-schema.ts) owns Brand
  Analytics datasets, snapshots, and daily term rows.
- [`ops-schema.ts`](../../apps/server/src/db/ops-schema.ts) owns Operations, activity events, and
  job execution records.
- [`provider-telemetry-schema.ts`](../../apps/server/src/db/provider-telemetry-schema.ts) owns
  short-lived raw Provider attempts.
- [`product-short-name-schema.ts`](../../apps/server/src/db/product-short-name-schema.ts) owns
  sparse, requested short-name state.

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
watermark, and `catalogSearchRun` Operation resource atomically. An explicit `keyword.results`
request renews the research lease even when reusing a run. General `product.search` records interest
without extending that lease. Background scheduling uses admitted tiers and persisted due dates.

Catalog run reads never reconstruct observations from Product. Retained membership and placement
remain independent from current canonical Product state. Public keyword-results retrieval waits for every
result's compact current Search projection; dashboard run-history reads may expose unresolved
current state separately.

## Product observations

The target product row combines current values from distinct providers without erasing provenance:

| Provider | Examples | Freshness fields |
| --- | --- | --- |
| Amazon listing enrichment | title, brand, bullets, thumbnail, first-available date, listing category, BSR, deterministic Merch evidence/classification, and `amazonListingStatus` | internal `spApiFetchedAt`, `spApiResolvedAt` |
| Keepa | current BSR, new price, monthly sold, BSR averages, sales-rank drops | `keepaFetchedAt`, `keepaSourceUpdatedAt`, `keepaFirstTrackedAt` |
| RankWrangler facet classification | Semantic facet assignments | `facetsState`, `facetsUpdatedAt` |

`fetchedAt` records when RankWrangler fetched data. `sourceUpdatedAt`, where available, records the
provider's data timestamp. They answer different freshness questions and must not be substituted.

Keepa `monthlySold` is normalized publicly as `boughtInPastMonth`, not a RankWrangler sales count.
A Sales-rank drop is an observed numeric BSR improvement, not a confirmed sale. Missing measurements
remain `null`; they are not evidence of zero.

## Public Product Shape

The following is the accepted public target; persisted provider observations above describe current
storage.

The public Product is one current provider-neutral projection:

- marketplace and ASIN identity;
- `listing`: title, brand, first-available date, a bullet-point array, resolved available/unavailable
  thumbnail, nullable `isMerchListing`, and `amazonListingStatus`;
- `category`: current root-category identity and name;
- `salesRank`: current rank plus `averages.last30Days` and `averages.last90Days`;
- `price`: money in integer minor units with currency code; and
- `demand`: `boughtInPastMonth` plus Sales-rank drops keyed as `last30Days`, `last90Days`,
  `last180Days`, and `last365Days`.

Public callers never receive a pending thumbnail, provider block or timestamps,
`trackingStartedAt`, freshness, status, Operations, or `schemaVersion`.

`isMerchListing` is `true` when the part number matches the Merch design-code fingerprint or a bullet
matches a Merch template, `false` when a part number or bullets were observed without either match,
and `null` when neither was available or classification has not run.
Public consumers receive only this nullable field; provider, freshness, and status metadata are
not exposed for the property.

`listing.amazonListingStatus` is set to `deleted` only when a successful SP-API Catalog response
omits the requested ASIN. Provider failures preserve the prior value, and a later successful
response containing the ASIN sets it to `active`. Active means the marketplace detail-page listing
exists, not that an offer is in stock or buyable. Deleted means Amazon has effectively removed that
listing. Neither transition erases the last accepted listing payload.

Price uses integer minor units: `amountMinor: 1999` with `currencyCode: "USD"` means USD 19.99.
`listing.bulletPoints` is always an array; no bullets is `[]`. Any valid unavailable measurement is
`null`, never zero or failure state.

## Product history

The public projection below is the accepted target. Stored source observations remain current.

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

Public responses project those observations under `series.salesRank` and `series.price`, with the
requested range and a resolved `day`, `week`, or `month` `interval`. A point is
`[periodStart, valueAtPeriodEnd]`. Summaries expose only `first`, `latest`, `min`, and `max` values;
they omit count and duplicate first/latest point dates. The summary object always exists. A current
valid empty series has `points: []` and `null` for all four summary values; an unrequested series is
absent. Price history exposes `unit: "minorCurrency"`, `currencyCode`, points, and summary without a
public scale field.

## Public Product Search

Public Search returns `keyword`, `searchedAt`, and source-ordered `results`. Each result contains
`organicSearchPlacement` plus a compact `product` with identity, title, brand, resolved thumbnail,
nullable Merch classification, category, current sales rank, price, and bought-in-the-past-month
evidence. It omits bullets, rank averages and drop windows, full demand, history, provider metadata,
and freshness. Invalid or duplicate provider results preserve ordinal gaps. Search-run membership
and placement are immutable; projected Product fields remain independent current state.

## Facet lifecycle

`facetsState` is one of:

| State | Meaning |
| --- | --- |
| `pending` | Product has not completed classification. |
| `ready` | Current facet assignments are available. |
| `error` | The most recent classification attempt failed. |

Allowed facet families are `profession`, `hobby`, `animal`, `food`, `cause`, `identity`,
`culture`, `holiday`, `occasion`, `place`, and `party-theme`.


## Keyword collection

Canonical queries and discovery targets own tracked/trial/dormant status, first-page BSR standing,
intervals and next checks; discovery evidence records each source (`interest`, `brandAnalytics`,
`autocomplete`, `themeAutocomplete`, and historical `adsRecommendation`). Autocomplete owns a fenced
once-per-seed ledger with its saved suggestions; keyword themes own their own once-per-theme
expansion state. Keyword activity shares the event log with Products and jobs.

| Record | Identity | Meaning |
| --- | --- | --- |
| Brand Analytics search term | `(marketplaceId, normalizedTerm)` | Latest kept weekly search term: search frequency rank, apparel clicks (0–3), whether the text names a Merch product (at least one of the two holds), its keyword theme, up to three clicked ASINs, first and last seen Sunday week, and trial registration time. No weekly history. |
| Keyword theme | generated id, unique `(marketplaceId, theme)` | A theme of a tracked keyword (its search text without the Merch product and filler words), the keyword it first came from, and its once-per-theme autocomplete expansion: stage (`pending`, `complete`), saved suggestions, trial count, claim, due time and failure count. |
| Brand Analytics import | generated id, unique `(marketplaceId, weekStart)` | One weekly report's state (`pending`, `requested`, `ready`, `imported`, `superseded`), report and document ids, Amazon status, retry and claim fields, and row/term/kept/new counts. |

Per-product Ads keyword mining, its candidate judgments and links were removed with the move to
Brand Analytics sources.
