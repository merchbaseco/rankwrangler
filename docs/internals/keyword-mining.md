---
summary: Once-per-ASIN Amazon Ads keyword mining, globally cached Jev admission, and independent popularity-driven SP-API keyword checks.
read_when:
  - changing keyword sources, ASIN mining stages, Jev judgments or tracked-keyword registration
  - changing keyword popularity, cadence, trial admission, dormancy or provider pacing
---

# Keyword mining and standing

User searches directly track normalized keywords. Product search records the exact supplied phrase;
explicit keyword-results reads register the same identity. The extension records the Amazon US
`k` search term once per content-page mount by calling Product search with limit one, using its
existing authenticated client. This incurs one ordinary search usage debit and no provider fanout.
ASIN-only lookups do not create keyword searches. Product tags do not participate.

## Once-per-product mining

Eligible products are active, confirmed US Merch listings outside the verified exact official-brand
registry. Strong BSR prioritizes first mining, but there is no minimum popularity cutoff.
`product_keyword_mining`, uniquely keyed by canonical Product, owns:

1. `pending`: call Amazon Ads v5 `KEYWORDS_FOR_ASINS` for one ASIN, at most 100 suggestions, no bids.
2. `recommendationsSaved`: persist normalized recommendations and ASIN-to-candidate links before
   requesting judgments. Globally duplicate phrases share one marketplace/normalized-term candidate.
3. `complete`: all linked candidates are settled and accepted phrases have source evidence. Empty
   successful recommendations and all-rejected suggestions also finish permanently.

Neither title/rank updates nor later discoveries reset completed mining. A saved Ads response is
reused after Jev failure; saved judgments are reused across ASINs. Already tracked phrases do not
need a model judgment. Jev answers independent Noul buyer/apparel-fit questions in batches of 25;
acceptance starts at 0.8. Save the probability, version and decision, including rejections. Provider
errors never become successful empty observations. No automatic rejudging on version changes.

Claims use UUID fencing and five-minute leases. A saved stage does not intentionally repeat; the
external-response/database-save crash window can repeat a request. Recommendations, judgments,
acceptance and completion are separate durable stages, never synchronous work in a research read.

Ads starts are spaced at least ten seconds; Jev batches at least two seconds, shared durably across
workers. Each coordinator cycle handles one ASIN and at most two judgment batches. Dated followups continue work;
a minute watchdog recovers lost wakes. Persist Retry-After/cooldown, and reserve before token/profile
work so a provider cooldown also prevents authentication traffic. Auth failures pause the provider
for an hour; per-product failures back off. These initial ceilings limit recursion; they are not a
claim about Amazon's quota or a promise to spend the allowance. Existing listing refresh and Keepa
capacity are separate. The Production `Amazon Ads API - RankWrangler` item supplies the Ads credentials through the
environment contract. It copies the same provider credential used by BidBeacon; coordinate rotation
of both items. The separate item does not issue a separate Amazon application or quota.

## Once-per-keyword autocomplete

The coordinator’s autocomplete stage expands enabled tracked US keywords once, separately from
recurring product discovery. Trials must first find Merch and graduate before becoming seeds.
`keyword_autocomplete`, keyed by canonical query, saves the response before judging and records
completion even for empty responses. Failed judgment resumes the saved response. The seed-to-candidate
join retains provenance. Completed seeds are never automatically expanded again.

Each coordinator cycle handles one seed and at most ten suggestions from Amazon's public all-departments completion
endpoint. No Ads credentials are needed for autocomplete. Keep only KEYWORD suggestions extending
the exact normalized seed; exclude self, duplicates and rewrites. Department aliases do not guarantee
Merch fit. Shared Jev judgments filter apparel relevance, including cached rejections from Ads mining.
Accepted new phrases become trials, not immediately recursive expansion seeds.

Autocomplete starts are spaced at least ten seconds using a durable reservation independent of Ads.
Jev capacity remains shared. A minute watchdog and dated followups recover work; failures back off,
429/5xx responses persist at least a minute of cooldown, and 403 pauses autocomplete for an hour.
Research reads remain database-only. No Keepa work is added. Normal operation calls each seed once;
a crash after an external response but before its database save can still cause a retry.

## Keyword popularity

SP-API standing is independent of paid Keepa admission. Score only the latest first-page active
known-Merch identities using current BSR fetched in the last seven days, not accumulated membership.
For rank `r`, strength is `clamp(log10(1,000,000/r), 0, 1)`.

- Product strength: 40% of the strongest plus 60% of the mean of the strongest five, zero-filled.
- Cap at 100. Missing/stale ranks preserve unknown standing; a real head with no Merch is negative
  fit evidence. One product at or below 100k scores 52; three such products score 76.

