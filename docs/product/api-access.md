---
summary: Explains how people, agents, and integrations authenticate to RankWrangler surfaces.
read_when:
  - connecting an agent, CLI, extension, or typed client to RankWrangler
  - interpreting API-key usage, rotation, or daily limits in the dashboard
---

# API Access

RankWrangler separates interactive dashboard sessions from portable agent credentials.

| Consumer | Authentication | Surface |
| --- | --- | --- |
| Dashboard | Clerk session | `api.app.*` tRPC procedures |
| CLI, extension, and integrations | Bearer license key | `api.public.*` tRPC procedures |

The public surface currently exposes Product summary, rich Product, Product history, and license
status behavior. The published `@rankwrangler/http-client` supplies end-to-end tRPC types, and the
`rw` CLI presents the same Product primitives as stable JSON output for agents and scripts.

Administrators can generate, reveal, copy, and rotate a user's license key in the dashboard. A new
key replaces prior keys for that email. The dashboard also shows requests used today and the daily
limit; limited usage resets at midnight UTC.

**Brief user story:** An agent stores its license with `rw auth set --stdin`, reads Product history,
and receives the same typed Product contract used by the extension.

## Credential handling

- Send license keys as `Authorization: Bearer <licenseKey>`.
- Prefer the CLI secure store or `RR_LICENSE_KEY` for automation; never commit a key.
- Rotating a key invalidates the previous key for that email.
- Provider credentials and Keepa token state are internal and never part of the public contract.

Exact calls and command shapes live in the [public API](../reference/public-api.md),
[typed client](../reference/http-client.md), and [CLI](../reference/cli.md) references.
