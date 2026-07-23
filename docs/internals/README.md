---
summary: Routes RankWrangler internals for product state, source ingestion, history, jobs, authentication, and observability.
read_when:
  - locating the owner of product, history, search-term, job, authentication, or event behavior
  - checking system boundaries before changing data ingestion or asynchronous work
---

# Internals

Internals docs describe ownership, lifecycle, and invariants. Product docs describe what a consumer
can rely on; reference docs own exact request and response shapes.

| System | Doc |
| --- | --- |
| Workspace and service boundaries | [Architecture](architecture.md) |
| Canonical current Product state | [Product catalog](product-catalog.md) |
| Product discovery and source ingestion | [Product ingestion](product-ingestion.md) |
| Merch detection and facets | [Product classification](product-classification.md) |
| Historical rank and price observations | [Product history](product-history.md) |
| Keepa freshness and scheduling | [Keepa refresh](keepa-refresh.md) |
| Brand Analytics datasets and trends | [Top Search Terms](top-search-terms.md) |
| External product-result research | [Catalog search](catalog-search.md) |
| License, Clerk, and admin boundaries | [Authentication](authentication.md) |
| pg-boss scheduling and worker attempts | [Background jobs](background-jobs.md) |
| Domain completion notifications | [Realtime events](realtime-events.md) |
| Persisted customer-visible events | [Activity log](activity-log.md) |
