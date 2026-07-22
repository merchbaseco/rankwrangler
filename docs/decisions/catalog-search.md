---
summary: Records why Catalog search persists observations and uses durable asynchronous Operations.
read_when:
  - changing Catalog query identity, Search run retention, reuse, or tracking cadence
  - proposing synchronous provider waits, per-ASIN follow-up calls, or generic realtime events
---

# Durable Catalog Search

Status: Accepted
Date: 2026-07-22

Implementation is in progress; the current product contract is summarized in
[Catalog search](../product/catalog-search.md).

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

Provider work is asynchronous. Public Operations expose only `pending` or `completed`; completion
contains either a resource reference or a sanitized error. Clients use the retry hint and durable
read to recover after timeouts or disconnects. Product-specific realtime completion events may
invalidate dashboard reads, but they do not carry result data or replace polling.

Recent successful runs are reusable by default. Identical in-flight searches join one Operation.
Weekly collection begins only after explicit tracking, and any genuinely fresh manual run advances
the schedule. One Keepa Product Search response supplies result Products and histories, avoiding a
second request for every ASIN.

## Consequences

- Search history remains useful even as canonical Product fields change.
- A provider failure completes the Operation without creating a partial Search run.
- Search-driven Product ingestion advances Keepa freshness and prevents redundant scheduled work.
- Keepa capacity, token accounting, retries, and job-attempt states remain internal.
- Adding private queries, another source, marketplace, result page, or cadence requires an explicit
  contract change rather than altering existing identity semantics.
