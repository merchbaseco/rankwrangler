---
summary: Defines stored Product search ownership and the separate durable keyword-observation workflow.
read_when:
  - changing Amazon keyword lookup or implementing Catalog queries, Search runs, Search results, or keyword refresh
  - deciding whether query results belong on Products or in immutable run history
---

# Catalog Search

## Status

Unified Product search, adaptive keyword collection, SP-API exploration and protected Keepa
capacity are implemented in source. Generated migrations 0039 and 0040 and production deployment
are pending. The local upgrade harness verifies preserved Products, histories and keyword evidence.

## Stored Product search

The app and public Product-search procedures use one shared database query and projection. Text,
filters, sorting, and keyset paging run in PostgreSQL. The query does not call Product retrieval,
provider APIs, or image enrichment. The canonical root BSR drives the filter, sort, and projection.

The weighted `simple` text document contains title, brand, and bullets. A title-only mode narrows
matching. All-fields text also admits Products with retained keyword membership from an observation of the exact
normalized keyword. Explicit exclusions still apply. An exact normalized marketplace-specific
brand registry owns official-brand exclusions. An empty registry excludes nothing.

First-page text reads with US scope upsert a Catalog-query candidate and update request time.
They preserve `activeUntil` rather than renewing the existing weekly subscription. The returned
coverage records the latest successful Keepa head observation and the latest source-attributed
SP-API exploration pass, or null when unobserved. Continuation pages and searches
without eligible text return null coverage. Candidate registration dispatches no work.

Background collection is independent of the request. Matching Product count never proves keyword
coverage. Early gaps are accepted; search does not wait for a probe or silently switch providers.
Public contract details belong in [Public API](../reference/public-api.md#product-search).

## External keyword observations

The public `keyword.results` procedure retains the former Product-search retrieval workflow below.
The dashboard's explicit collection and retained-run reads use the same durable observations.

## Accepted Durable Model

The Keepa workflow uses four nouns:

| Noun | Contract |
| --- | --- |
| Catalog query | Normalized provider-, marketplace-, and term-scoped interest and scheduling identity. |
| Search run | One successful immutable provider execution at a specific time. |
| Search result | One Product's membership and Organic search placement in that run. |
| Operation | Durable receipt for work that can outlive an HTTP request. |

`organicSearchPlacement` is the Product ordinal supplied for one Search run. Invalid or duplicate
provider rows are discarded without renumbering later Products, preserving ordinal gaps.

The worker makes one Keepa Product Search request with Product payloads and history enabled. It does
not issue a follow-up Keepa request for every ASIN. Available bullet evidence in that response is
classified immediately through the shared Merch classifier; the workflow does not wait for SP-API.
One transaction persists the Product rows and current Keepa metrics, writes the immutable run and
ordered results, advances query freshness, and completes the Operation. Each Product's Keepa import
record and history series follow in their own transactions after that commit, so the keyword lock
and the caller never wait on history writes. A failed history save is logged and
does not fail the search. The worker runs three searches at once, so a live search never waits
behind a scheduled refresh still saving history; Keepa calls stay serialized, interactive first.
Public keyword-results retrieval then passes retained canonical identities through shared Product retrieval and waits
until every result has its compact current Search projection, including a resolved available or
unavailable thumbnail.

Request resolution is serialized per Catalog query. Fresh-run reuse, pending-work deduplication,
mapped Service Account debit, and new Operation creation share one transaction, so unpaid work is never
visible to callers or recovery and a concurrently completed reusable run does not create a charge.

## Reuse And Keyword Refresh

- A successful run satisfying the Search capability's server-owned policy is reusable. A
  policy-expired run remains immutable history but is not returned as the current public Search.
  Equivalent requests share the same canonical Search-run work.
- Every external keyword-results request renews `lastRequestedAt` and `activeUntil` for 30 days, including
  cached reuse. The request is recorded as a `requested` Search-run trigger when it produces a run.
- Candidates enter bounded probation after measured capacity admission. Explicit keyword-results
  requests carry a 30-day research lease; general Product searches record interest only.
- Successful observations choose the next interval: hot 1–7 days, warm 7–21 days, cold 30–60 days.
  Changed Merch membership halves the interval; quiet membership multiplies it by 1.5. Apply ±10%
  jitter. Keyword popularity uses current BSR strength and breadth.
- Truly empty provider pages wait seven days, then thirty after repeated emptiness. Products
  removed by local filters are not empty-provider evidence. Failures back off from five minutes to
  twenty-four hours. Budget deferrals advance neither freshness nor failure counts.
- Demotion requires two successful observations and fourteen days of grace. Unsupported probation
  ends after thirty days. Inactive terms retire after ninety days without interest.
- Keepa observes the first page only. A live pilot showed page 1 repeats page 0 and charges again.
  SP-API acquisition uses real continuation tokens, one page per claim with due heads ahead of depth, independently
  of Keepa tier/admission. The former ten-per-term/twenty-global daily pilot caps are removed.
  Every physical Catalog start shares a persisted token bucket with foreground listing reads.
  Background gets 75% of effective observed rate, capped at the stored `background_max_rps`
  (0.5 requests/second by default); foreground has queue priority and access to the remaining
  capacity. Rate headers, throttle cooldown and Retry-After survive restart. Deferrals retain the
  page; the gated `scan-keyword` queue re-sends the job for the bucket's ready time.
  Background calls get one physical attempt; failures retry through durable backoff.
- Exploration retains source, contiguous observed depth, oldest page time and stop reason. Two
  pages each adding fewer than three catalog-new Merch products, or the pass's page limit (ten,
  five or three pages by Brand Analytics popularity), stop a pass; repeated pages, provider exhaustion and stale continuation each
  have bounded handling. These facts do not claim complete Amazon coverage or organic placement.

