---
summary: Defines the persisted activity-event record, allowed levels and statuses, emitted action names, correlation fields, and dashboard filters.
read_when:
  - emitting, filtering, or interpreting activity-log records
  - changing an event action name, status, primitive type, correlation field, or event payload
---

# Events

RankWrangler persists activity events for dashboard visibility and operational diagnosis. These
records are an activity log, not a WebSocket delivery contract and not a substitute for job
execution records.

## Record shape

| Field | Contract |
| --- | --- |
| `id` | Generated UUID. |
| `occurredAt` | Event timestamp returned as ISO 8601. |
| `level` | `info`, `warn`, `error`, or `debug`. |
| `status` | `success`, `failed`, `pending`, `retrying`, or `partial`. |
| `category` | Human-routing category such as `product`, `history`, or `job`. |
| `action` | Stable dotted action name. |
| `primitiveType` | `product`, `history`, `job`, or `system`. |
| `message` | Short human-readable outcome. |
| `detailsJson` | Action-specific structured context. |
| `primitiveId` | Optional noun identity; product and history events currently use the ASIN. |
| Correlation fields | Optional `marketplaceId`, `asin`, `jobName`, `jobRunId`, and `requestId`. |

`category`, `action`, and `primitiveType` overlap intentionally: category routes people, action
identifies behavior, and primitive type supports broad filtering.

## Emitted actions

| Action | Primitive | Meaning | Current statuses |
| --- | --- | --- | --- |
| `product.sync` | product | SP-API product sync outcome. | `success`, `failed` |
| `product.deleted` | product | SP-API returned no product payload and the stored Product was removed when present. | `success` |
| `product.facets.classify` | product | Product facet-classification outcome. | `success`, `failed` |
| `history.sync.manual` | history | User-requested Keepa history import. | `success`, `failed` |
| `history.sync.background` | history | Scheduled or queued Keepa history import. | `success`, `failed` |
| `job.fatal` | job | Background job escaped with a fatal error. | `failed` |

Treat `detailsJson` as action-specific diagnostic context, not a shared payload schema. Stable
correlation belongs in the dedicated columns so filters do not need to inspect JSON.

## Listing and filtering

The Clerk-authenticated dashboard query returns newest-first cursor pagination. It supports:

- level, status, primitive-type, and action filters;
- exact ASIN, marketplace, or job-run filters;
- text search across message, action, category, ASIN, marketplace, job-run id, and request id;
- page sizes from 1 to 200, default 100.

The cursor is `{ id, occurredAt }`. Responses contain `items` and `nextCursor`; the cursor is null
when no later page exists.

Event creation is best-effort in background and classification paths: failure to write an activity
row is logged without replacing the primary operation's outcome.

Canonical validation and filtering live in
[`event-logs.ts`](../../apps/server/src/services/event-logs.ts). Current action emitters are found by
searching for `createEventLogSafe` and `createEventLogsSafe` in `apps/server/src`.
