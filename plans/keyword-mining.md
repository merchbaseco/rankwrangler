# Once-per-product keyword mining and recurring keyword standing

October 26, 2026. Local implementation, not deployed.

## Ground and chosen shape

Two read-only architecture reviews compared an ASIN-owned ledger with a shared candidate ledger
against extending the existing Keepa query scheduler. Choose separate durable owners: an ASIN's
Ads recommendations are mined once; normalized keyword judgments are global and saved once;
SP-API discovery targets own recurring standing. Keepa query tiers remain paid admission only.

Remove facet-derived source generation completely. An explicit user search becomes tracked without
Jev admission. New Ads suggestions pass a text-only buyer/apparel-fit judgment and a bounded trial.
Recommendations retain ASIN provenance. Neither new titles nor metric refreshes reset mining.

Use latest page-one active Merch membership, never historical keyword membership, for popularity.
For BSR r, strength=clamp(log10(1,000,000/r),0,1). Product component is 40% strongest plus 60%
zero-padded mean of the best five. Fresh BA relative demand (at least 30 samples, at most seven days)
adds at most 15 points when Merch evidence exists. Hot >=75, warm >=35, else cold. Unknown BSR is
unrated rather than a negative observation. Hot 1–7 days, warm 7–21, cold 30–60. Changes halve the
interval and quiet membership increases it by 50%; demotion requires two observations and 14 days.
These are initial policy constants, not estimates of search volume. Preserve components for review.

Persist Ads and Jev claims, responses/judgments, retries and provider wakeups. Successful empty
recommendations and all-rejected candidates complete mining. External response/save crash windows
can repeat a request; completed durable stages never intentionally repeat. Physical calls are
bounded separately from listing refreshes and honor provider cooldowns. Recursive discovery never
runs synchronously inside research requests.

## Verification units

- Schema and preservation migration.
- Score/cadence behavior, including known productive niches with zero novelty.
- Global candidate deduplication and resumed mining without repeated saved stages.
- Actual user-search registration across public queries and extension context.
- Provider boundaries, physical call controls, empty/error distinction and restart fencing.
- Full database/fast/build gates and independent review before handoff.

## Observed checks

The exact Jev contract returned HTTP 200 on eight real Ads suggestions: positive judgments for
mele kalikimaka shirt (.91), tropical christmas shirt (.83), hawaiian santa shirt (.85); malformed
and non-apparel examples were below .1. Summer santa scored .74 and is not admitted at the initial
.8 threshold. This is a small smoke, not a calibrated accuracy claim. The cache preserves judged
outcomes; changing model/policy versions does not silently spend money rejudging the whole corpus.

A read-only cohort from current stored page-one evidence gave halloween shirt 100/hot, halloween
shirts for women 79/hot, aloha christmas shirt 57/warm, hawaiian christmas shirt 23/cold. These are
illustrative stored-data standings, not organic search-volume estimates or proof of live cadence.
Keepa's stored head composition can differ from the next SP-API head.

Product-rank changes are reconsidered in a bounded 500-keyword cursor scan without external calls;
promotions shorten due dates immediately. Demotions still require actual keyword observations.
The implementation fixes demotion grace from first weak evidence, explicit-search reactivation
against prior completed-pass deadlines, and a durable dispatch counter for trial fairness.

## Final local verification

108 database checks pass, including migration preservation, once-per-ASIN completion, saved-stage
recovery, 19/20 shared candidate reuse, empty/rejected completion, global judgment claim fencing,
tracked-phrase concurrency, independent score/cadence, immediate reactivation, trial fairness and
stale-snapshot concurrency. The actual packaged Node/Vite server boots on the migrated test schema.
Fast checks pass 494 server checks and 11 release checks; client/extension auth checks also pass.
All 17 CLI end-to-end checks pass, and client declarations remain unchanged. Server, website,
extension background/content builds and the extension typecheck pass. Whole-server tsc retains
existing repository diagnostics; no changed production module reports a diagnostic.

The real Jev endpoint also accepted the configured maximum batch of 25 questions, returning all 25
answers with the expected Noul schema. Operator status was inspected in a browser with fixture
data for mined-product counts and tracked/trial score/cadence rows. No production deployment,
new recurring paid plan, git push or tag-classifier activation occurred.

## Backend autocomplete connectivity, October 26

A one-off read-only fetch inside the running RankWrangler production container called Amazon's
public completion endpoint for prefix "hawaiian christmas". The all-departments alias returned
HTTP 200 with ten keyword suggestions, including hawaiian christmas shirt and hawaiian christmas
shirt women. No credentials were needed. A fashion alias returned an ornament suggestion, so do
not assume department aliases guarantee apparel or Merch relevance.

