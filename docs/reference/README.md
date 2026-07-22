---
summary: Routes exact RankWrangler contracts for the public API, CLI, typed client, persisted data, and activity events.
read_when:
  - looking up an exact command, request shape, response unit, entity identity, or event name
  - changing a public contract consumed by an agent, script, extension, or dashboard
---

# Reference

Reference pages are terse lookup surfaces for behavior that exists today.

| Contract | Doc |
| --- | --- |
| Public tRPC transport, authentication, inputs, and product responses | [Public API](public-api.md) |
| Agent-oriented commands, configuration precedence, and JSON output | [CLI](cli.md) |
| Typed npm client construction and generated router types | [HTTP client](http-client.md) |
| Canonical identities, stored observations, provenance, and units | [Data model](data-model.md) |
| Activity-log fields, statuses, action names, and filtering | [Events](events.md) |

Implementation source remains authoritative when a contract changes. These pages explain the
parts consumers otherwise have to reconstruct across several files.
