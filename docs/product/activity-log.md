---
summary: Defines the searchable activity stream used to understand Product and history work.
read_when:
  - investigating whether a Product sync, history load, or facet classification succeeded
  - deciding what customer-visible operational event to record
---

# Activity Log

The Activity Log is a durable, chronological account of meaningful RankWrangler work. It answers
what happened to a Product or history request without exposing raw worker machinery.

Each entry identifies a domain action and its outcome, with safe structured context and correlation
to the relevant Product, request, or job when available. The dashboard supports text and structured
filters, older-page loading, and a pausable live view.

The [Events reference](../reference/events.md) owns exact fields, statuses, action names, and
filters.

**Brief user story:** A seller searches an ASIN in Logs and sees that Product sync succeeded but its
facet-classification attempt failed, including the safe diagnostic context needed to retry it.

## Boundaries

- The Activity Log records customer-meaningful outcomes; admin job executions provide deeper
  worker-attempt diagnostics.
- Events are emitted by the domain action that owns them, not inferred from a generic job hook.
- Structured details aid diagnosis but must not contain credentials or unbounded provider payloads.
