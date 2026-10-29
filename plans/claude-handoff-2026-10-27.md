# RankWrangler handoff to Claude — October 27, 2026

## Start here

Continue in **`/Users/zknicker/.codex/worktrees/2feb/rankwrangler`**. This worktree contains substantial
uncommitted implementation and research. A fresh clone of main will not contain the pending fixes.
Read `AGENTS.md`, this handoff, and the current diff before editing. Preserve tracked and untracked work.

Zach's goal, in his words: **“an everything Merch database with all the info for easy efficient
agentic research. Like Handmade but for Amazon.”** This is his personal internal service, not a
subscription business requiring thousands of paying users. We are building a growing catalog that
agents can search and inspect efficiently to ideate and sell Amazon Merch products.

The next implementation is **small, relevant per-product keyword selection plus more efficient
scheduling**, building on the existing durable pipeline. Five selected keywords is Codex's recommended
default after modeling; Zach proposed a couple, or 5–10. The precise selection algorithm is still
research/proposed work. The revised Jev prompt, larger batches and ready-work scheduler have **not**
been integrated into the live collector. They must not be described as shipped.

Two pending implementation groups already exist locally: WebSocket updates and autocomplete fixes.
Review and preserve them rather than reimplementing them. Production should remain paused until
Zach chooses to resume; a handoff is not a request to deploy or resume.

## Current state and what to trust

| Area | State at handoff |
| --- | --- |
| Production site | `https://rankwrangler.merchbase.co/` |
| Deployed revision | `c45645f715b61f01086f6a4805562234948c586b` |
| Local checkout | Detached HEAD at the same SHA, plus many tracked/untracked changes |
| Public health | Both `/health/live` and `/api/health` freshly returned `status: ok` and that SHA |
| Keyword pipeline pause | Last successful DB check: **paused**, zero active discovery/mining/autocomplete claims, October 26 at 23:28 EDT / October 27 03:28 UTC |
| Fresh pause verification | Attempted during handoff; Mini SSH timed out. Public health still works. Recheck pause before any operational change; do not infer a new state from the SSH timeout |
| Database | PlanetScale Postgres, billed/managed through Cloudflare; production cutover completed October 22 |
| Compute | Existing Mac mini Docker service; the old Mini Postgres is not the production source |
| Source/package version | Server, HTTP client and CLI source at `0.12.0` |
| New purchases | None proposed or made during the capacity studies |

The rollout including unified search, independent SP-API acquisition, once-per-product mining,
keyword directory, Brand Analytics retirement and pause control has already happened. The commit
`d4966fa8` is `feat(keywords): add durable discovery pipeline and pause controls`; HEAD includes it.

Several older plans and even doc headers still say “local/not deployed” for things later deployed.
Treat them as dated receipts. Resolve status from current source, git history and the deployed revision.
In particular, older references to tag-derived acquisition, BA demand bonuses, cold-search filling
and the twenty-request SP-API pilot cap are superseded.

## Product contract and research experience

- One general `api.public.product.search` queries stored canonical Products immediately. Callers do
  not choose “live” versus “cached.” Collection is an implementation responsibility.
- Searching a phrase records interest and tracks it independently of how many stored rows match.
  Five matches do not establish that we have explored the keyword. Coverage is separate evidence.
- Early gaps are acceptable. Zach explicitly declined special launch prepopulation and automatic
  cold-search collection/wait/retry behavior. A new general search can initially return sparse data.
- Offer reusable text matching, explicit narrowing, exclusions, BSR/date/brand filters, sorting,
  pagination and compact screening data. Conventional search should not silently invent related ideas.
- Hide verified official brands by default in research, retain their records, allow explicit inclusion,
  and retain unknown brands. Registry currently has four exact labels: Disney, Marvel, STAR WARS,
  DC Comics. It is not a complete licensed-brand detector.
- `product.get`, `product.getMany`, `product.history` remain composable detail/history reads.
  Resolved listing reads can return stored data and refresh in the background; cold identities and
  history follow their existing bounded retrieval contracts. Default `get` market-data inclusion can
  coordinate Keepa work; do not accidentally make all browsing purchase history.