Hot is at least 75, warm at least 35, otherwise cold. Hot intervals are 1–7 days, warm 7–21,
cold 30–60. Meaningful page-one membership change halves the interval; quiet results increase it
by 50%, within bounds, with ±10% jitter. Promotions are immediate. Demotion requires two weak
observations and fourteen days from the first weak observation. Empty heads wait seven days,
then thirty on repeated emptiness. Deferrals/failures do not mark a keyword observed or quiet.

A bounded cursor scan refreshes standings from stored rank changes, promoting useful niches
without paying for another search. The scan never counts as a keyword observation or demotion.
Scores represent research priority, not estimated searches or sales.

## Trials and freshness

Jev-approved phrases receive trials. A head with Merch graduates to tracked; two heads without
Merch become dormant. Explicit user research tracks/reactivates directly. A durable claim counter
reserves one in five dispatch opportunities for trials and the rest for tracked checks, with unused
opportunities available to either. Target fairness and shared physical capacity bound actual work.

Two low-yield pages stop deeper exploration. Low yield cannot demote a known strong niche. Completed
passes revisit at the target's next check; unfinished continuations retain provider cursor, budget
retry and ownership rules. An expired continuation preserves old evidence and starts a new pass.

Operator collection status exposes completed mining counts and leading keyword scores, tiers and
intervals. Ads recommendations are advertising evidence, not organic ranking or verified volume.

## Keyword directory and activity

The Keywords page uses the Products layout: filter sidebar, search, paginated table and footer.
Its single status is Queued, Scanning or Up to date. Pending judgments, trial checks, expansion
and product acquisition remain internal stages rather than separate visible status columns.
Untracked keywords are hidden by default. Their reason comes from durable evidence: rejected
candidate (Not relevant), dormant after two failed trials (No Merch found), or no enabled target
(Not scheduled). An explicit user-tracked target takes precedence over an old model rejection.
No second mutable copy of these reasons is stored.

Clock/amber, spinner/blue, check/green and pause/muted badges distinguish queued, scanning,
up-to-date and untracked states; text remains visible and reduced motion disables the spinner.
The directory shares the Products DashboardTable background and fixed column layout. Data rows
are 40 pixels high; retry and untracked notes stay inline and truncate with a full-text tooltip. Popularity and check cadence remain separate.

The default ordering follows processing priority, without a separate customer-facing sort label: scanning, ready queued work, deferred work, up-to-date entries
by next check, then untracked. Ready product scans use the dispatcher's current trial/tracked
preference, normalized overdue score, last selection, target creation and target identity.
Other stages have independent workers, so there is no fixed global FIFO position. Pagination
carries the complete ordering, a fixed observation time and trial-turn snapshot; microsecond
creation/selection times are retained as exact epoch microseconds. Live state changes may reorder
rows. API callers can request sort=newest; cursors must be passed through unchanged.

Track keyword explicitly records user interest; typing in the filter does not schedule work.
The public directory get/search share this state and ordering with the dashboard.

Keyword events are written in the same transaction as their state change: candidate added,
keyword added, qualified, expanded, products mined (one per accepted page), and standing changed.
Retries do not duplicate completion events. Logs supports the keyword type filter and searches
keyword messages; details carry phrase, counts, page and status evidence. Job failures remain in
the existing job logs. The directory polls every ten seconds while open; Logs polls every five.

Brand Analytics reports, jobs, metrics, health checks, demand bonus and Search Terms page are retired.
Migration 0048 drops the three BA report tables and two catalog demand columns, and disables BA
source evidence. Canonical keywords, product membership, candidate judgments and Amazon search
runs remain. This migration is not applied to production until an explicitly requested deployment.

## Pause and resume

The Keywords page has one admin-only Pause sync / Resume sync control for the keyword-processing
pipeline. It controls the outer `process-keyword-sync` coordinator and its discovery, autocomplete,
Ads and Jev work. Existing Product refresh, history refresh and deliberate reads stay outside this
switch. Pausing does not disable tracked keywords or delete queued work.

`automatic_sync_control` persists the flag and actor. Migration 0049 seeds it paused; a missing row
also means paused. The initial deployment therefore does not start the new keyword backlog until
an admin resumes it. Already admitted requests may finish and save their response. Every provider
admission and child-work claim rechecks the flag. Admission transactions hold a shared control-row
lock, so Pause waits for any capacity reservations already in progress before acknowledging.

Resume preserves saved suggestions, judgments, cursors, backoffs and provider cooldowns. The minute
watchdog restarts the coordinator even if a resume response or wake is lost. Read-only status polling
is separate from the admin-only mutation. Real transitions produce keyword.sync.paused/resumed Logs
events transactionally; repeated requests for the same value do not duplicate events.
