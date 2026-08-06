---
summary: Records why Catalog search persists observations and keeps durable Operations internal.
read_when:
  - changing Catalog query identity, Search run retention, reuse, or keyword refresh cadence
  - proposing synchronous provider waits, per-ASIN follow-up calls, or generic realtime events
---

# Durable Catalog Search

Status: Accepted
Date: 2026-07-22

The current product contract is summarized in [Catalog search](../product/catalog-search.md).

## Decision

Catalog search persists four distinct nouns:

- a **Catalog query** identifies source, marketplace, normalized term, and page;
- a **Search run** records one successful source execution;
- a **Search result** records one Product's membership, source position, and observed metrics in
  that run; and
- an **Operation** is the durable receipt for work that may outlive the initiating request.

Canonical Products own current listing state. Immutable Search results own what the source surfaced
at that time. This split avoids duplicating full Product snapshots while preserving query history
that current Products cannot reconstruct.

Provider work is asynchronous internally. Durable Operations contain either a resource reference or
a sanitized error, but Product-search callers receive a reusable Search run or wait for the
completed run. Public Product search exposes one `{ stale, updatedAt }` freshness envelope and a
provider-neutral retryable error; it does not expose Operation identifiers or require polling.
Product-specific realtime completion events may still invalidate dashboard reads, but they do not
carry result data or define the public Product-search contract.

Recent successful runs are reusable by default. Older successful runs remain Available evidence for
default callers while internal revalidation proceeds. `refresh: true` waits for a run inside the
server-owned 24-hour interactive reuse window, and identical in-flight searches join one Operation.
Every product search request renews keyword interest for 30 days, including a request served from
the 24-hour cache. Active keywords are eligible for one automatic refresh each week; expired
keywords become inactive without backfill or a permanent subscription. One Keepa Product Search
response supplies result Products and histories, avoiding a second request for every ASIN.

Search runs store `trigger` as `requested` or `automatic`. The trigger belongs to the run and its
history, not to canonical Products or individual result/currentProduct shapes. Query activity is
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