- `keyword.results` preserves dated external search-result/placement evidence. It answers a different
  question from searching current Products. Provider ordering is not a guarantee of organic Amazon
  web placement, and database search order is not Amazon placement.
- `keyword.get/search` expose keyword directory state. Public APIs are tRPC; hosted MCP and the
  typed client/CLI wrap those capabilities. Keep provider/budget/job details in operator surfaces.
- Return evidence for agents to reason over. Avoid premature seasonal-specific, “find winners,”
  autopilot, or opportunity-score endpoints. Add generic aggregation only when real usage warrants it.
- Missing data is not zero. Unknown Merch classification is not false. Listing date and database
  discovery date differ. BSR drops are not confirmed units sold; database counts are not Amazon-wide
  competition, volume or completeness.

Useful outcome: an agent can find relevant new/ranked fishing or Hawaiian Christmas designs across
our whole stored catalog, screen the returned metrics, inspect a few Products/history series, and
compare niches without repeated provider fanout or one expensive detail request per result.

## Zach's working methodology and settled preferences

He wants ownership, useful agent access and a system tailored to his workflow. FlyingResearch is a
benchmark for the 80/20 of real Merch research, not a mandate to copy every module or its internals.

He expects us to carry the agreed vision through, not ship a tiny capped pilot and call it complete.
Show what is implemented, deployed and actually observed as distinct things. Use plain concrete
language and examples; avoid invented labels, cryptic capacity statements and unjustified forecasts.

Routine reversible implementation should proceed without repeated approval questions. Preserve
explicit operational gates: no new push/branch/worktree changes, deployment, paid resource changes
or production data writes merely because they would be convenient. Use the existing deploy process.
Never restart unrelated host containers. Prior deployment approval is not a standing new deploy request.

Other specific decisions:

- **Keyword-led discovery; no semantic tags/facets as an acquisition dependency.** The experimental
  tagging feature has no immediate reactivation plan. Keep binary Merch classification distinct from tags.
- User searches through the extension/API/MCP are simple tracked-keyword inputs. ASIN detail lookups
  themselves do not create keyword interests. The extension also records the Amazon `k` phrase.
- Amazon autocomplete expands actual seed wording; it is not an idea generator that invents “tropical
  santa” from a title. Ads recommendations can supply related phrases absent from the title.
- Mine each product once and globally cache keyword judgments, including rejected phrases. Refreshing
  rank/title does not intentionally re-mine it. Respect retry/save crash windows rather than claiming
  impossible exactly-once external calls.
- Select a few good keyword roots, not every phrase that is remotely apparel-related. Do not add ten
  NEW terms merely because eight of the top ten are already known; those eight count toward the cap.
- Popularity controls recurring keyword cadence, like the useful scheduling pattern in Handmade.
  Newly generated keyword counts are not popularity, and repeated personal searches are not buyer volume.
- UI: Products-style tables, matching row backgrounds, fixed 40px rows, inline truncated error text.
  Statuses: Queued, Scanning, Up to date; Untracked is normally hidden and has an evidence-based reason.
  Use icons/colors. Processing order is the default sort, with no “Work priority” customer-facing label.
- One Pause/Resume switch controls the outer keyword pipeline. Existing Product/history refresh remains
  independent. Admitted requests may finish saving after pause; new claims/provider admissions stop.
- **No polling.** Use the existing authenticated tRPC WebSocket connection, a separate event and React
  hook per domain, and correct React Query cache updates. Do not refetch the full keyword table per event.

He requested adversarial discussion with Claude and light grilling, and later several autoreview
rounds. Those reviews happened; preserve their resolved product direction while applying later user
corrections. Do not make consensus a reason to ignore subsequent feedback.

## Handmade: reuse these patterns, not Etsy's measurements

Canonical local repo: `/Users/zknicker/Programming/handmade`.
Previous source-based reviews studied the stored market catalog, keyword/listing screeners,
collection graph, adaptive schedules, budgets, research recipe and selected-field/change storage.

Handmade patterns to carry over:

