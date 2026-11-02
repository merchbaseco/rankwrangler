---
summary: Defines canonical Product identity, current source-attributed state, freshness, and stored-catalog lookup behavior.
read_when:
  - changing Product schema, current metrics, freshness fields, or catalog filtering
  - deciding whether provider results should update a Product or create another record
---

# Product Catalog

**Status:** Canonical Product behavior, split SP-API/Keepa freshness, and current Keepa metrics are
implemented. The generated Product-schema migration must be applied before deployment.

The Product catalog is RankWrangler's canonical current-state store. One Product is identified by
`marketplaceId + asin`, regardless of whether it was discovered by the extension, an ASIN lookup,
an Amazon keyword search, or Keepa.

## Variation Families

A Product is a variation family. Amazon gives every size and color its own ASIN, but all variants of
a listing share the parent's sales rank (checked across clothing, phone cases, PopSockets, mugs,
tumblers, yoga mats, pillow covers and backpacks), so RankWrangler stores one Product per parent:

- `asin` is the family ASIN: the variation parent, or the listing itself when it has no variants.
- `product_asin_aliases` maps each variant ASIN seen to its family. Lookups (API, MCP, extension)
  and keyword scans resolve a variant through it with no provider call; a known variant never gets
  a row, a refresh or a Keepa request of its own.
- Every SP-API Catalog call asks for `relationships`. A variant observation is written under its
  parent: its rank and Merch evidence apply, but its title (which names the size and color) only
  fills gaps, and a family first met through a variant queues the parent for an SP-API fetch so its
  own title replaces it. SP-API refreshes ask for the parent ASIN.
- `representativeAsin` is one variant of the family. Keepa is asked through it, because Keepa
  answers a parent with rank history only; a buyable variant also carries price and monthly sales.
  One Keepa token covers the family.
- When an observation reveals that two stored rows are one family (rows stored before variations
  were known), the row Keepa has tracked longest survives, the other row's keyword memberships,
  search results, history series, facets, short name and cutout move to it, and it takes the
  parent ASIN. `variationsCheckedAt` records the last SP-API answer; `backfill-product-variations`
  re-reads unchecked Products at background priority (100 a minute) until none remain.

## Current State

The persisted Product model combines normalized fields with explicit source boundaries:

- listing identity, title, brand, image, first-available date, seller-bullet array, and nullable
  Merch-listing knowledge;
- explicit Amazon listing status from successful SP-API Catalog responses;
- current root-category BSR;
- semantic facets and their classification state;
- internal provider freshness and resolution markers for listing enrichment;
- a source-attributed `keepa` section with Keepa current metrics and freshness.

Keepa state includes current BSR and new price, Amazon's `monthlySold` search-result signal, 30- and
90-day average BSR, rank-drop counts, Keepa tracking/update timestamps, and `fetchedAt`. Nullable
source values remain nullable; they are not converted into inferred metrics.

## Freshness

Freshness is source-specific:

| Field | Meaning |
| --- | --- |
| `spApiFetchedAt` | RankWrangler accepted the latest SP-API Product payload at this time. |
| `spApiResolvedAt` | RankWrangler completed a listing lookup, including an empty response, at this time. |
| `keepaFetchedAt` | RankWrangler persisted the latest successful Keepa Product payload at this time. |
| `keepaSourceUpdatedAt` | Keepa reported its Product record changed at this time. |

`keepaFetchedAt` and `keepaSourceUpdatedAt` answer different questions. Provider import rows remain
diagnostics and provenance; scheduling reads Product freshness directly.

`amazonListingStatus` records the listing outcome separately from those call timestamps. A
successful SP-API response that omits a requested ASIN sets it to `deleted`; a later response
containing the ASIN sets it to `active`. Provider failures do not change it. Active means the Amazon
detail-page listing exists, not that an offer is in stock or buyable. Deleted Products retain
last-known listing fields and are terminal for automatic SP-API freshness work. Only an explicit
refresh or a newer authoritative Catalog discovery rechecks them.

The following public projection is the accepted target; persisted source state and dashboard
observability above remain current.

Public Product reads project the persisted sources into provider-neutral `listing`, `category`,
`salesRank`, `price`, and `demand` groups. A policy-current Product returns immediately. Missing or
policy-expired required data waits through the shared coordinator without creating a public
Operation. Public responses omit source timestamps, freshness, status, and pending availability;
temporary provider failure or deadline exhaustion uses the shared retryable error.

