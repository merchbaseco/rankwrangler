---
summary: Records the accepted domain-specific tRPC WebSocket completion-event contract and its current implementation status.
read_when:
  - implementing tRPC WebSockets, Product-history completion, Catalog-search completion, or dashboard invalidation
  - deciding whether to add a generic event bus or send result data through a subscription
---

# Realtime Events

## Status

Accepted target architecture; not shipped. The current website uses `httpBatchLink` only, the
Fastify server exposes no subscription transport, and durable client Operations do not yet exist.

## Contract

Realtime delivery announces that durable domain state changed. It does not own result state and
does not stream provider payloads.

Each product noun and action owns its event rather than publishing through a shared application
event bus. The first accepted subscriptions are:

- `api.app.product.history.refresh.completed`
- `api.app.catalog.search.completed`

One `completed` event covers successful and failed outcomes. The associated Operation read reveals
the outcome; separate `succeeded`, `failed`, or `refreshFailed` subscriptions would duplicate the
lifecycle.

Event payloads carry only invalidation identity such as `operationId`, `productId`, or `queryId`.
Feature hooks subscribe and invalidate the exact tRPC reads that own the displayed state.

## Transport

The target website transport uses tRPC `splitLink`: HTTP for queries and mutations, `wsLink` for
subscriptions, and Clerk credentials in WebSocket connection parameters. A feature hook owns its
subscription, targeted invalidations, and reconnect invalidation.

## Recovery

WebSocket delivery is best effort. The durable database and Operation read remain authoritative.
Agents poll after `retryAfterSeconds`; the dashboard can poll while loading and use completion as a
low-latency invalidation hint. Reload, reconnect, timeout, and missed events recover by reading the
same Operation and domain resource again.

This boundary keeps the server stateless across connections and prevents realtime delivery from
becoming a second data store.