Autocomplete is now integrated locally: a separate once-per-tracked-query ledger saves suggestions
before judgment and shares global candidate verdicts with Ads mining. Only enabled tracked seeds
expand; accepted suggestions enter trials, and must demonstrate Merch before expanding themselves.
One seed/job, ten suggestions, ten-second durable autocomplete pacing, shared Jev capacity, fenced
claims, persistent cooldowns, and a minute watchdog bound the loop. This keeps concrete product and
keyword lifecycle owners while sharing candidate/judgment policy, instead of introducing a
polymorphic owner table. The architecture review agreed with this shape.

The user's requested Production/Amazon Ads API - RankWrangler item has been created and its three
fields verified against BidBeacon without printing values. The environment contract now points to
the RankWrangler item. These remain the same provider credentials, so rotation must coordinate both
copies. Production has not been deployed; new environment variables are delivered on a future
explicitly requested deployment.

The follow-up concurrency review found a possible multirow candidate-lock inversion between source
shortcut updates and judgment claims. All candidate writes now share one transaction advisory lock:
save terms, claim judgments, save verdicts and release claims. Both source owners lock their own
ledger first; judgment saves never acquire owner locks. This keeps owner-to-candidate ordering
consistent and preserves once-per-phrase admission across concurrent sources.

## Keyword directory and Brand Analytics retirement, October 26

Replaced the old Keywords search-run viewer with a Products-style live directory: qualification
and popularity filters, search, explicit Track keyword action, independent expansion/discovery
states, Merch/product counts, BSR score, cadence and timestamps. Candidates appear before Jev
admission and merge into canonical queries on acceptance. Full-precision cursor timestamps avoid
skipping rapid additions. Browser preview verified filtering and rejected-candidate visibility.

Removed Search Terms and its Brand Analytics backend: ingestion jobs, report lifecycle, health
probe, metrics, demand bonus and obsolete schemas. Migration 0048 drops three report tables and
two demand columns and disables historical BA source evidence; canonical queries, Products,
judgments and dated Amazon search runs remain. Keyword get/search now share the directory read;
BA keyword history is removed from public API, MCP and CLI. Version 0.12.0 records this clean break.

Keyword additions, candidate admission, expansion, accepted product pages, tracking changes,
standing changes and failures are transactional Logs events. Replay/stale ownership does not
repeat completion events; BSR refresh events use actual CAS RETURNING rows.

Verification: 110 private database tests, 415 server fast tests plus 11 release tests, 17 CLI
end-to-end tests, server/website builds, environment contract, release metadata and packed CLI
verification passed. Source changes remain local; no commit, push, deployment or production
migration has occurred. Preview fixture data is illustrative, not production measurements.

## Plain statuses and work ordering, October 26

Replaced visible qualification/expansion/discovery columns with Queued, Scanning, Up to date and
an Untracked filter carrying a durable-evidence reason. Added semantic token colors and icons.
Work priority is the default across the full database result set, not only loaded browser rows.
Product scan ordering follows current dispatcher fairness/urgency, while independent work lanes
are not presented as one numbered FIFO. The cursor freezes time and trial preference and retains
all seven ordering fields. Review caught and fixed readiness when autocomplete is deferred but a
new product scan is ready, and target-vs-query identity in tied dispatcher priorities. Added real
DB comparisons with the dispatcher, tied-ID coverage, phase-changing pagination and submillisecond
precision coverage. Browser preview verified colored states and the Untracked reasons.

The priority order is simply the default ordering; there is no customer-facing “Work priority”
or “Next up” label or separate queue-mode control. Final checks passed: 117 database tests,
415 server tests, 17 CLI tests, browser status/filter verification, server/website builds and
packed CLI verification. No deployment occurred.

## One keyword coordinator and pause control, October 26

User clarified that the control belongs at the keyword-processing loop, not all existing Product
or history sync. Replaced independently scheduled discovery/expansion/mining workers with one
process-keyword-sync coordinator; retained the existing durable child work owners. A persistent
admin-only switch gates each cycle, child claim and provider admission. Old stage schedules are
removed. New rollout starts paused; resume uses the minute watchdog and existing checkpoints.
Review added shared control-row locks at provider admission and continued healthy stages before
reporting a provider error. Existing Product/history sync and health checks were kept outside the
switch. Pause/resume is logged once per real transition. Nothing has been deployed.
