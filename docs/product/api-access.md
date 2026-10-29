---
summary: Explains how people, agents, and integrations authenticate to RankWrangler surfaces and how centralized usage is charged.
read_when:
  - connecting an agent, CLI, extension, or typed client to RankWrangler
  - interpreting API-key usage, rotation, or daily limits in the dashboard
---

# API Access

RankWrangler separates interactive dashboard sessions from portable agent credentials.

| Consumer | Authentication | Surface |
| --- | --- | --- |
| Dashboard | Cloudflare interactive session | `api.app.*` tRPC procedures |
| CLI and integrations | Merchbase API key or OAuth bearer | `api.public.*` tRPC procedures |
| Chrome extension | Managed OAuth with S256 PKCE | Background requests through authenticated data procedures |
| Safari extension | Native OAuth Authorization Code + PKCE | Background requests through the public surface |

The public surface exposes one current Product, a basic batch of up to 200 Products, Product
history, Product search, and keyword intelligence. The basic batch debits one usage unit per unique
marketplace/ASIN pair; other Product reads debit their documented request unit. Durable work and
freshness policy remain internal implementation details. The published
`@rankwrangler/http-client` supplies end-to-end tRPC types, the hosted Product MCP tool accepts the
same pair array, and multi-ASIN `rw product get` provides a same-marketplace CLI form. The CLI presents
these primitives as stable JSON output for agents and scripts.

The dashboard links to the centralized Merchbase account rather than generating or displaying a
RankWrangler credential. Usage shown in the dashboard belongs to the fixed RankWrangler Service
Account mapped to the stable Merchbase User; lifetime and daily counters reset/debit atomically.

**Brief user story:** An agent stores its Merchbase API key with `rw auth set --stdin`, reads Product
history, and receives the same typed Product contract used by the extensions.

## Credential handling

- Public clients translate `mbk_v1` Merchbase keys into native Cloudflare service headers.
  Opaque OAuth access tokens use `Authorization: Bearer`; neither credential belongs in a URL.
- Prefer the CLI secure store or `MERCHBASE_API_KEY` for automation; never commit a key.
- Extensions use OAuth instead of suite API keys. Chrome keeps renewable context in trusted
  extension storage; Safari keeps it in the native Keychain.
- Provider credentials and Keepa token state are internal and never part of the public contract.

Exact calls and command shapes live in the [public API](../reference/public-api.md),
[typed client](../reference/http-client.md), and [CLI](../reference/cli.md) references.
