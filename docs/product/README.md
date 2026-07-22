---
summary: Routes readers to the RankWrangler capability that answers their product question.
read_when:
  - learning what RankWrangler does for Merch sellers and research agents
  - deciding whether a behavior belongs in product, internals, or reference documentation
---

# Product

RankWrangler is a source-attributed Amazon product-intelligence system. It collects durable facts
that humans and agents can inspect; it does not decide what a seller should create.

| Question | Page |
| --- | --- |
| What does RankWrangler know about an Amazon listing? | [Product catalog](product-catalog.md) |
| How does a product enter the catalog? | [Product ingestion](product-ingestion.md) |
| How are Merch listings and niches identified? | [Product classification](product-classification.md) |
| What historical BSR and price evidence is available? | [Product history](product-history.md) |
| What does Brand Analytics say about demand over time? | [Top Search Terms](top-search-terms.md) |
| How will an agent collect and compare external search results? | [Catalog search](catalog-search.md) |
| How can a user inspect work and failures? | [Activity log](activity-log.md) |
| How do agents and integrations access RankWrangler? | [API access](api-access.md) |

Catalog search is an accepted target capability and is labeled accordingly. Other pages describe
current behavior and flag source-separated Keepa fields that still require a generated database
migration.

For shared domain language, see [the project context](../../CONTEXT.md). For the rationale behind
the product boundary, see [Raw product intelligence](../decisions/raw-product-intelligence.md).
