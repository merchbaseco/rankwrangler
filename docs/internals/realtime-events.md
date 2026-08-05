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

One `completed` event covers successful and failed outcomes. The associated Operation read reveals
the outcome; separate `succeeded`, `failed`, or `refreshFailed` subscriptions would duplicate the
lifecycle.

Event payloads carry only invalidation identity such as `operationId`, `productId`, or `queryId`.
Feature hooks subscribe and invalidate the exact tRPC reads that own the displayed state.

## Transport

The website uses tRPC `splitLink`: HTTP batching for queries and mutations, and `/api/trpc`
WebSockets only for subscriptions. The browser supplies its Clerk token in connection parameters;
the server verifies it through the same Clerk app boundary as HTTP procedures and closes the
connection at credential expiry. The dedicated WebSocket router exposes only shipped domain
subscriptions.

The Product-history panel subscribes by marketplace/ASIN. Its feature hook rejects completion from
an older Operation and invalidates that Operation plus the panel's exact active history reads.
The Keyword-research page subscribes by Catalog query and rejects events from another query or
Operation. It invalidates the affected Operation, query, and run list; the completed Operation then
identifies the exact run read to invalidate.

The Keyword-research page subscribes to Product-sync completion by marketplace. Each event carries
one ASIN and invalidates only `api.app.product.get` for that marketplace/ASIN. Catalog-run reads
seed those normalized Product caches, so mounting a result list does not fan out initial Product
requests. Reconnect invalidates only visible Products whose Product availability is still pending.

## Recovery

WebSocket delivery is best effort. The durable database and Operation read remain authoritative.
Agents poll after `retryAfterSeconds`; the dashboard also polls while showing existing points and
`Syncing Keepa…`. A completion event lowers latency but carries no outcome. Reload and polling
recover missed events, while reconnect invalidates the active Operation and history reads.
Catalog-search Operations follow the same recovery model. The active term and Operation ID remain
in the dashboard URL so reload resumes the durable read without depending on WebSocket delivery.
Product enrichment does not poll: durable queue membership plus the resolution marker distinguish
pending, available, and unavailable category states. The queue survives restart, realtime lowers
update latency, and reload reads current Product state.

This boundary keeps the server stateless across connections and prevents realtime delivery from
becoming a second data store.
