---
summary: Routes RankWrangler product contracts, system internals, exact references, maintainer workflows, and durable architecture decisions.
read_when:
  - starting work in RankWrangler and deciding which documentation surface owns the task
  - locating the contract for Products, history, Top Search Terms, catalog search, APIs, jobs, or provider operations
---

# RankWrangler Docs

RankWrangler is source-attributed Amazon product intelligence infrastructure for Merch sellers and
agents. Start with the product contract, then follow the owning technical or operational page.

| Need | Section |
| --- | --- |
| User- and agent-visible behavior, states, and non-goals | [Product](product/README.md) |
| Ownership, data flow, freshness, jobs, and invariants | [Internals](internals/README.md) |
| Exact data, API, CLI, client, and event contracts | [Reference](reference/README.md) |
| Development, deployment, releases, diagnostics, and recovery | [Operations](operations/README.md) |
| Accepted tradeoffs and their consequences | [Decisions](decisions/README.md) |

The root [domain glossary](../CONTEXT.md) defines Product, Merch-listing knowledge, bullet
evidence, observation, history, catalog query, search run, and search result. Use those nouns
consistently.

## Routing Rules

- Run `bun run docs:list` before broad repository work and after documentation changes.
- Describe current executable behavior in reference pages.
- Mark accepted but unfinished behavior as target behavior in product or internals pages.
- Keep implementation progress in Linear, not durable documentation.
- Prefer a link to the owning page over copying its contract.

See [Docs policy](docs-policy.md) when adding, moving, or retiring pages.
