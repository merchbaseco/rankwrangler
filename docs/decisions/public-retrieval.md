---
summary: Records why public reads wait for missing data, serve last-known Product listings with background refresh, and keep dashboard observability separate.
read_when:
  - changing public Product or keyword freshness, refresh inputs, response metadata, or retry behavior
  - deciding whether CLI, MCP, or HTTP callers should receive stale data, Operations, or provider diagnostics
---

# Caller-Synchronous Public Retrieval

Status: Accepted
Date: 2026-08-08

## Decision

Public CLI, MCP, and HTTP operations are caller-synchronous. Each capability owns a tuned server
freshness policy. A current cached result returns immediately; missing or policy-expired data
starts or joins durable work and waits. Only an exhausted request deadline or retryable provider
failure returns a retryable error. Durable work may continue after that caller leaves, and retries
coalesce with it.

Product `get` and `getMany` are the exception for listing data RankWrangler already knows. When a
Product has a resolved listing (active or deleted), a policy-expired read returns that last-known
title, thumbnail, and `amazonListingStatus` immediately and queues a background refresh that
coalesces with any refresh already queued. Only a Product with no resolved listing waits, bounded
by the caller deadline. An upstream stall therefore cannot turn a Product we already know into a
retryable error.

Public callers never receive pending Product data, Operations, polling state, provider
health or timestamps, freshness fields, or a refresh input. Product responses are provider-neutral,
and response shapes do not carry a schema version. `rankwrangler_status` probes connection,
authentication, and supported capabilities only; it is not a data-source health check.

Dashboard observability is a separate app contract. Existing Product-drawer affordances remain and
may explain SP-API and Keepa provenance, last attempt and success, source observation time, supplied
data categories, and the latest error or retry. Those diagnostics help a person understand and
operate ingestion without becoming part of the stable public Product model.

## Tradeoff

Returning stale data in general would reduce request latency and improve apparent availability,
but it would force every agent and integration to interpret freshness and partial-work states
correctly. Waiting makes deadlines more visible and can cost latency, but gives public reads one
reliable meaning: success contains policy-current data. Durable work, coalescing, and
capability-specific policies contain the provider cost without leaking the work lifecycle.

Product listing reads take the other side of that tradeoff. Titles, thumbnails, and listing status
change rarely, so a last-known value is nearly always still correct, while blocking on refresh made
an SP-API stall (2026-10, a wedged Catalog limiter) fail reads for Products already in the catalog.
Callers still never see a freshness protocol: a last-known listing is simply the answer.

## Consequences

- Public consumers handle final data or a retryable error, never a freshness protocol.
- Product `get`/`getMany` listing data may lag Amazon by up to one background refresh.
- Server policy can evolve independently for Product, history, Search, and keyword intelligence.
- Dashboard and operator surfaces may remain source-aware without coupling integrations to a
  provider.
- A request deadline detaches the caller; it does not imply that durable work was cancelled.
