# Collection implementation execution

October 23, 2026. Continue through local implementation and verification; no production deployment
or Git push is authorized.

Definition of done is one stored Product search with independently scheduled keyword collection,
measured provider budget enforcement, bounded discovery and explicit history admission. Verify
actual database transitions and physical provider gates, not only planner functions or green jobs.

## Units

1. Unified search and all callers. Implemented; generated migration 0039 passes the upgrade harness.
2. Physical Keepa capacity ledger and token reserve. Implement every request boundary, preserve
   unknown spend across restarts, and verify with controlled provider responses and PostgreSQL.
3. Keyword admission/tiers/head checks and discovery continuation. Keep interests, popularity and
   dated coverage separate. Verify negative observations, retries, budget deferrals and fencing.
4. Product history admission and SP-API blindspots. Grandfather every baseline identity atomically;
   new discoveries start without a standing history obligation. Preserve previous history.
5. Integrate health, operator visibility and migrations. Rehearse full upgrade, run meaningful
   research scenarios through real query paths, and record any missing live verification.

## Changed premise from the live pilot

Keepa keyword search returned exactly the same 20 ASINs in the same order for page=0 and page=1,
charging 10 tokens for each. Never build deeper coverage by repeatedly buying this response.
Its [official Product Search documentation](https://keepa.com/api-docs/product-search.html) describes
up to 20 results per term and does not document a continuation parameter.

A bounded SP-API Catalog Items pilot returned two distinct pages of 20 Products using nextToken.
All 40 supplied sales-rank and bullet data; Amazon returned a 2.0 requests/second rate-limit header.
This is evidence of working continuation and current included data, not a sustained throughput test.

Use Keepa for first-page keyword observations and history/richer metrics. Use SP-API continuation
for broad listing discovery. Discovery coverage identifies its source and page observations;
SP-API catalog ordering is not represented as Amazon organic search placement.

## Architecture choice

Two independent sketches compared a separate canonical keyword table with using existing
catalog_queries as the term owner. Use the existing term owner; page facts belong on immutable
observations and exploration passes. This avoids a second source of truth for keyword interest.
Physical request costs belong in a durable attempt ledger, independent of Product import rows.
Zero-result responses and ingest failures still consume provider capacity.

## Verification checkpoints

Record each unit's actual tests and migrations in the decision trail. Generate migrations using
Drizzle; user authorized agent execution. Add explicit data transitions to the generated migration
only where schema generation cannot infer the rollout, including baseline history admission.
Do not conflate successful fresh-schema tests with upgrade or preservation proof.

## Current verification

Generated migration 0040 has passed a staged upgrade through 0039, followed by existing keyword
observations and three baseline identities covering known Merch, unknown and known non-Merch.
Assertions verify every baseline admission, new-identity default, membership first/latest dates and
preserved research lease. The backup/restore preservation harness also runs before behavioral tests.

Server and website production builds, CLI end-to-end behavior, packed CLI and release metadata
checks pass. The repository-wide TypeScript command still reports existing Bun test declaration and
unrelated job/report errors; the generated public client and CLI compile. At the end of local verification, authenticated browser testing remained outstanding because
this worktree uses placeholder test Clerk configuration and has no 1Password access. The October 24
rollout below records subsequent production deployment and signed-in verification.

Review fixed timezone-dependent capacity windows, missing timestamp decoding, exploration starvation,
physical retry counting, concurrent keyword cadence changes, and budget deferrals being misreported
as provider failures. Final rehearsal: 78 database tests across sixteen files pass, including five
concurrent scheduling writers, a head/demand race, discovery starvation and operator status. The
final offline gate reports 477 passing tests plus eleven release-script tests; database-only tests
are intentionally skipped in that lane and run in the separate rehearsal. CLI end-to-end reports
seventeen passing tests. Generated public declarations and CLI compile; server and website builds,
release metadata, packed CLI and whitespace checks pass. No new source file exceeds 300 lines.

Implementation and local verification completed before the user authorized the October 24 rollout.
No paid plan increase was required.

## October 24 rollout

User authorized signed-in verification, commit, deployment, migration and production checks.
Independent cutover review passed with a required maintenance pause: 0040 removes a column the old
server uses. Deployment now stops the old server after image build and gate verification, before
migrations. A failed migration leaves it stopped until the schema is inspected. Preserve the old
images and a consistent database backup before rollout. The existing production browser session
is signed in; validate the new UI immediately after deployment on the same origin.

Production startup found a bundled ESM/top-level-await cycle: capacity chunks imported the unfinished
server entry while startup awaited capacity-backed collection. No migration failure or data loss.
Inline dynamic imports in the single-entry SSR build. An emitted-module reproduction exits 13 with
split chunks and starts successfully with inline imports (exit 0, STARTUP_READY true). Independent
review confirmed the newly eager modules only define tables/functions/constants. Redeploy this
packaging fix before considering rollout complete.

Inlining alone exposed a second initialization-order failure: Rollup's lazy namespace constants
were still below the entry's top-level await. The final correction removes top-level await from
the entry by running startup inside an async function with a fatal-error handler, preserving
normal split-module evaluation. A permanent database-lane test checks the actual entry has no
top-level await and executes a cyclic lazy-import fixture built with the real Vite configuration.

## Production verification

Deployed revision `34ef33995d7fdc2c7ff50f94b98aa71e9b2cb149` on October 24. Both public health
endpoints report `ok` with that exact revision after the existing SP-API queue drained the newly
eligible baseline blindspots: 622 old listings, then 553 listings in the new probation cadence.
This was a one-time rollout catch-up using normal batches and the existing provider limiter;
ongoing scheduled blindspot selection remains capped at twenty per scan. No Keepa history was
purchased for that SP-API catch-up.

The consistent pre-migration archive on the Mini is retained at
`/Users/zknicker/srv/rankwrangler-rollout-backups/2026-10-24-merch-database/before-0040.dump`
(1,022,741,773 bytes; archive listing verified). All 13,900 baseline Products remain admitted as
legacy identities. Every history metric count exceeds its pre-rollout count; keyword membership
backfill contains 734 relationships at the first post-rollout observation. The catalog grew to
14,224 Products, including 324 new identities. Twenty accepted SP-API discovery page requests reached
the pilot's daily cap; continuation passes persist with a budget stop rather than extra requests.
These are observed rollout counts, not ongoing throughput guarantees.

Signed-in production browser verification passed keyword search (32 fishing matches), exact-ASIN
search, BSR filtering and ordering, an empty-result search, clearing filters, infinite pagination
from fifty to one hundred loaded Products, the Product history dialog, and the new Collection status
panel. No tRPC/browser errors were observed; existing chart-size warnings appeared on chart mount.
Full local rehearsal now passes 79 database/build tests across seventeen files, including the
packaged startup regression, and Quality CI passes. The startup incident interrupted the public
site during rollout; recovery is complete. Initial catalog gaps and deliberate budget deferrals
remain expected behavior.

The longer production observation exposed a health-only mismatch: budget-deferred initial heads
were flagged as failed collection after fifteen minutes. Persist the provider's retry time when
releasing fenced keyword work, without changing failure count or last successful observation.
Health honors that nonfailure deferral plus scheduler grace; real provider failures remain unhealthy,
and an abandoned retry becomes unhealthy after its own grace expires. The database regression
verifies stale-owner fencing, unchanged freshness/failures, and eventual expiry. Rehearsal now
passes eighty database/build tests. The v0.11.0 client and CLI publication completed successfully.
