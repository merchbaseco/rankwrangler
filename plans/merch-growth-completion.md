# Complete the growing Merch database

October 25, 2026. The user asked to finish the original product vision after the first-day check
showed the rollout delivered a constrained acquisition pilot. This is active work, not a shipped
capability claim. No new paid plans, git push, or production deployment is implied by this document.

## Done means

- One immediate stored-catalog search remains shared by agents and the dashboard.
- Listing acquisition runs independently of paid Keepa head/history admission and expands through
  recorded keyword interest, useful catalog-derived evidence, appropriate buyer-demand terms, and
  exact brand-scoped Amazon catalog searches.
- Durable work continues across bounded jobs and restarts without a twenty-request-per-day pilot
  ceiling. Background capacity uses measured SP-API rate limits, headroom, backoff, and fair target
  selection; interactive reads and existing refresh work remain protected.
- Recurring history retains its separate measured budget. A new discovered identity does not imply
  standing Keepa history work. Preserve all existing identity, observation, and history data.
- Acquisition evidence does not pretend a phrase was externally searched. Unknown classifications,
  zero yield, errors, and budget waits remain distinct. Official-brand exclusions need explicit
  verified evidence, not title guesses.
- Prove useful research via representative agent calls, durable database transitions, restart and
  budget behavior, and realistic larger-catalog query checks. Update the older plan statuses so
  preparation, live deployment, and measured outcomes cannot be confused.

## Units and checkpoints

- [x] Ground the missing acquisition seams and compare two whole designs.
- [x] Implement continuous independent SP-API discovery with priority, durable capacity, and fairness.
- [x] Implement catalog-derived keyword/brand sources and acquisition-specific BA eligibility.
- [x] Complete exact brand scope/provenance and verified official-brand exclusion ingestion.
- [x] Rehearse preservation, continuation, yielding, retries, and growing catalog performance.
- [x] Run end-to-end agent research and reconcile documentation with actual verified capabilities.

Each unit must finish with behavioral evidence before the next. Start with a small source-supported
candidate set and measured background allowance, not a promise of exhaustive Amazon coverage or a
throughput quota. The shared RankWrangler catalog is not a seller-owned catalog; seller linkage
must not be invented. Existing first-day evidence is in the ignored research-baseline artifacts.

## Chosen shape

Use a separate scoped discovery target referencing an ordinary keyword. Keep public keyword
meaning and Keepa scheduling unchanged; target scope owns keyword versus exact-brand exploration.
Preserve existing pass/attempt IDs and keyword observations in the generated migration. Derived
catalog support has its own provenance and never creates provider membership. Keep generic observed
membership in keyword_products; retain separate brand-scope membership for measured page yield.

The worker uses durable Catalog capacity and shared foreground/background priority, with an initial
background share of 10% of measured effective rate and no daily pilot ceiling. One bounded job
handles at most five pages and wakes at the next actual eligibility time. Source selection is fair
across targets and continues without waiting for paid Keepa admission. Header observations and
throttle cooldown survive restart. The existing single production service remains the execution
model; all Catalog starts share the persisted operation budget.

Bound catalog scans with persisted cursors. Use existing ready semantic facets, their co-occurring
pairs, and exact observed brands from active known-Merch Products. Do not invent seller ownership or
purchase new AI expansion. Apply a narrower acquisition fit rule to BA without removing broad
research-demand data. Record per-page observed/new/known-Merch/unknown/non-Merch counts and source
provenance. Seed official exclusions only from the four directly verified exact brand labels.

Design evidence: two alternatives and independent cross-judge are retained under the ignored
research-baseline directory. The separate target design avoids a mixed keyword/brand public-table
audit and hidden source=keepa assumptions. Graft idempotent acceptance, durable physical capacity,
and source reconciliation. Do not add a new public research API.

## Verification, October 25

