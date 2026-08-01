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
| Dashboard | Clerk session | `api.app.*` tRPC procedures |
| CLI and integrations | Merchbase API key or OAuth bearer | `api.public.*` tRPC procedures |
| Chrome extension | Clerk Sync Host session | Background requests through authenticated data procedures |
| Safari extension | Native OAuth Authorization Code + PKCE | Background requests through the public surface |

The public surface exposes Product summary, rich Product, Product history, durable Operation
polling, and Catalog search. The published `@rankwrangler/http-client` supplies end-to-end
tRPC types, and the `rw` CLI presents the same primitives as stable JSON output for agents and
scripts.

The dashboard links to the centralized Merchbase account rather than generating or displaying a
RankWrangler credential. Usage shown in the dashboard belongs to the fixed RankWrangler Service
Account mapped to the stable Merchbase User; lifetime and daily counters reset/debit atomically.

**Brief user story:** An agent stores its Merchbase API key with `rw auth set --stdin`, reads Product
history, and receives the same typed Product contract used by the extensions.

## Credential handling

- Send Merchbase API keys or OAuth access tokens as `Authorization: Bearer <credential>`; the Chrome
  extension sends its transient Clerk session token through the same authenticated data client.
- Prefer the CLI secure store or `MERCHBASE_API_KEY` for automation; never commit a key.
- Extensions do not store or display suite API keys; Chrome delegates to Clerk Sync Host and Safari
  stores OAuth tokens in native Keychain storage.
- Provider credentials and Keepa token state are internal and never part of the public contract.

Exact calls and command shapes live in the [public API](../reference/public-api.md),
[typed client](../reference/http-client.md), and [CLI](../reference/cli.md) references.
