# Merch collection capacity baseline

Measured October 23, 2026 against production on PlanetScale PostgreSQL 18.6.
This establishes a conservative pilot envelope, not sustained maximum throughput.
No paid provider calls, database writes or load tests were used for this baseline.

## Decision

Proceed on the existing provider plan and database. Start with at most 50 scheduled keyword-head
requests and 20 exploration requests per rolling day across the pilot. These are request ceilings,
not guaranteed admissions or a fixed keyword population. Token reservations and the shared flow
budgets in [the collection policy](merch-collection-policy.md) must still permit each dispatch.
Existing Product freshness targets retain priority. Do not turn the whole catalog into recurring
history subscriptions.

The sampled cost predicts about 700 tokens/day at those ceilings, plus roughly 201/day for existing
scheduled history targets. That is approximately 3.2% of the theoretical 28,800-token daily refill.
Retries, interactive use, other workers and changed provider costs consume additional capacity.
This calculation is a pilot-sizing estimate, not a measurement of tomorrow's usage.

## Keepa evidence

| Observation | Result |
| --- | --- |
| Recent successful standalone imports with measured usage | 351 |
| Observed refill rate in those imports | 20 tokens/minute |
| Observed standalone Product cost | 1 token/request |
| Historical measured standalone successes | 1,970, each 1 token |
| Historical measured keyword requests | 7, each 10 tokens |
| Keyword cost sample dates | September 1 through October 17, 2026 |
| Stored keyword runs | 35, each with 20 retained results |
| Product requests in previous 24 hours | 351, no recorded errors or throttles |
| Keepa refresh queue at inspection | 0 |

The seven cost-bearing keyword requests are a small historical sample. Other import rows do not
carry request-level cost. Do not interpret them as free requests or multiply the same cost by
all Products in a run. The 20 retained results reflect the current adapter's cap, not a guarantee
of provider page size. New pagination needs a bounded live pilot.

The proposed initial token reserve is 20 tokens from C95(head)=10 plus 10×C95(Product)=10.
That reserve is not implemented yet. It must be recalculated as costs change and checked against
the actual bucket. A priority queue alone does not protect it.

Active known-Merch Products with numeric BSR currently imply:

| Existing target | Products | Steady-state tokens/day |
| --- | --- | --- |
| BSR below 300,000, daily | 131 | 131 |
| BSR 300,000 through below 1,000,000, weekly | 446 | 63.7 |

The existing scan also includes five deleted daily-tier and eight deleted weekly-tier Products,
so its actual nominal target load is approximately 201 tokens/day. Excluding deleted listings
is a required correction, not an invariant already enforced by the scan.

Six active daily-target rows were older than 24 hours at inspection. No weekly-target rows were older than
seven days. This is timestamp eligibility, not proof that every past refresh ran on time. Products
at or above 1,000,000 are outside existing automatic history targets and are not overdue history.

## SP-API evidence and uncertainty

The current Catalog limiter is configured for 2 requests/second with burst 2 and concurrency 2.
It adapts to observed Amazon rate-limit headers and throttles. This is configuration, not a
measured subscription ceiling.

The previous 24 hours contained 30 recorded Catalog requests with no errors or throttles.
Recorded request latency was about 316ms median and 465ms p95. The ingestion queue was empty.
This small demand sample does not prove sustained 2 requests/second, daily capacity or cold-listing
resolution throughput. Start conservatively, retain endpoint-specific limits and measure actual
headers, batch yield and throttles during the acquisition pilot. Keepa percentages do not apply
to SP-API.

## Storage

| Relation | Total bytes including indexes | Row basis |
| --- | --- | --- |
| Whole database | 8,938,051,263 | Database-size function |
| Products | 8,781,824 | 13,900 exact Products |
| Product history points | 4,581,629,952 | Approximately 15.55m, statistics estimate |
| Brand Analytics keyword daily | 4,007,370,752 | Approximately 10.74m, statistics estimate |

Products include 6,675 known Merch, 5,777 known non-Merch and 1,448 unknown records.
Across classifications, 1,514 have deleted-listing status. These counts overlap the classification
counts; do not subtract all deleted records from Merch alone.

Current Product storage averages about 632 bytes per identity including existing indexes. It is
not a forecast for fully enriched listings with additional search indexes. History and Brand
Analytics account for almost all current storage. Broad identity acquisition and selective history
admission therefore have very different cost profiles. Measure growth by tier during the pilot.
The measured database size is not allocated disk usage or free disk; WAL and temporary work also
need headroom. This baseline does not require a disk-size or subscription change.

## Search probe

Twelve sequential read-only EXPLAIN ANALYZE queries, three each for fishing, nurse, halloween and
an intentionally absent term, ran with a 10-second statement timeout. All succeeded. Returned rows
were respectively 22, 50, 50 and 0 on each repeat. Each query searched active known-Merch title,
brand and bullets with ILIKE, ordered by BSR and limited to 50.

Server execution ranges were 65–83ms, 33–43ms, about 1ms and 66–68ms respectively. Client transaction
round trips ranged from 145–323ms and include BEGIN, timeout configuration and ROLLBACK.
These are short sequential probes with a warmed cache and existing production activity, not an
API latency benchmark or a concurrency test. The fishing plan examined 6,675 candidate rows via the
existing Keepa eligibility index, discarding 6,653. Add a real text index before growing this query
pattern substantially; fast common-term early exits do not establish scalable rare-term search.

PlanetScale reports pg_trgm available but not installed. Native PostgreSQL text search avoids an
extension prerequisite. Choose matching semantics explicitly with the query implementation.

## Reproduction and boundaries

Sanitized local evidence and read-only harnesses are in the ignored
`apps/server/tmp/research-baseline/` directory. Initial, details and reads JSONL hold aggregates
and query plans only. Queries ran inside read-only transactions with statement timeouts over
verified TLS from the existing production container. No credentials or provider payloads were
copied into this report.

Recheck the pilot envelope after the first acquisition cohort. Record actual per-request cost,
new verified Merch yield, duplicates, listing resolution throughput, storage delta and overdue age.
Do not increase paid capacity or change existing freshness targets based on theoretical refill.

## Foundation verification

The first implementation unit uses a shared weighted native PostgreSQL search-document expression
for the planned GIN index and subsequent reads. A read-only probe compiled that actual TypeScript
expression and verified title/brand/bullet ranking, explicit word exclusion, literal fish versus
fishing behavior and an absent term against production PostgreSQL. All four probes matched their
expected IDs. These used synthetic VALUES rows and did not query or modify customer listings.
The same behavior is covered by the database-test suite. The schema changes still require a
generated migration; neither the indexes nor the registry have been created in production.