Single public Product get defaults to `include: ['marketData']`, retaining its existing Keepa
freshness check and automatic background Keepa policy. Passing `include: []` skips that on-demand
Keepa check. It does not alter the scheduled Keepa queue or 24-hour successful-fetch guard.
The same get can opt into `listing.shortName`. For a known Merch listing with an
available image, Gemini 3.1 Flash-Lite observes the printed words and distinctive pictured motifs
at low image resolution. Jev selects a word-for-word title span that identifies the design, or
abstains; display capitalization may be normalized. Common occasion phrases include a pictured
motif when that context distinguishes the design. The generation runs in the read request after
listing resolution and overlaps the Keepa history wait when both are requested. A sparse Product
short-name row stores the name or valid abstention, source fingerprint, and generation state only
after opt-in.
Cross-process claims prevent duplicate generation; an expired pending claim can be retried on the
next request. The fingerprint includes title, image URL, and generator version, so unchanged names
have no time-based refresh while changed inputs regenerate. Generation events land in the admin
System Status event log (`/status`), and physical Gemini and TypeSafe attempts in Provider-attempt
telemetry. Other Product read paths do not invoke these providers.
Opted-in reads require `RANKWRANGLER_GEMINI_API_KEY` and `RANKWRANGLER_TYPESAFE_API_KEY`.
The TypeSafe key must be provisioned as a RankWrangler-owned credential in each active lifecycle
before clients use the opt-in; missing credentials fail the opted-in request.

`cutoutThumbnail` is a separate Product-get include and is available to any active Product with a
supported image URL, regardless of Merch classification. Cloudflare Images removes the background
and returns an intermediate WebP. RankWrangler crops its visible alpha bounds, scales the subject as
large as its aspect ratio allows, and centers it on a transparent 128×128 WebP canvas in R2. A sparse
claim row prevents duplicate work across processes. Source URL and generator version determine the
asset key, so the next requested read regenerates after either changes. Generation failures keep the
original thumbnail available and retry after a short cooldown. Other Product reads do not start
cutout work.

`listing.bulletPoints` is always an array, with `[]` for no bullets. `salesRank` contains `current`
and `averages.last30Days`/`averages.last90Days`; demand drop windows use `last30Days`, `last90Days`,
`last180Days`, and `last365Days`.

The dashboard Product drawer remains source-aware. Its tooltips may expose SP-API and Keepa
provenance, last attempt and success, source observation time, supplied categories, and the latest
error or retry without changing the public Product projection.

## Dashboard Product Reads

`api.app.product.search` adds three fields to the shared search items without changing the
public contract: the stored short name and cutout URL when their fingerprints match the current
title and image (null otherwise; reads never start generation), and `bsr30d`, the main BSR value
in force once per day over the last thirty days, read in one bounded statement per page.
`api.app.product.get` adds the same stored names, the count of Products sharing the normalized
brand in the marketplace, and the best main BSR recorded in history with its first time.
`api.app.product.keywords` lists retained keyword memberships with placement from the newest run
of each page (1-based page, null when absent from those runs), standing score and tier, and
membership time; totals count all memberships and page-one placements. `api.app.stats.summary`
returns footer counts for any signed-in user.

### Explore grid: paging, sidebar filters and facets

`api.app.product.search` also takes Explore's sidebar filters and offset paging, all
dashboard-only:

- `tiers`: a union of BSR tiers (`elite` ≤25,000, `hot` ≤100,000, `strong` ≤300,000, `steady`
  ≤1,000,000, `slow` above). Each tier is its own inclusive range ORed together, so Elite + Steady
  does not match the tiers between. An unranked Product is `slow`, so the five tiers partition
  the result. Thresholds live once in `apps/server/src/services/bsr-tiers.ts`, mirroring
  `apps/website/src/features/bsr/bsr-tier.ts`.
- `published`: `last60d` or `lastYear` keeps Products first available on or after the start of
  the UTC day 59 or 364 days ago (60 or 365 calendar days, today included); undated Products only
  match `any`.
- `niche`: `has` or `none` asks whether the Product carries any semantic facet. Unclassified
  Products have none.
- `page` (1-based) with `pageSize` (default `limit`, max 100) reads by offset and ignores the
  cursor; `nextCursor` still continues after the page. Deep offsets cost the skipped rows.

The response adds `total` and `totalIsEstimate`. A bounded count stops after 10,001 matches, so
narrow searches are exact; past that the total is the planner's row estimate for the same WHERE
clause (`EXPLAIN`, from column statistics), flagged `totalIsEstimate: true`. Totals are fresh per
filter for a minute, then served for up to 30 minutes while a background count replaces them, so
paging does not recount.

`api.app.product.searchFacets` takes the same filters without paging or sort and returns the
sidebar counts and KPI bands from one scan of the Products matching every non-sidebar filter. The
scan's inner select carries rank, monthly sold, first-available date and a niche `exists` probe
per row; the outer aggregate counts with `FILTER` clauses, so there is no grouping, join fan-out
or per-facet query. Each sidebar group (`tiers`, `published`, `niche`) is counted under the other
groups' filters but not its own; `total`, the 24-bucket BSR histogram (log-spaced inside each
tier, bounds aligned to tier edges, last bucket open-ended), median BSR, median monthly sold, the
18-bucket monthly-sold histogram (on Amazon's "bought in past month" badge steps, under 100 through
50K+) and the 60 daily first-available counts see every filter. Counts are exact
(`totalIsEstimate` is always false here, so Explore's pager shows this total once it loads); the
medians are the only sorts, over the filtered rank and sold columns.
`improving7dShare` samples the first 2,000 matches in UUID order (uniform, since ids are random)
and compares the main BSR in force now with the one in force seven days ago, read in one pass over
the tail of each sampled Product's `bsr_main` series (the full series only when the last 256 points
do not reach back a week); Products without a point on both sides are left out, and it is null
when none compare. The sample runs alongside the aggregate. Results are fresh per filter for 60
seconds per process, then served for up to 30 minutes while a background read replaces them.

