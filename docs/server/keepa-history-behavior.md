# Keepa And History Behavior

## Manual Keepa Import Behavior

- Dashboard history modal auto-requests `api.app.loadProductHistory` when:
  - no Keepa import exists, or
  - latest successful import is older than 48 hours
- Existing points remain visible while stale refresh is in-flight
- Requests use high-priority Keepa queueing
- Request can wait up to 2 minutes before returning
- Retryable failures use exponential backoff during that window
- If retries do not succeed in 2 minutes, API returns `TIMEOUT`
- Manual import ignores merch/BSR auto-eligibility, but still respects the 24h Keepa success guard

## Keepa History Semantics

- Keepa data is event-based (value changes), not daily snapshots
- Sparse ranges are expected when values do not change often
- Keepa price `-1` means no offer/out of stock; stored as `isMissing = true`
- `days` limits retrieval range; it does not densify points
- Bounded charts render as step/event series with one carry-in point before `startAt`

## Keepa Category Cache

- Table: `keepa_categories` (`marketplace_id`, `category_id`, `name`)
- Populated from Keepa Categories API
- Treated as non-expiring cache

## Refresh Automation

- Detailed behavior: `docs/keepa-history-refresh.md`
- Automatic refresh first import window: up to 3650 days
- Later refreshes are stale-aware incremental windows (minimum 30 days)
- Auto enqueue is event-driven from product lookup, not fixed interval polling
