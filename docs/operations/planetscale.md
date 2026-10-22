---
summary: Defines the lossless PlanetScale restore rehearsal, connection settings, preservation checks, and production cutover gates.
read_when:
  - restoring the Mac mini RankWrangler database into Cloudflare-billed PlanetScale
  - configuring pooled application connections and direct migration or pg-boss connections
  - verifying database preservation or preparing a remote-database cutover
---

# Move RankWrangler to PlanetScale

Run a disposable restore before changing production connections. Keep the current tables and exact
Keepa change points for the hosting move. Evaluate compact history separately on a restored copy.
Daily bucketing is a read projection and does not preserve every original observation.

## Configure connections

Create Postgres in the Cloudflare-linked PlanetScale organization. Use a single node in Virginia
for the first rehearsal. Start with 20GB disk and an 80GB storage limit. Confirm restore size and
query performance before selecting the production tier. Storage limits do not cap backup or traffic
charges.

Keep connection credentials in 1Password. The committed `.env.schema` owns their lifecycle references.
Do not replace the current production credential until the final cutover. Use these settings for
the isolated rehearsal process, with background workers disabled:

| Setting | PlanetScale value |
| --- | --- |
| `RANKWRANGLER_DATABASE_HOST` | Host supplied by PlanetScale |
| `RANKWRANGLER_DATABASE_PORT` | `6432`, pooled application queries |
| `RANKWRANGLER_DATABASE_DIRECT_PORT` | `5432`, migrations, preservation checks, and pg-boss |
| `RANKWRANGLER_DATABASE_SSL_MODE` | `verify-full` |
| `RANKWRANGLER_DATABASE_NAME` | Database name supplied by PlanetScale, usually `postgres` |
| `RANKWRANGLER_DATABASE_USER` | Role supplied by PlanetScale |
| `RANKWRANGLER_DATABASE_PASSWORD` | Password supplied by PlanetScale |
| `RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER` | `true` |

Application connections disable prepared statements for transaction pooling. Administrative clients
and pg-boss use the direct endpoint. The initial role needs ownership and schema creation privileges
for restore, Drizzle, and pg-boss initialization. Test narrower roles before adopting them.

## Rehearse a consistent restore

1. Record the source database version, deployed application revision, extension inventory, and
   migration journal. Source and target must use the same application revision during comparison.
2. Stream a custom-format `pg_dump` from the Mac mini to protected operator storage. Keep credentials
   out of shell arguments, logs, and dumps committed to Git. Dump all application schemas, including
   `public`, `drizzle`, and `pgboss`. Do not copy PostgreSQL global roles. Keep restored objects under a stable owner so removing
   the temporary migration login cannot remove application data.
3. Restore that dump into an isolated reference database and the empty PlanetScale target. Use
   `pg_restore --exit-on-error --no-owner --no-privileges` over PlanetScale's direct TLS connection.
   Do not use `--clean` against a populated target. Inspect unsupported extension or permission errors
   before proceeding. Never replay `apps/server/init.sql` against the managed target.
4. Keep all writers and workers off both copies. Capture the reference manifest and verify the
   target against it. A live source compared later against its dump can produce false differences.
5. Finish preservation checks before starting the application. Disabling the job runner does not
   prevent `boss.start()` from initializing and maintaining its schema. Keep application startup
   and queue tests away from the preserved comparison copies.
6. Verify the restored Drizzle journal and guarded central-auth gate before running later
   migrations. Do not rebuild an empty schema by replaying guarded migration `0028` against copied
   data. A migration changes the comparison baseline and needs its own preservation proof.

Run the proof under each copy's isolated connection environment:

```bash
bunx varlock run -- bun run --cwd apps/server database:preservation-proof \
  --phase=capture --manifest=/protected/reference.json
bunx varlock run -- bun run --cwd apps/server database:preservation-proof \
  --phase=verify --manifest=/protected/reference.json
```

The first invocation creates a new, owner-readable manifest and refuses to overwrite it. The second
fails on changed table content, column definitions, sequence state, or missing tables. Both use a
read-only, repeatable-read transaction and stream rows in batches of 10,000. Manifests contain counts,
schema metadata, and SHA-256 fingerprints, without raw records or credentials. Parent partitioned
tables include child rows once. Schema grants, functions, triggers, and indexes require separate
restore inspection. Sequences are not MVCC snapshots, so writers must remain stopped.

PostgreSQL hashes each canonical JSON row during a sequential scan. The operator streams those
fixed-size digests into a local external sort with 64MB of sort memory and hashes the ordered output.
Duplicates remain in the stream. This keeps raw records inside PostgreSQL, avoids remote sorting
and random full-index scans, and makes the fingerprint independent of physical row order or locale.
The manifest identifies its algorithm so incompatible captures fail validation.

The proof requires the system `sort` utility with `-S` and `-T` support and `trash` for scratch cleanup.
Allow at least 2GB of operator scratch space for this snapshot, plus headroom. Scratch directories
are private to the operator; no scratch data is written to the Mini. Managed storage autoscaling
bills allocated disk and requires an explicit shrink after temporary usage falls.

Exercise the proof against disposable local PostgreSQL before using it for a transfer:

```bash
bash apps/server/test/run-database-preservation-tests.sh
```

The command requires PostgreSQL binaries, `dev-port`, and `trash` on `PATH`. Pass a port offset
from `0` through `3` as its first argument when another rehearsal uses the default offset `3`.
It verifies a real
dump/restore and demonstrates detection of modified values and sequence drift.

## Prove application behavior and capacity

On the disposable target, verify migration state, authenticated Product reads, stored catalog
filters, history carry-in values, missing prices, and agent buckets against the reference copy.
Prove transactions and rollback. Exercise pg-boss initialization, send, fetch, complete, and restart
recovery with isolated test jobs. Keep real provider calls and automatic schedules disabled.

Run `ANALYZE` on restored tables before measuring queries. Use a separate disposable dataset for
expanded-catalog measurements. Record generated Product count,
indexes, database size, tier, query plans, latency distribution, and ingestion throughput while reads
run concurrently. Record disk growth, WAL backup usage, and egress. Do not infer capacity from RAM
or storage size alone. Synthetic writes must never run against the live source or cutover target.

## Cut over in a maintenance window

Production deployment remains manual and requires the user's deployment instruction.

1. Stop the old application and all database writers. Preserve its database and volume for rollback.
2. Take the final consistent dump. Repeat restore and preservation checks against frozen copies.
3. Update the production connection fields and lifecycle references in `.env.schema` together with
   the 1Password credential. Preserve the old credential separately for rollback. Validate the
   environment contract and TLS from the actual Mac mini runtime.
4. Deploy with the remote-database Compose override:

```bash
bun run deploy --remote-database
```

The override removes the server's local PostgreSQL dependency. It keeps local PostgreSQL behind the
`local-database` profile. It does not delete the existing container or volume. Use Docker Compose
2.24.4 or newer for `!reset`. The ordinary deployment workflow does not select this override yet.

5. Verify liveness, authenticated reads, history, queue recovery, and provider freshness before
   enabling ordinary schedules. Monitor target size, connections, query performance, and billing.
6. Retain the source and backup until the target is accepted. After the new database accepts writes,
   rollback needs a reverse transfer or explicit handling of those new writes. Switching back to
   the old database would otherwise lose them.