`api.app.product.searchSeasonality` takes the same input and returns Explore's seasonality chart:
estimated units sold a week over the last 52 whole weeks, oldest first, the last ending at today's
UTC midnight. It samples the first 1,000 matches in UUID order and reads each one's `bsr_main`
series, thinned in the database to the last point of each UTC day (weeks end at midnight, so
nothing else can be in force at a week's end). Each week takes the rank in force at its end,
converts it through the rank-to-sales curve below (monthly median ÷ 30.4375 × 7), and sums the
designs with a rank then; `designs` says how many, and a week with none is null. The whole result
is null while no curve is fitted or no sampled design has history. The bucketing is the pure
`bucketSeasonality` in `services/search-seasonality.ts`. Results are fresh per filter for an hour,
then served for up to six more while a background read replaces them.

Indexes these reads lean on: `products_marketplace_bsr_idx` (tier ranges and rank sorts),
`products_marketplace_first_available_idx` (published windows and first-available sorts),
`products_search_document_idx` (text), and the `product_facets` primary key (niche probes). At
millions of Products the facet scan is a sequential pass over the marketplace's Merch rows,
bounded by the other filters; the stale-while-revalidate cache is what keeps it off the hot path.

### Sales estimate: the rank-to-sales curve

Sold/mo shows Amazon's "bought in past month" badge (Keepa `monthlySold`) when a Product has one,
and otherwise `~N`, the median of `api.app.product.salesCurve` at the Product's 30-day average
rank. The curve is fitted from the catalog, not fixed: active US Merch listings in Clothing
(root category 7141123011) whose Keepa read is under 30 days old, counted per log-rank bin of the
30-day average BSR and badge value. The badge and that average cover the same trailing month,
and a Product Keepa has not read says nothing about its badge, so unread Products are left out.

The badge is a floor on a step scale (50+, 100+ … 900+, 1K+ …) and absent under 50 a month, so
each Product only bounds its sales. Log sales are modelled as normal around a power law that
bends at #300K (`headSlope` above, `tailSlope` below, where badges thin out much faster), plus a
share of Products missing the badge whatever they sell; the interval likelihood is maximised
(`services/sales-curve-fit.ts`). Rank drops are not used: Keepa counts at most one per sample,
so they plateau near the sampling rate and undercount anything selling daily.

BSR is relative to everything else selling, so the same rank means more sales in Q4 than in
spring. The fit reads only the trailing month, so the curve follows the season with about a
month's lag: it is refitted every six hours (served stale for a day while a background fit
replaces it) and warmed after a restart. A fit at November 2026 put #100K near 400 a month,
#300K near 150 and #1M near 14.

Each fit also builds the System Status report in the same pass (`services/sales-curve-report.ts`):
the typical badged shirt per log-rank bin, kept where most of the bin shows a badge, and per rank
range the share of shirts showing a badge against the share the curve expects. Admins read the
fit and report through `api.app.system.salesCurve`; the dashboard's estimates read the curve alone
through `api.app.product.salesCurve`. Both come from the stored fit, so no page load analyses
Products.

## Lookup Versus Discovery

The dashboard catalog reads stored Products and supports current-state search, pagination, and
facet filtering. It does not call Amazon merely because a user filters the stored catalog.

`api.app.amazon.search` is a separate live keyword lookup. It returns a transient first page and
passes its ASINs through the shared Product retrieval service with background policy. Today it does
not persist query identity, result placement, or run history; that belongs to the accepted
[Catalog search](catalog-search.md) design.

## Update Invariants

- Provider ingestion updates the same Product key instead of creating source-specific Products.
- A variant ASIN never becomes a Product of its own; it resolves to its family through an alias.
- Keepa persistence updates Product state, history, import diagnostics, freshness, and obsolete
  Keepa queue work in one transaction.
- A failed Keepa transaction never advances `keepaFetchedAt`.
- Missing optional Keepa values do not erase useful stored values.
- `isMerchListing` is a boolean that new Products start at `false`. The latest decided provider
  observation overwrites it and the seller bullets, so `true` can become `false`; an undecided
  Keepa observation (a variation parent without its own evidence) leaves both untouched. Merging
  two family rows keeps Merch if either is Merch.
- The shared Product retrieval service owns blocking lookups, durable queueing, freshness checks,
  in-flight deduplication, and response availability. A completed empty provider response retains
  the canonical identity and last-known listing data, marks the Amazon listing deleted, and advances
  `spApiResolvedAt`.