1. Research mostly reads the stored catalog through composable agent tools.
2. Seed useful phrases, discover related listings/phrases, deduplicate and expand incrementally.
3. Keep latest keyword cohorts distinct from lifetime discovery membership.
4. Use bounded durable collection and protected refresh shares; count actual attempts and retries.
5. Adapt successful-check intervals: meaningful change halves, quiet increases by 50%, within bounds.
6. Separate head freshness from deeper mining and per-listing refresh. Jobs succeeding does not prove
   useful freshness; overdue age and coverage matter. Earlier Handmade incidents exposed that distinction.
7. Store fields and evidence we need rather than full upstream payloads forever.

Important difference: Handmade's actual keyword hot tier is mainly owner queries and recent lookups;
its tiers are not a demonstrated measure of global buyer popularity. Amazon's BSR-based standing
is our own design choice. Do not port Etsy inventory/review-based sales estimates to Amazon.
Also, Handmade using tags in its graph does not override Zach's rejection of tags for RankWrangler discovery.

Read only when needed:

- `handmade/skills/handmade/references/keyword-research.md`: stored-first research workflow and root phrases.
- `handmade/packages/core/src/market/market-schedule-rules.ts`: actual adaptive interval rules.
- `handmade/packages/core/src/operations/market/refresh-market-keywords.ts`: protected shares, due ordering.
- `handmade/packages/core/src/operations/market/mine-market-keyword.ts`: bounded deeper mining.
- `handmade/packages/core/src/operations/market/market-request-budget.ts`, `market/market-budget.ts`.

## FlyingResearch findings and limits

Inspected public/official documentation, launch emails, signed-in free Best Sellers and MCP settings.
Relevant advertised capabilities: broad Merch catalog research, BSR/date/brand filters, newcomer/gainer
research, keyword extraction, comparisons and BSR/price history; MCP advertises historical research.
The interface guide confirms Specific search, Title only, word exclusions, official-brand controls,
and market/product/price/rating/date filters. Paid controls were gated in the free account.

Signed-in MCP settings confirmed `https://api.flyingresearch.net/mcp`, Streamable HTTP, bearer/OAuth
setup and stored-history examples. Saved evidence did **not** establish exact tool schemas, every
filter's MCP parity, time-series resolution, bulk-export entitlement, quotas or per-use billing.
We cannot know their actual scraper/Keepa mix from the UI, and should not pretend to.

The discussion compared a roughly $20 base offering with roughly $100/month for the functionality
Zach expected, including the broader Research/MCP/Upload discussion. Those are conversation-era
comparisons, not a newly verified price quote or exact bundle entitlement. Do not reopen pricing or
hold implementation for competitor schema access unless the next decision actually depends on it.

Zach is comfortable using Flying as a personal-use backfill/keyword source if technically available.
We have not implemented that source or established a bulk API/export contract. Do not infer access
or complete coverage from a vendor marketing count of five million designs.

Evidence: `plans/merch-research-review.md` includes the signed-in findings, email links and review receipts;
`https://documentation.flyingresearch.net/#best-sellers`; October 19 launch and September 30 emails
linked in that review. The original Claude review session was `71951d3b-1c0c-4ef6-87ab-ec192d1d83e9`
using `claude-opus-5-5`, with four direction and four scheduling rounds. Raw reviews are ignored under
`apps/server/tmp/direction-review/`. Later user decisions supersede cold-fill and BA portions.

## Architecture already implemented/deployed

Provider responsibilities remain central:

| Provider | Role |
| --- | --- |
| SP-API Catalog | Listing attributes, current BSR, bullet-based Merch classification, ASIN batches, keyword pagination |
| Keepa | Detailed/history-backed metrics and BSR/price series, selectively admitted background history |
| Amazon Ads | v5 `KEYWORDS_FOR_ASINS`, up to 100 suggestions, no bids/campaign creation |
| Public Amazon autocomplete | Once-only tracked-seed suggestions; separate from recurring keyword checks |
| Jev | Typed selection/judgment of supplied text candidates, not generative keyword invention |

Data owners: `products`; `catalog_queries`; `discovery_targets/evidence`; keyword membership,
exploration passes and physical attempts; `product_keyword_mining`; global `mined_keyword_candidates`;
product-to-candidate links; `keyword_autocomplete` and seed-to-candidate links. Claims use UUID fencing,
five-minute leases and restart-safe checkpoints. Persist successful responses before later stages.

