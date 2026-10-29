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
Product detail hooks use the same Product-sync completion stream but accept only their selected
marketplace/ASIN, then refetch that exact Product cache. Dashboard detail Refresh and extension
detail reads therefore update the visible Product without invalidating a list or showing a
provider-specific status.
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

## Keyword directory, sync control and activity

The app additionally exposes three independent subscriptions, each with its own React hook:

- `api.app.keyword.directory.changed`: changed normalized terms, consumed by
  `useKeywordDirectoryChanged`;
- `api.app.syncControl.changed`: the singleton control identity, consumed by
  `useSyncControlChanged`;
- `api.app.activity.created`: the activity account identity, consumed by
  `useEventLogCreated` while Logs is live.

The Keywords page (`apps/website/src/features/keywords/`) also refreshes its summary picks, which
are whole-directory aggregates a row patch cannot update, from the directory stream at most once a
minute (`useKeywordHighlightsRefresh`). Directory rows (`keywordDirectory`, `keywordDirectoryRows`)
share one enriched shape, so a patched row carries the same shelf, facet and score trend as a page
row.

Write paths call PostgreSQL `pg_notify` inside the same transaction as their durable changes.
Postgres delivers only on commit, including writes from another process; rollback sends nothing.
The app uses one direct PostgreSQL LISTEN session shared by the domain listeners (including the admin
`job_activity` channel written with each recorded job run), opened
by the first subscriber. `db/realtime-connection.ts` owns its lifecycle rather than postgres.js
`listen()`, which re-listens only once after a drop and silently stops if that attempt fails. Every
close re-issues LISTEN for all channels with backoff (one second doubling to thirty) until it
succeeds; the session has no idle or lifetime timer.
The transaction-pooled application port cannot own LISTEN. Browser subscriptions keep using the
existing authenticated tRPC WebSocket connection, not a separate browser transport. Closing the
server closes the LISTEN session too. No schema migration or database trigger is required.

Keyword events carry identities, not table payloads. The directory listener coalesces arrivals,
serializes reads of at most 100 changed terms, and patches only those rows into the active filter's
React Query infinite cache. It removes mismatches, sorts matching rows, deduplicates page overlap,
and retains a bounded loaded window. Canonical SP-API/Keepa Merch-classification changes and
Amazon deletion updates also notify the affected keyword memberships, so counts update without
waiting for another keyword scan. The unseen pagination boundary never advances because of
an event; it rewinds if arrivals displace rows. This prevents gaps without rereading every page.
An in-flight row response cannot overwrite a newer reconciliation or an unmounted filter. A patch
that lands while the directory itself is fetching (Load more or a refetch) is deferred and its
terms re-read afterward, because the arriving page would otherwise overwrite it. Each patch marks
other filters' cached directory pages stale so they refetch when shown again. Row reads ignore the
stage and freshness filters, so a keyword that graduates or is dropped leaves the active view.
Stage counts are a separate query refreshed at most once per 30 seconds of directory events and on
reconciliation.

Freshness and processing order are computed at the first page's observation time, so a check coming
due changes a row without any database write. The catalog arms one timer for the earliest future
`nextCheckAt` among loaded rows (at least 30 seconds out) and then refetches the loaded pages at a
fresh observation time. With no loaded row waiting to come due, nothing is scheduled. A claim that
expires after a worker crash is still only reflected at the next reconciliation.

Each stream emits `resync` once when its listener becomes ready or the database listener reconnects.
That closes the initial-read/subscription race and recovers missed events without polling.
Directory reconciliation refetches its loaded pages once; normal row events never do. Sync changes
invalidate only sync control. Activity events are coalesced to at most one refresh per second
that never cancels a refresh already running, refetch only the visible Logs filter and mark the
others stale; resume/live resubscription reconciles it. Queries have explicit freshness policies and no interval refetch.
A sync mutation writes its acknowledged result directly into its small control cache.
