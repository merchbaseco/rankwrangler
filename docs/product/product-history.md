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

History reads return stored coverage first and may load Keepa when coverage is missing. All Product
history paths share the same ingestion and a strict 24-hour minimum between successful Keepa
requests for one marketplace/ASIN. Concurrent requests for the same Product join in flight within
one server process.

Eligible Merch Products also refresh automatically:

- root-category BSR below 300,000: daily;
- BSR from 300,000 through 999,999: weekly;
- BSR at or above 1,000,000, missing BSR, or non-Merch: on demand only.

**Brief user story:** An agent asks for weekly BSR and price buckets, then compares direction and
volatility without processing thousands of provider change points.

## Boundaries

- Sparse points do not mean RankWrangler stopped observing the Product.
- In the accepted source-separated Product model, `keepaFetchedAt` controls freshness; the newest
  history change does not. That field still requires the generated database migration.
- Rank and price movement are evidence, not sales totals or an opportunity recommendation.