Current coordinator (`services/keyword-sync.ts`, `jobs/process-keyword-sync.ts`):

1. A minute watchdog starts/rescues the job. An observed resume waited 39 seconds for its first wake.
2. Discovery claims a due target, fetches up to five pages per job, and normally yields after a page
   because the one-token background bucket cannot immediately fund another.
3. Expand one eligible tracked keyword, at most ten suggestions, using saved response/judgment stages.
4. Mine one eligible ASIN, saving up to 100 Ads terms and running at most two Jev batches of 25.
5. Save checkpoints and schedule another pass at least ten seconds after finishing useful work.

This is serial “a bit of each stage,” not a single global FIFO. A real pass took 13.956 seconds plus
its ten-second continuation. It did an empty autocomplete expansion, Ads, two Jev calls; SP-API deferred.
The user questioned this structure. We modeled a ready-work coordinator; that redesign is still proposed.

User searches track directly. Suggested terms pass judgment and enter trials; a head containing Merch
graduates them, two negative HEAD observations make them dormant. Only tracked seeds autocomplete.
Two low-yield PAGES stop depth; that is different from two negative trial heads. Tracked/trial dispatch
uses a durable 4:1 preference with unused turns borrowable. Already-known products do not suppress checks.

Depth uses real SP-API continuation tokens, accepted-page receipts, stop reasons and yields. Five
pages is a per-job cap, not a lifetime keyword cap. Low yield is fewer than three Merch memberships
new to that keyword for two consecutive pages; catalog-global novelty is a separate measure.
The old twenty-request/day SP-API pilot ceiling is removed. Keepa has its own separate protected budget.

Current ASIN eligibility: active, confirmed US Merch outside exact official registry. Rank prioritizes
mining but there is no minimum-BSR cutoff; cold and unranked products eventually qualify too.

### Standing and freshness

Keyword score uses fresh latest-head active known-Merch ranks, not lifetime membership:
`strength(r) = clamp(log10(1,000,000/r),0,1)`;
`score = 100 × (0.4 × best + 0.6 × mean(best five, zero-filled))`.
Hot >=75, warm >=35, otherwise cold; missing/stale BSR remains unknown rather than proving no demand.

Hot intervals 1–7 days, warm 7–21, cold 30–60. Changed membership shortens, quiet lengthens, with jitter.
Demotion needs two weak observations and fourteen days; promotions can follow fresh stored rank changes
without purchasing another head. Successful observations advance freshness; failures/deferrals do not.

Product SP-API targets: BSR <200k daily, 200–500k three days, 500k–1M weekly, 1–3M fortnightly, >=3M
monthly. Missing rank/classification has bounded probation/cold rechecks. Keepa auto history: <300k
daily, 300k–1M weekly, others on demand, with separate admission and a 24-hour successful-fetch guard.
New listings do not automatically become permanent Keepa subscriptions. Preserve existing history.

Brand Analytics/Search Terms page and backend are retired, including their score bonus. Migrations
0048/0049 belong to the deployed feature; do not resurrect BA from old design notes.

Ads credentials come from the Production 1Password item `Amazon Ads API - RankWrangler` via Varlock.
It duplicates BidBeacon's provider credentials; it is not a new app/quota. Coordinate rotation of both.
No secret values belong in handoffs, source, tool output or environment files.

## Pending local implementation: preserve and review

### WebSocket updates — implemented locally, not deployed

Three distinct tRPC subscriptions with separate React hooks:
`api.app.keyword.directory.changed`, `api.app.syncControl.changed`, `api.app.activity.created`.
Transactional `pg_notify` writes; one shared lazy direct Postgres LISTEN connection (5432), rather
than pooled app port 6432, delivers committed cross-process changes. Shared shutdown/reconnect lifecycle.

Directory events contain changed terms. The client batches reads of at most 100 affected terms,
patches filtered/sorted infinite-query rows, bounds the loaded window, and rewinds pagination when
arrivals displace rows. It handles classification/deletion count changes, stale in-flight responses
and unmounted filters. Reconnect/initial listener readiness performs one reconciliation; normal
row events do not refetch all loaded pages. Control and active Logs invalidate their own small reads.

