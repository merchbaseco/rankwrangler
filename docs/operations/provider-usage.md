---
summary: Defines the admin-only Keepa, SP-API, Top Search Terms, and product-classification observability surfaces.
read_when:
  - checking provider capacity, refresh coverage, job health, or classification cost
  - deciding whether a dashboard metric is operator-only or part of the seller product contract
---

# Provider Usage

Provider metrics are operator surfaces, not seller-facing product capabilities. They are visible
only to authorized admins in dashboard settings.

| Surface | Use it for |
| --- | --- |
| Keepa | Token capacity, queue pressure, refresh-policy coverage, and recent history jobs. |
| SP-API | Request/error health, refresh-policy coverage, and recent sync jobs. |
| Top Search Terms | Dataset availability, pending/fetching/failed windows, and ingestion jobs. |
| Facets | Classification throughput, cost/usage summaries, and assigned-value distribution. |

Loading, empty, and failed states belong to each panel. A missing metric does not by itself mean
the provider is down; corroborate it with the activity log and job execution records.

Keep raw provider budget details internal. Public APIs expose RankWrangler product data and usage
limits, not Keepa tokens or SP-API throttling internals.