Acquisition targets own tracked/trial/dormant state, the latest page-one Merch membership,
explainable popularity score, cadence and next check. This is separate from Keepa admission.
User searches directly track the exact phrase through API/MCP or the extension's Amazon search
context; no synthetic apparel companion or product tags are added. Brand Analytics search terms
and autocomplete suggestions enter trials; a trial graduates when its first page shows at least
three confirmed Merch listings. Two failed trials become dormant; explicit user research
reactivates them immediately.

Score the latest first page using fresh current Merch BSRs, rewarding both strong leaders and
breadth. Hot checks use 1–7 days,
warm 7–21, cold 30–60, with change/quiet adaptation. Demotion requires two weak observations and
fourteen days since weak evidence began. Product-rank updates can promote a keyword between
searches. No new-ASIN yield is required to keep a strong known niche current. Novelty only stops
expensive deeper paging. A durable claim sequence reserves one in five dispatches for trials,
with the other class lending unused opportunities; physical request capacity remains the ceiling.

[Keyword collection](keyword-mining.md) owns the weekly Brand Analytics import, trial admission,
autocomplete expansion, retry checkpoints, source evidence and provider budgets. Product facet classification remains
independently disabled. It is not an acquisition source. Exact verified official-brand exclusions
remain evidence-backed, without guessed aliases or whole-licensee exclusions.

Provider tokens and durable Operation identifiers remain internal. Public keyword-results callers
receive `keyword`, `searchedAt`, and compact `results`. Each result carries immutable
`organicSearchPlacement` plus identity, title, brand, resolved thumbnail, classification, category,
current sales rank, price, and bought-in-the-past-month evidence. It omits bullets, averages, drop
windows, full demand, and history. Provider failure or deadline exhaustion returns a retryable
error. The dashboard's existing request route may still show loading and invalidate durable reads
on completion.

Keepa capacity is enforced at the physical request boundary; see
[Keepa refresh internals](keepa-refresh.md#protected-capacity).

Catalog query reads resolve existing normalized identity without creating provider work. They
return activity timestamps, derived status, observation count, and latest successful run metadata.
Run lists use stable newest-first cursor pagination, include empty successful runs, and omit result
bodies until a caller requests one run.

## Product And Rank-Tracking Boundaries

Dashboard run reads expose immutable placement and observed metrics separately from nullable current
Product state. Product completion invalidates only the affected exact-ASIN query rather than the
Search-run list. Pending is derived from durable queue membership, and a completed empty lookup is
unavailable rather than requeued forever. A missing Product join does not remove retained Search
membership.

Official Keepa Product Search documentation does not contract Amazon organic ordering; available
integration evidence indicates sponsored results are excluded and organic order is preserved.
Existing Search runs remain opportunistic first-page evidence under decaying keyword interest.
Standalone placement history is out of scope. A future rank tracker needs deliberate multi-page
collection, observed-depth semantics, and continuous bounded scheduling.
RankWrangler exposes source-attributed evidence; it does not score opportunities, recommend niches,
or estimate organic keyword search volume.