Core files: `db/realtime-connection.ts`, notification modules, the three app subscription files,
`keyword-directory-rows.ts`, website `catalog/keyword-directory-cache.ts` and feature hooks.
Read `docs/internals/realtime-events.md` and current diff. Prior real-browser/private-DB verification
observed one row event → one targeted read, zero full table queries; idle periods had zero polling.
Database integration/cache tests and fast/build gates previously passed. Rerun after further edits.
The canonical React skill is in `~/Programming/agents/agents/skills/architect-react-features/`.

### Autocomplete fixes — implemented locally, not deployed

- Modern `https://www.amazon.com/suggestions` desktop profile: version 3, `site-variant=desktop`,
  `fb=1`, `lop=en_US`, US marketplace, both WIDGET/KEYWORD types, limit 11. Omit browser session,
  request IDs, keystroke telemetry and secrets.
- Preserve actual native KEYWORD suggestions, including pluralization and middle insertions.
  Remove the old exact-seed-prefix filter; ignore widgets, exclude self, deduplicate and retain up to ten.
- Strip accidental trailing commas at extension/server/candidate ingress, preserving internal punctuation.
- The old endpoint/parser dropped useful “mele kalikimaka christmas t shirts” type suggestions.
- New connectivity worked in probes, then desktop 503s occurred. Availability is not guaranteed;
  keep persistent cooldown/error distinctions. Successful empty results are not provider failures.
- An earlier seed completed with a falsely empty result under the old parser. A narrowly scoped
  correction/requeue may be needed after deployment; it is not permission to requeue everything.

Files: `keyword-autocomplete-provider.ts/.test.ts`, `discovery-candidate-policy.ts/.test.ts`, extension
`search-keyword.ts` and test. Source and docs include these fixes; production does not yet.

## Jev research: an important bug remains in production code

Current production/local collector contract still uses `jev-1.13.0`, global apparel fit at 0.8,
25-item claims, `candidates[index].phrase` shared-array references, and judge version
`jev-1.13.0:merch-buyer-search-v1`. Research fixes are only in `src/scripts/research/`.

Five interleaved repeats per size, same 100-case dataset: 50 hand-labeled clear cases, 50 Ads cases
without ground-truth labels. Correct out of the 50 labeled cases:

| Batch | Existing prompt | Explicit-phrase full-policy prompt |
| --- | --- | --- |
| 5 | 49–50 | 49 |
| 25 | 40–42 | 49 |
| 50 | 33–34 | 49 |
| 100 | 27 | 49 |

All batches were technically accepted. Larger shared arrays caused a semantic failure. Put each
actual phrase directly into its question, keeping irrelevant candidate lists out of shared state.
The revised 100-question request used 15,275 input tokens. A shared-policy variant used 5,213 but
scored 48/50; prefer full per-question policy for now. These are small fixtures, not population accuracy.

A separate 25-ASIN product-title relevance probe used 100 candidates + two controls per request,
503,109 tokens total, no provider errors; all negative controls and 23/25 full-title positives passed.
It fixed obvious unrelated-character suggestions on cat products. A lightweight local diversity proxy
plus Ads order selected averages 4.8 / 8.52 phrases under caps five / ten. This is proposed selection,
not a validated demand-ranking algorithm. Jev fit probability is not keyword popularity.

Docs: $0.042/M input tokens, output free; 64k/request, 32k/question; no separate question-count cap.
Rate limits are organization-specific. 1.14 is available, but tests pinned 1.13; do not silently upgrade.
Original completed eval runs recorded 307 requests (~$0.05); product-context probe added 25 (~$0.021).
These isolated probes used runtime credentials but bypassed collector writes/telemetry; their calls do
not imply production keyword counters advanced or that the sync was resumed.
An interrupted first start is excluded. Save actual usage and version; don't hide errors in latency claims.

When integrating: version the changed contract. Keep per-product topical relevance separate from
cached global apparel relevance. Never globally reject a keyword merely because it mismatches one ASIN.
Existing cached false negatives may deserve a narrow reviewed correction, not an automatic full-corpus
paid rejudge. Include already-tracked phrases in the selection cap; allow fewer rather than padding.

