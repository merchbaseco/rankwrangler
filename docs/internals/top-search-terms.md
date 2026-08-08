---
summary: Defines Brand Analytics Top Search Terms dataset windows, report polling, normalized snapshots, filtering, retention, and trends.
read_when:
  - changing Top Search Terms collection, dataset state, keyword filtering, retention, or trend calculations
  - diagnosing missing daily or weekly Brand Analytics data
---

# Top Search Terms

RankWrangler stores Amazon Brand Analytics Top Search Terms as a historical demand signal for timing
and prioritization. It is not the main keyword-discovery system and does not replace autosuggest or
catalog-result research.

## Data Model

| Record | Ownership |
| --- | --- |
| Dataset | One marketplace, report period, and concrete date window with fetch lifecycle state. |
| Snapshot | One accepted report observation for a dataset, with `requested` or `automatic` refresh provenance. |
| Keyword row | Normalized term metrics and Merch-relevance classification in a snapshot. |

Daily and weekly windows are supported. Daily datasets are retained for 90 days. The scheduler
seeds 52 weekly windows; weekly rows are retained after insertion.

The primary signal is `searchFrequencyRank` over time. Top-three click and conversion share are
stored as supporting evidence. The app can list a snapshot, inspect fetch status, request refresh,
and return a term's historical points with 1-, 7-, and 30-day deltas.

The following public read behavior is the accepted target. Public keyword reads use the shared
retrieval coordinator. Policy-current snapshots return
immediately; missing or policy-expired data starts or joins durable collection and waits. They never
expose refresh inputs, freshness, the internal pg-boss job, or an Operation. Equivalent reads
coalesce by canonical keyword and data category.

## Collection Lifecycle

The dataset scheduler runs every five minutes, ensures expected windows exist, prunes expired daily
windows, recovers stale active rows, and dispatches at most five due datasets. Date boundaries and
availability are calculated in `America/Los_Angeles`.

BA report creation is asynchronous:

1. The worker requests a report and persists its report ID.
2. It releases the worker and schedules a status check 15 minutes later.
3. A later job checks the same report rather than busy-waiting.
4. A completed report is downloaded, normalized, persisted, and scheduled again if still open.

Only one report fetch runs across server instances. Reports pending longer than three hours and
terminal provider states clear their report ID so a retry can start cleanly.

## Merch-Relevance Filtering

Keyword classification is deterministic and term-signal based. It keeps explicit Merch products,
recipients, occasions, and seasonal intent while filtering branded/IP terms, commodity apparel,
gift-card noise, school commodities, and non-PoD seasonal goods. It does not depend on BA category
or department fields.

Stored rows keep `isMerchRelevant` and a reason. When classifier policy changes, existing snapshots
can be reclassified without refetching the Amazon report; that is an operational workflow, not part
of normal ingestion.
