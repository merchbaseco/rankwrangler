---
summary: Defines read-only production database access, bounded query patterns, and approval requirements for writes.
read_when:
  - inspecting production data for debugging, validation, or incident triage
  - preparing a database write or checking the canonical schema sources
---

# Database Queries

Default to read-only, bounded queries. Database writes require explicit user approval in the
current conversation.

## Connect Read-Only

From the repository root:

```bash
set -a
source .env
set +a
export PGPASSWORD="$DATABASE_PASSWORD"
export PGOPTIONS='-c default_transaction_read_only=on'

psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" \
  -U "$DATABASE_USER" -d "$DATABASE_NAME" -c 'SELECT 1;'
```

Use tight filters, explicit time windows, and `LIMIT`. Do not expose credentials or complete
license keys in output.

## Useful Patterns

```sql
SELECT marketplace_id, asin, created_at
FROM products
ORDER BY created_at DESC
LIMIT 50;
```

On the production host:

```bash
docker exec rankwrangler-postgres \
  psql -U "$DATABASE_USER" -d "$DATABASE_NAME" -c '\dt'
```

## Writes

After explicit approval, unset the read-only guard only for the approved operation:

```bash
unset PGOPTIONS
# Run the narrowly scoped approved write.
export PGOPTIONS='-c default_transaction_read_only=on'
```

Report exactly what changed and how it was verified.

## Schema Ownership

The primary product/server schema is `apps/server/src/db/schema.ts`; operations and Top Search
Terms also have subsystem schema modules under `apps/server/src/db`. Generated migrations live in
`apps/server/drizzle/`.