## Feasibility and the latest model

Read `plans/capped-keyword-capacity-model.md` for the full current assumptions; it supersedes the
unlimited admission assumptions in `plans/sync-capacity-model.md`.

Frozen inventory: 15,121 US products; 6,878 active confirmed Merch; 6,669 eligible unmined, including
490 below BSR 1M, 4,376 above 1M, 1,803 without rank. Fifteen tracked keywords awaited first heads.
One ASIN had 100 recommendations: 15 accepted, 35 rejected, 50 pending. Completed mining: zero.

Bounded samples: 27 ASINs / 2,700 recommendations / 2,142 unique phrases. Exclude two licensed
controls: 25 eligible / 1,965 unique, 864 apparel-fit accepted. Eight Hawaiian Christmas products
still yielded 570 unique phrases from 800 suggestions. Nine new Ads phrases over three SP-API pages
exposed 260 new verified Merch ASINs (91 below 1M), so early recursion is substantial. Errors retained:
one Ads 429 despite ten-second spacing, two desktop autocomplete 503s, one SP-API 500.

Observed SP-API header: 2.0 RPS. Our safe factor makes 1.6; background share 10% gives 0.16 RPS,
capped at 0.25. Model productive utilization 70% gives about **9,677 pages/day**. These are selected
internal budgets and planning allowances, not proof Amazon imposes a six-day limit. Initial stale-rate
fallback is 0.1 RPS. Foreground demand and cooldowns remain protected/shared.

Middle scenario: overlap exponent 0.80, 0.2 genuinely new approved autocomplete phrases per keyword
AFTER dedup, 70% graduation, five initial pages, 70% productive utilization, head-priority scheduling
and producer pressure when queued acquisition exceeds about two days of spare capacity:

| First generation from today's known 6,669 sources | Five selected | Ten selected |
| --- | ---: | ---: |
| Distinct keywords incl. autocomplete | ~10,300 | ~19,200 |
| Initial SP-API page requests | ~51,000 | ~96,000 |
| Returned product observations, including repeats | ~1.03M | ~1.92M |
| All sources mined and first heads/expansions complete | ~3.5 days | ~8.6 days |
| Full initial depth complete | **~5.5 days** | **~10.8 days** |
| Initial Jev | ~$6.10 | ~$6.50 |

51k / 9,677 ≈ 5.3 days explains most of the six-day estimate. The current serial scheduler with
only the selection cap, without the readiness improvements, models nearer 10 / 17 days. Five pages
is a scenario, not a requirement to fetch five when source end/low yield stops earlier, and not the
lifetime cap. Stronger/weaker overlap changes five-cap timing to roughly 2.4–13.5 days.

Those are closed-backfill estimates: newly found Products are stored, but their additional keyword
mining is excluded from that milestone. Continued recursion is separately modeled. The hourly simulator
includes due heads, negative trials, provider quotas, product/keyword dedup and producer backpressure.
Reachable catalog size and result-slot novelty are explicit unmeasured scenarios, not forecasts.

Illustrative 30 days at five: ~199k–900k stored product rows across two reachable-pool scenarios,
~50k ASINs mined, ~51k keywords, ~243k acquisition pages plus ~47k recurring heads, ~$44 Jev. Ten
uses similar scanning capacity but mines fewer ASINs (~23k), hence lower Jev (~$22). That is not a
claim ten is more efficient or has identical real niche coverage. Most of the ~11–12M compact
records in the five scenario are links/membership, not distinct Products. Estimated extra compact
disk 2.9–4.2GB before new history, logs and headroom. Do not sell these scenario counts as observed growth.

### Cost clarification Zach explicitly corrected

Jev is mainly a backfill/expansion expense, then an incremental new-arrival expense. Known products
are not re-mined on rank refresh; global judgments are cached. Routine known-keyword/rank checks do
not themselves invoke Jev, though discoveries can add new ASIN work. As inventory/vocabulary saturates,
spend should fall; the decay rate has not been measured. **$44 was one busy modeled 30-day expansion,
not a perpetual $44/month commitment.** At the conservative title-context prompt, 1,000 new ASINs
cost roughly $0.85 for 100 checks each, plus new keyword work.

