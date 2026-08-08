---
summary: Records why Catalog search preserves immutable placement evidence separately from current Products.
read_when:
  - changing Catalog query identity, Search run retention, reuse, or keyword refresh cadence
  - changing Organic search placement, Search result projection, or rank-tracking scope
---

# Durable Catalog Search

Status: Accepted
Date: 2026-07-22

The current product contract is summarized in [Catalog search](../product/catalog-search.md).

## Decision

Catalog search persists four distinct nouns:

- a **Catalog query** identifies source, marketplace, normalized term, and page;
- a **Search run** records one successful source execution;
- a **Search result** records one Product's membership, Organic search placement, and observed metrics in
  that run; and
- an **Operation** is the durable receipt for work that may outlive the initiating request.

Canonical Products own current listing state. Immutable Search results own what the source surfaced
at that time. This split avoids duplicating full Product snapshots while preserving query history
that current Products cannot reconstruct.

Provider work is asynchronous internally. Durable Operations contain either a resource reference or
a sanitized error, but public Product search follows the
[caller-synchronous retrieval contract](public-retrieval.md): it returns a policy-current completed
result or a retryable error after provider failure or deadline exhaustion. It exposes no Operation,
polling, freshness, provider, or pending state.

Recent successful runs are reusable under the Search capability's server-owned policy. A
policy-expired run remains immutable evidence but is not returned as the current public search;
the caller starts or joins replacement work and waits. Identical in-flight searches join one
Operation.
Every product search request renews keyword interest for 30 days, including a request served from
the 24-hour cache. Active keywords are eligible for one automatic refresh each week; expired
keywords become inactive without backfill or a permanent subscription. One Keepa Product Search
response supplies result Products and histories, avoiding a second request for every ASIN.

Search runs store `trigger` as `requested` or `automatic`. The trigger belongs to the run and its
history, not to canonical Products or compact public Search-result projections. Query activity is
represented by `lastRequestedAt`, `activeUntil`, `latestSuccessfulRunAt`, and refresh-attempt
timestamps. Derived query status and summaries use those timestamps plus durable Operation state.
Automatic work retains the existing capacity ordering, pending dedupe, bounded scans, retry
backoff, and idempotent Operation behavior.

## Consequences

- Search history remains useful even as canonical Product fields change.
- A provider failure completes the Operation without creating a partial Search run.
- Search-driven Product ingestion advances Keepa freshness and prevents redundant scheduled work.
- Keepa capacity, token accounting, retries, and job-attempt states remain internal.
- Adding private queries, another source, marketplace, result page, or cadence requires an explicit
  contract change rather than altering existing identity semantics.

## Placement Scope

`organicSearchPlacement` is the Product ordinal supplied for one Search run. Keepa's official
Product Search documentation does not contract Amazon's organic ordering; available integration
evidence indicates that sponsored results are excluded and organic order is preserved. Invalid or
duplicate entries are discarded without renumbering, so ordinal gaps remain honest evidence.

RankWrangler does not expose standalone placement history. Existing Search runs are opportunistic
top-20 evidence collected under decaying keyword interest, not a coverage or cadence promise. A
future rank tracker requires deliberate multi-page collection, observed-depth semantics, and
continuous bounded scheduling.