Implemented locally, not deployed. The upgrade/backup/restore rehearsal preserves Product and
history counts, old pass IDs, page cursors, observed depth and duplicate legacy receipts. The full
database lane passes 99 tests, including capacity beyond both former caps, concurrent physical
starts, restart wakeups, throttle cooldown, expired ownership, scoped membership, source cursor
progression, independent BA/interest provenance, exact brand exclusion and opposite-order writers.

The actual MCP tool routes through the public tRPC query and real PostgreSQL for fishing, nurse,
Hawaii and empty-niche questions. Four tool calls return screening metrics directly, debit four
requests and create no provider operations. A separate 100,000-Product synthetic cohort verifies
screening, complete keyset pagination and indexed query execution. This is local correctness and
scale evidence, not a production latency or sustainable throughput promise.

The packaged Vite/Node server boots against the migrated private database with jobs disabled and
answers liveness. This exposed native sharp bundling; keeping sharp external fixes module loading.
The status panel was rendered in a browser with fixture data and current styles; source labels,
physical-start counts, new-listing/Merch yields and legacy unmeasured receipts are visible.

Independent review found and fixed cross-market source provenance, opposite-order target upserts
and unchanged hourly row rewrites. No extra paid plan or public API was added. Existing public
client declarations are unchanged. Fast checks pass 489 server checks plus 11 release checks, along with the client and extension
checks. Server/website builds and all 17 CLI end-to-end checks pass. Full-project tsc still reports
existing repository typing issues; no changed production module has a reported diagnostic.

The live Linux/arm64 production container can independently import sharp 0.35.4 and generate a
95-byte PNG. That proves the existing installed native package works outside the bundle in the
actual runtime; it does not claim a new image was built. Docker now runs that import/image probe
as a build step so future images fail before deployment if native dependencies are incompatible.

After an explicitly requested deployment, check real useful Merch yield, queue health, throttles,
refresh backlog and storage growth. Full breadth rescans currently revisit after thirty days;
popularity-sensitive head checks remain separate. The source cursor scans 500 known-Merch Products
per hour; its ninety-day support window must be revisited before reaching roughly one million
source Products. These limits are operational checkpoints, not claims of exhaustive coverage.

## Revised keyword-source direction, October 26

The user explicitly excluded product tagging from discovery; its automatic worker remains disabled.
The prior verification above covers the earlier implementation, including facet-derived sources,
not a completed implementation of this revised direction. Replace that source before deployment.

User searches through the extension, API or MCP should enter the tracked keyword list directly.
Autocomplete expands supplied seeds; do not describe it as a reliable way to substitute concepts.
Title spans selected by Jev can supply grounded candidate seeds without product classification.

A read-only live Amazon Ads v5 request to POST /sp/targets/keywords/recommendations, using
KEYWORDS_FOR_ASINS for B07ZSKYWL2, bidsEnabled=false, maxRecommendations=100 and sortDimension=CLICKS,
returned HTTP 200 and 100 distinct recommendations through an existing US advertiser profile.
Useful new wording included tropical christmas shirt, hawaiian santa shirt, beach christmas shirt,
tiki christmas and summer santa. Noise included t light, christma apparel and non-apparel decorations.
The response had no impact metrics; advertising recommendations are not organic keyword rankings
or verified search-volume observations. One successful ASIN probe does not establish broad yield.

This is a promising source of additional phrases beyond exact title spans. Retain source ASIN and
fetch time, cache recommendations, filter buyer/apparel fit, deduplicate and trial eligible mined
candidates before recurring collection. The user-search path remains direct tracked admission.
No recurring Ads integration, tag removal or revised keyword admission has been implemented yet.

## October 26 implementation update

The revised direction is now implemented locally: product tags no longer generate keywords;
user searches directly track their exact phrase (including extension search context), and Ads/Jev
mining has durable per-product and global candidate owners. Recurring SP-API checks use separate
popularity standing rather than the prior monthly default. The earlier "pending" paragraph records
the pre-implementation state; [keyword mining](../docs/internals/keyword-mining.md) is the current
executable contract. No new changes have been deployed.
