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
unrelated job/report errors; the generated public client and CLI compile. Authenticated browser
verification is outstanding because this worktree uses placeholder test Clerk configuration and
has no 1Password access. Production data and deployed code have not changed.

Review fixed timezone-dependent capacity windows, missing timestamp decoding, exploration starvation,
physical retry counting, concurrent keyword cadence changes, and budget deferrals being misreported
as provider failures. Final rehearsal: 78 database tests across sixteen files pass, including five
concurrent scheduling writers, a head/demand race, discovery starvation and operator status. The
final offline gate reports 477 passing tests plus eleven release-script tests; database-only tests
are intentionally skipped in that lane and run in the separate rehearsal. CLI end-to-end reports
seventeen passing tests. Generated public declarations and CLI compile; server and website builds,
release metadata, packed CLI and whitespace checks pass. No new source file exceeds 300 lines.

Implementation and local verification are complete. Remaining release work is authenticated browser
verification with real development Clerk configuration, review/commit when requested, and explicit
production deployment approval. No paid plan increase or production write was performed.

## October 24 rollout

User authorized signed-in verification, commit, deployment, migration and production checks.
Independent cutover review passed with a required maintenance pause: 0040 removes a column the old
server uses. Deployment now stops the old server after image build and gate verification, before
migrations. A failed migration leaves it stopped until the schema is inspected. Preserve the old
images and a consistent database backup before rollout. The existing production browser session
is signed in; validate the new UI immediately after deployment on the same origin.