A five-root cap alone is not a hard spending limit: always judging 100 candidates on every new ASIN
at the full Ads ceiling could still reach about $219/month Jev. The lower model depends on backpressure
and dedup. Examining just the first 25 suggestions yielded about three distinct usable phrases/product
in this sample, a future way to reduce tokens if a couple of strong roots are sufficient.

### Database/history costs

Approved PlanetScale price was about $18.25/month initially, up to $25.75 compute/disk at the 80GB
cap, plus applicable backups/traffic. No new paid tier is required by the observed initial catalog.
The old speculative $150 database estimate is not the basis for this plan. Keepa's subscription
refill is observed 20 tokens/minute (28,800/day); its invoice amount was not reverified. Existing
scheduled eligible history used roughly 260 tokens/day at the frozen snapshot. History has protected
admission based on measured costs/capacity; broad listing ingestion is separate.

History already takes 6.94GB. Products take 27.8MB (~1.84KB/row including indexes). A disposable
actual-schema load measured 130 bytes/source link, 292 bytes/candidate, 1.69KB/mining record.
Keeping all 100 source links costs about 13GB per million mined ASINs; the cap does not automatically
remove that evidence. Million-product compact catalog planning was 25–40GB plus uncertainty around
history/logs. Existing average history is ~0.5MB per admitted identity; don't buy it for everything
or downsample existing history to disguise growth. Keep a separate history/storage model.

The modeled busy month at five is about $63–70 database + Jev plus the existing Keepa subscription,
not the steady-state price. Ads API has no added API-use fee; Amazon's current primary announcement
cancels proposed SP-API annual/usage fees. Recheck billing sources when making a new financial decision.

## Recommended next implementation sequence

1. Read the current diff and verify shipped/local state. Preserve the pending WebSocket/autocomplete
   changes. Validate them against current source and existing tests rather than assuming a handoff is proof.
2. Integrate the explicit-phrase Jev request shape, appropriate versioning and tested batching up to
   100, with batched fenced writes/events. Relevance is not popularity and per-ASIN fit is not global fit.
3. Add small relevant/diverse per-product selection, default five, allow fewer; count already-known
   phrases. Keep full provenance if useful and model any deliberate storage change separately.
4. Replace the unconditional “all three stages then sleep” loop with one pauseable ready-work
   coordinator over the existing durable owners. Respect provider readiness/cooldowns without idling
   unrelated work. A fleet of new services/queues is unnecessary. Preserve leases and startup recovery.
5. Prioritize due heads and new trial heads over depth; keep fair service for both. Gate BOTH Ads
   and autocomplete producers when scan backlog exceeds measured spare capacity. Finish already-saved
   stages. Preserve meaningful work for cold ASINs and monitor their wait time.
6. Verify pause/retry/restart, global dedup, cap semantics, cache versioning, source relevance, head/depth
   separation and no duplicate paid stages. Rerun offline gates, private DB integration and real UI checks.
7. Report oldest due-head age, pending heads/depth, oldest unmined ASIN, new terms/ASIN, new verified
   Merch/page, tier populations, physical calls/errors, Jev tokens and storage. Scope any rollout explicitly.
   Production deploy and resume still require Zach's instruction; leave the sync off during inspection.

The two-day queue threshold, 70% utilization, novelty exponents, 70% graduation and autocomplete
multiplier are model assumptions/proposed tuning, not already deployed constants or established facts.
Twelve model tests pass. Source probes bundle; prior fast/integration/browser checks passed. Whole-server
TypeScript checking has existing diagnostics (including Bun test type resolution); do not claim a clean
full typecheck. Re-run relevant gates after implementing the proposed changes.

## Read these files when working that branch

- Product/collection direction: `plans/merch-research.md`, `plans/merch-research-review.md`,
  `docs/decisions/unified-merch-database.md`. Apply this handoff's later corrections to old checkpoints.
- Current lifecycle: `docs/internals/keyword-mining.md`, `docs/internals/catalog-search.md`,
  `docs/internals/keepa-refresh.md`. Watch for stale deployment wording.
