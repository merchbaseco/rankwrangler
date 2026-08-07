---
summary: Defines the BSR and price history that humans and agents can read for a Product.
read_when:
  - interpreting Product BSR or price charts and buckets
  - deciding when a Product history read may contact Keepa
---

# Product History

Product history preserves source-attributed Keepa observations for BSR and new price. The dashboard
and extension render charts; the API and CLI return compact agent-oriented time buckets.

## Reading the data

Keepa history is event-based: a point records a value change, not a daily sample. Quiet periods can
therefore contain few points. Charts treat values as step functions and include the latest point
before a requested range when needed to establish the starting value.

Price values use minor currency units in agent responses. A missing Keepa offer is represented as
missing data, not as a zero price. Agent history supports day, week, month, or automatically chosen
buckets and includes range summaries for each requested metric.

History reads return stored coverage immediately with one category-level `freshness` envelope:
`{ stale, updatedAt }`. When coverage is missing, the shared server retrieval service joins or
starts durable collection, waits for the policy-compliant result, and returns history or a
provider-neutral retryable error. A caller timeout detaches only that caller; collection continues.
Equivalent requests for one marketplace/ASIN and history category share one durable collection.

A valid Product with no provider history succeeds with an empty or unavailable history result.
Public history responses do not expose Operation identifiers, polling state, or Keepa availability
details. Retryable capacity and deadline failures include a retry hint; the server-owned 24-hour
Keepa guard still applies to `refresh: true`.

Eligible Merch Products also refresh automatically:

- root-category BSR below 300,000: daily;
- BSR from 300,000 through 999,999: weekly;
- BSR at or above 1,000,000: on demand only.
- Missing BSR, unknown classification, or non-Merch: no automatic collection; unknown remains
  distinct from known non-Merch.

**Brief user story:** An agent asks for weekly BSR and price buckets, receives available points and
freshness immediately, and transparently waits for missing or explicitly refreshed history.

## Boundaries

- Sparse points do not mean RankWrangler stopped observing the Product.
- In the source-separated Product model, `keepaFetchedAt` controls freshness; the newest history
  change does not. Deployments must apply the generated database migration before using that field.
- Rank and price movement are evidence, not sales totals or an opportunity recommendation.
