---
summary: Records the decision to provide source-attributed Amazon intelligence rather than opportunity scores.
read_when:
  - proposing recommendations, winning-niche labels, or a composite opportunity score
  - deciding whether new provider data belongs in the canonical Product model
---

# Raw Product Intelligence

Status: Accepted
Date: 2026-07-22

## Decision

RankWrangler is infrastructure for collecting, normalizing, and retrieving Amazon product
intelligence. It preserves source attribution internally and in dashboard observability while the
stable public Product contract remains provider-neutral. It does not make the consumer-specific
decision of what a Merch seller should create.

The durable layer should expose:

- canonical current Products;
- explicit source and freshness for internal observations and app diagnostics;
- historical BSR, price, demand, and search-result evidence;
- stable API and CLI primitives that agents can compose; and
- null or missing values when the source does not support a claim.

Opportunity assessment belongs to the consuming human or agent. Different consumers can weigh
seasonality, competition, brand risk, production ability, and portfolio fit differently while
sharing the same evidence.

## Consequences

- RankWrangler may compute faithful normalization, buckets, trends, and source-derived deltas.
- It should not expose a universal opportunity score, `winning niche` label, or unexplained verdict.
- Classification can organize products and terms, but must remain distinguishable from source
  facts and from recommendations.
- New integrations should deepen the reusable data foundation before adding one workflow's private
  judgment to the core model.
- Dashboard features are useful for inspection and testing, while API and CLI primitives remain
  first-class consumers of the same durable data.