- Public contracts: `docs/reference/public-api.md`, `mcp.md`, `http-client.md`, `cli.md`.
- New research: `plans/capped-keyword-capacity-model.md`, `plans/sync-capacity-model.md`,
  `plans/sync-model-decisions.tsv`; source harnesses in `apps/server/src/scripts/research/`.
- Core code: `services/keyword-sync.ts`, `product-keyword-mining.ts`, `keyword-autocomplete.ts`,
  `keyword-discovery.ts`, `keyword-judgment-contract.ts`; `db/keyword-mining-work.ts`,
  `mined-keyword-candidates.ts`, `keyword-autocomplete-work.ts`, `keyword-mining-capacity.ts`,
  `discovery-work.ts`, `discovery-checkpoint.ts`; all under `apps/server/src/`.
- Realtime: `docs/internals/realtime-events.md` and the pending website catalog hooks/cache modules.
- Infra: `docs/operations/deployment.md`, `database-queries.md`, `planetscale.md`.
- Private raw evidence: ignored `apps/server/tmp/research-baseline/sync-model-2026-10-26/`, including
  datasets, JSONL Jev/provider runs, model JSON, storage experiment and last successful paused-state checks.
  Earlier baseline/review receipts live in adjacent ignored research/direction-review directories.

If moving Claude to another checkout/cloud environment, transfer the pending tracked AND untracked
source changes. Ignored raw evidence is optional for understanding this self-contained handoff but
required to rerun its saved-data models. Never bundle secrets or assume a clone contains ignored evidence.
`/tmp` scripts/screenshots from earlier verification may have expired; use the committed/untracked
research harnesses and canonical runbooks rather than blocking on missing ephemeral files.

## Repository and operational constraints

Follow `AGENTS.md`. Highlights: tRPC-only APIs; strict TypeScript, concrete imports, kebab-case files,
300-line source limit; one procedure/file; published package changes need matching release bumps.
Use `dev-port`; this checkout allocated 34880–34883. Delete with `trash`. No `.env` files: `.env.schema`
and Varlock/1Password own secrets. `~/Programming/agents` is canonical for agent infrastructure/skills.

Do not handwrite Drizzle migrations. Zach explicitly authorized the agent to run generation for this
work despite the older AGENTS wording telling agents to ask him to run it. Use the actual repo command
under Varlock, review generated output and sync `init.sql` if a schema change is needed.

Do not commit/push or change branches/worktrees merely to package this handoff. `land it` means use
`committer`, commit by intent and push to `origin/main`. Deployment is a separate explicit manual
`.github/workflows/deploy.yml` dispatch; landing on main deploys nothing. Use that workflow, not
ad hoc host-wide container restarts. Keep production DB inspections read-only and bounded. Direct TLS
port is 5432, application pool 6432; enforce read-only at the session. Read credentials only through
approved runtime/Varlock paths and never print them. Historical migration credentials were cleaned
up; the stable production role/database are already provisioned. Do not redo the completed cutover.

## Claude follow-up — October 27, 2026 (local, not deployed, production still paused)

Implemented in this worktree, uncommitted: explicit-phrase Jev contract (`merch-buyer-search-v2`,
batches of 100, batched writes); per-product title relevance stored on links
(`product-relevance-v1`); capped selection (default five, fewer allowed, tracked phrases count);
migration `0050_product_keyword_selection` (four additive columns); ready-work coordinator with
provider readiness, head-first one-page discovery claims and two-day producer backpressure. Review
fixes to the pending realtime work: owned LISTEN reconnect, deferred patches during fetches, stale
marking of other filters, a due-time refresh timer and throttled Logs refreshes; autocomplete skips
out-of-range suggestions. Gates: `check:fast` and private-DB suite pass; no live provider calls made.
See `docs/internals/keyword-mining.md` ("Ready-work coordinator") for the current contract.

Later the same day the 45-second coordinator was replaced, at Zach's request, by provider-gated
entity jobs (`scan-keyword`, `recommend-product-keywords`, `judge-keywords`, `autocomplete-keyword`)
fed by `schedule-keyword-work`. The app-wide rule is `docs/decisions/background-jobs.md`; Settings →
Keyword Jobs shows queues, provider readiness and recent runs over the WebSocket.

