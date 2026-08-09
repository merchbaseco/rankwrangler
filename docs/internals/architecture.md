---
summary: Defines RankWrangler workspace ownership, persistence, external-source, API, and background-work boundaries.
read_when:
  - deciding whether behavior belongs in the server, website, extension, CLI, or typed client
  - changing persistence, provider ingestion, API routing, or background-work architecture
---

# Architecture

RankWrangler is a Bun monorepo around one PostgreSQL product-intelligence store. The server owns
Amazon and Keepa integration, canonical state, tRPC procedures, and background work. Other surfaces
consume that contract.

## Workspace

| Surface | Ownership |
| --- | --- |
| `apps/server` | Fastify/tRPC API, Drizzle persistence, Provider bridges, and pg-boss workers. |
| `apps/website` | Clerk-authenticated React dashboard for research and operations. |
| `apps/extension` | Chrome and Safari augmentation of Amazon pages using the public API. |
| `packages/http-client` | Published typed client derived from the public tRPC router. |
| `packages/cli` | Published `rw` JSON interface for agents and automation. |
| `packages/history-chart` | Shared rendering of product history. |
| PostgreSQL | Products, histories, facets, search-term datasets, queues, and operational records. |

Production Compose runs PostgreSQL, the server, and Caddy. Caddy serves the website and proxies the
API; the server process owns migrations and optionally starts workers.

## Server Layers

- tRPC procedures authenticate, validate input, call services, and shape results.
- Services own source policy, lifecycle, normalization, and orchestration.
- Database modules own queries and transactional persistence.
- Provider bridges own SP-API and Keepa request mapping, authentication, rate limits, retries, and
  short-lived attempt telemetry. Source-specific business normalization remains in services.
- Jobs own deferred attempts; persistent tables own domain truth.

The public typed client derives inputs and outputs from the server router. The CLI and extension do
not define a second server contract.

## Data Boundary

A **Product** is the canonical current state of one marketplace listing, keyed by marketplace and
ASIN. How RankWrangler discovered it does not create a second Product.

SP-API and Keepa provide observations. The source-separated Product model gives them independent
freshness watermarks; its generated migration must be applied before deployment. Current
normalized values can update the Product, while event-based rank and price observations remain in
Product history. Provider diagnostics are not canonical Product state.

Stored catalog lookup reads Products already known to RankWrangler. External Catalog search calls a
provider and can discover Products. Search-run membership and Organic search placement are
immutable evidence about that execution, not alternate Product records.

## Request And Work Boundary

The caller-synchronous public boundary below is the accepted target. Dashboard work coordination
describes current behavior.

HTTP tRPC owns queries and mutations. Clerk-authenticated tRPC WebSockets own app subscriptions.
The server performs cheap reads directly and delegates scheduled or provider work to pg-boss.
Provider retrieval persists durable work before dispatch. Every public data capability hides that
lifecycle behind its own freshness policy: current cached data returns immediately; missing or
policy-expired data starts or joins work and waits; provider failure or deadline exhaustion returns
a retryable error. Public contracts expose no refresh input, stale/pending data, Operations,
polling, provider metadata, or freshness fields. The dashboard app boundary retains source-aware
observability, Operation workflows, and domain-specific completion subscriptions.

The durable database state is authoritative. Operations own durable work outcomes, whether or not
the surrounding caller contract exposes them; job-execution records describe worker attempts, and
the activity log describes meaningful domain outcomes. These records remain distinct.

## Related

- [Product catalog](product-catalog.md)
- [Product ingestion](product-ingestion.md)
- [Background jobs](background-jobs.md)
- [Catalog search](catalog-search.md)
