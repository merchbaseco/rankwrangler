# RankWrangler Production Database Queries

Use this guide when you need to inspect production data for debugging, validation,
or incident triage.

## Guardrails

- Default to `SELECT`-only queries.
- Any write action (`INSERT`, `UPDATE`, `DELETE`, `ALTER`, migrations) requires explicit
  user approval in the current conversation.
- Keep queries bounded (`LIMIT`, tight `WHERE` clauses, explicit time windows).
- Avoid exposing secrets or full credential values in responses.

## Connection Setup

Run from repo root:

```bash
set -a
source .env
set +a

export PGPASSWORD="$DATABASE_PASSWORD"
export PGOPTIONS='-c default_transaction_read_only=on'
```

Test the connection:

```bash
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c 'SELECT 1;'
```

## Query Patterns

### One-shot query

```bash
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c \
  "SELECT COUNT(*) FROM products;"
```

### Interactive `psql`

```bash
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME"
```

Inside `psql`:

```sql
\dt
\d products
\d licenses
\q
```

### Common debugging queries

```bash
# Most recently fetched products
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c \
  "SELECT marketplace_id, asin, last_fetched FROM products ORDER BY last_fetched DESC LIMIT 50;"

# License activity overview
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c \
  "SELECT \"key\", email, \"revokedAt\", \"usageCount\", \"usageToday\", \"lastUsedAt\" FROM licenses ORDER BY \"lastUsedAt\" DESC NULLS LAST LIMIT 50;"

# Ingest queue backlog
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c \
  "SELECT marketplace_id, asin, created_at FROM product_ingest_queue ORDER BY created_at DESC LIMIT 100;"
```

### Container-local query (when logged into production host)

```bash
docker exec rankwrangler-postgres psql -U "$DATABASE_USER" -d "$DATABASE_NAME" -c '\dt'
```

## Write Operations (Approval Required)

If and only if the user explicitly approves a write:

```bash
unset PGOPTIONS
# run the approved write command
export PGOPTIONS='-c default_transaction_read_only=on'
```

Always report exactly what changed and why.

## Schema Reference

- Primary schema source: `apps/server/src/db/schema.ts`
- Migration history: `apps/server/drizzle/`
