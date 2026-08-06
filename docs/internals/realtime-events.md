---
summary: Records the accepted domain-specific tRPC WebSocket completion-event contract and its current implementation status.
read_when:
  - implementing tRPC WebSockets, Product-history, Catalog-search, Product-sync completion, or dashboard invalidation
  - deciding whether to add a generic event bus or send result data through a subscription
---

# Realtime Events

## Status

Product-history, Catalog-search, and SP-API Product-sync completion are shipped.

## Contract

Realtime delivery announces that durable domain state changed. It does not own result state and
does not stream provider payloads.

Each product noun and action owns its event rather than publishing through a shared application
event bus. The domain subscriptions are:

- `api.app.product.history.refresh.completed` — shipped;
- `api.app.product.sync.completed` — shipped;
- `api.app.catalog.search.completed` — shipped.

One `completed` event covers successful and failed outcomes. The dashboard and Catalog consumers
may use the associated Operation read; public Product-history retrieval hides its Operation and
re-reads history after the shared wait. Separate `succeeded`, `failed`, or `refreshFailed`
subscriptions would duplicate the lifecycle.

Event payloads carry only invalidation identity such as `operationId`, `productId`, or `queryId`.
Feature hooks subscribe and invalidate the exact tRPC reads that own the displayed state.

## Transport

The website uses tRPC `splitLink`: HTTP batching for queries and mutations, and `/api/trpc`
WebSockets only for subscriptions. The browser supplies its Clerk token in connection parameters;
the server verifies it through the same Clerk app boundary as HTTP procedures and closes the
connection at credential expiry. The dedicated WebSocket router exposes only shipped domain
subscriptions.

The Product-history panel subscribes by marketplace/ASIN. Its feature hook rejects completion from
an older Operation exposed through the app boundary and invalidates the panel's exact active
history reads. Public Product-history responses do not expose that Operation.
The Keyword-research page subscribes by Catalog query and rejects events from another query or
Operation. It invalidates the affected Operation, query, and run list; the completed Operation then
identifies the exact run read to invalidate.

The Keyword-research page subscribes to Product-sync completion by marketplace. Each event carries
one ASIN and invalidates only `api.app.product.get` for that marketplace/ASIN. Catalog-run reads
seed those normalized Product caches, so mounting a result list does not fan out initial Product
requests. Reconnect invalidates only visible Products whose Product availability is still pending.

## Recovery

WebSocket delivery is best effort. The durable database remains authoritative. Public
Product-history callers wait for the shared result or retry a provider-neutral `TIMEOUT`; the
dashboard continues to poll its app Operation. A completion event lowers latency for cache
invalidation but carries no outcome. Reload and normal history reads recover missed events.
Catalog-search Operations follow the same recovery model. The active term and Operation ID remain
in the dashboard URL so reload resumes the durable Catalog read without depending on WebSocket
delivery.
Product enrichment does not poll: durable queue membership plus the resolution marker distinguish
pending, available, and unavailable category states. The queue survives restart, realtime lowers
update latency, and reload reads current Product state.

This boundary keeps the server stateless across connections and prevents realtime delivery from
becoming a second data store.
