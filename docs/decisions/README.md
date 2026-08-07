---
summary: Routes readers to accepted RankWrangler product and architecture tradeoffs.
read_when:
  - questioning a durable product boundary or architecture choice
  - proposing a design that scores opportunities or changes Catalog search persistence
  - changing Merch-listing classification or public Product knowledge
---

# Decisions

These pages explain choices that should survive individual implementations.

| Decision | Why read it |
| --- | --- |
| [Raw product intelligence](raw-product-intelligence.md) | Understand why RankWrangler exposes source evidence instead of opportunity verdicts. |
| [Merch-listing classification](merch-listing-classification.md) | Understand nullable public knowledge, source-neutral bullet classification, and Product reconciliation. |
| [Durable catalog search](catalog-search.md) | Understand why queries, runs, results, and asynchronous Operations are persisted separately. |

Shipped behavior belongs in [Product](../product/README.md). Exact executable contracts belong in
[Reference](../reference/README.md).
