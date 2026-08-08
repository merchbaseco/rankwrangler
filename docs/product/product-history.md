---
summary: Defines the BSR and price history that humans and agents can read for a Product.
read_when:
  - interpreting Product BSR or price charts and buckets
  - deciding when a public Product history read may wait for collection
---

# Product History

**Public retrieval status:** The caller-synchronous provider-neutral response below is the accepted
target. Dashboard and extension history remain current behavior.

Product history preserves sales-rank and price evidence. The dashboard and extension render charts;
the public API and CLI return compact provider-neutral time buckets.

## Reading the data

Stored history is event-based: a point records a value change, not a daily sample. Quiet periods can
therefore contain few points. Charts treat values as step functions and include the latest point
before a requested range when needed to establish the starting value.

Price values use minor currency units. Missing price or rank is represented as `null`, not zero.
Public history supports day, week, month, or automatically chosen periods. Each point is
`[periodStart, valueAtPeriodEnd]`; each metric summary contains only `first`, `latest`, `min`, and
`max` values.

Current stored coverage returns immediately. Missing or policy-expired coverage starts or joins
durable collection and waits for the policy-compliant result. Provider failure or request deadline
exhaustion returns a retryable error; a caller timeout detaches only that caller, and collection may
continue. Equivalent requests share one durable collection.

A current valid Product with no rank or price history succeeds with empty point arrays and `null`
summaries. Public history responses expose no schema version, status, freshness, provider,
Operation, or polling fields.

Eligible Merch Products also collect history automatically under BSR-dependent server policy.
Missing BSR, unknown classification, and non-Merch classification remain distinct and do not imply
automatic collection.

**Brief user story:** An agent asks for weekly sales-rank and price periods and receives current
points, transparently waiting when stored coverage no longer satisfies policy.

## Boundaries

- Sparse points do not mean RankWrangler stopped observing the Product.
- Rank and price movement are evidence, not sales totals or an opportunity recommendation.
