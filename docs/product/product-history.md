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

History reads return stored coverage immediately. When coverage is missing, the response includes
a pending durable Operation and retry guidance instead of waiting for Keepa. Agents poll the
Operation, then read the completed Product-history resource. Concurrent requests for one
marketplace/ASIN share the same pending Operation and provider request.

Completed Operations contain either a Product-history resource reference or a safe error. Existing
history remains readable after provider failure. Operation polling never starts provider work or
uses another external-work allowance.

Eligible Merch Products also refresh automatically:

- root-category BSR below 300,000: daily;
- BSR from 300,000 through 999,999: weekly;
- BSR at or above 1,000,000, missing BSR, or non-Merch: on demand only.

**Brief user story:** An agent asks for weekly BSR and price buckets, uses available points
immediately, polls a pending Operation, then reads the expanded history after collection.

## Boundaries

- Sparse points do not mean RankWrangler stopped observing the Product.
- In the source-separated Product model, `keepaFetchedAt` controls freshness; the newest history
  change does not. Deployments must apply the generated database migration before using that field.
- Rank and price movement are evidence, not sales totals or an opportunity recommendation.
