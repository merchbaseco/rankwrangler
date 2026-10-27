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
2. `recommendationsSaved`: persist normalized recommendations in Ads order and ASIN-to-candidate
   links (with their Ads position) before requesting judgments. Globally duplicate phrases share one
   marketplace/normalized-term candidate. Two judgments follow, each its own durable stage:
   - global apparel fit, cached on the candidate and reused by every product and autocomplete seed;
   - per-product topical relevance against the product title, stored on that product's link only.
3. `complete`: every linked candidate has a fit verdict and every fit-accepted link has a relevance
   probability. Selection then marks at most five links (`selected`) and only those phrases receive
   `adsRecommendation` evidence. Empty and all-rejected recommendations also finish permanently.

Selection walks links in Ads order and keeps a phrase when it is fit-accepted and relevant (both
probabilities at least 0.8), skipping phrases whose topic words (ignoring apparel words, filler and
word order) repeat an earlier pick. Already-tracked phrases use slots too; a product with fewer good
distinct phrases selects fewer. Unselected links keep their probabilities as provenance. Relevance
is never a global rejection: a phrase irrelevant to one product stays fit-accepted for others. Five
is the starting default from the October selection probe (4.8 selected per product at five), not a
validated demand ranking; relevance probability is not popularity.

Neither title/rank updates nor later discoveries reset completed mining. A saved Ads response is
reused after Jev failure; saved judgments are reused across ASINs. Already tracked phrases do not
need a fit judgment, but still need product relevance. Jev answers independent Noul questions in
batches of up to 100. Each question carries its own phrase and full policy; questions that pointed
into a shared candidate array by index lost accuracy as batches grew (40/50 labeled cases at 25,
27/50 at 100, against 49/50 for the explicit form at every size in the October eval). Fit judgments
record `jev-1.13.0:merch-buyer-search-v2`; selections record `jev-1.13.0:product-relevance-v1` on the
mining row. Save probabilities and decisions, including rejections, in one batched write per
response. Provider errors never become successful empty observations. Earlier v1 verdicts are kept;
there is no automatic rejudging on version changes.

Claims use UUID fencing and five-minute leases. A saved stage does not intentionally repeat; the
external-response/database-save crash window can repeat a request. Recommendations, judgments,
acceptance and completion are separate durable stages, never synchronous work in a research read.

Ads starts are spaced at least ten seconds; Jev batches at least two seconds, shared durably across
workers. Each mining job makes one provider call (Ads, a fit batch or a relevance batch) and then
ends its job; see "Keyword jobs" below. A minute watchdog recovers lost wakes. Persist Retry-After/cooldown, and reserve before token/profile
work so a provider cooldown also prevents authentication traffic. Auth failures pause the provider
for an hour; per-product failures back off. These initial ceilings limit recursion; they are not a
claim about Amazon's quota or a promise to spend the allowance. Existing listing refresh and Keepa
capacity are separate. The Production `Amazon Ads API - RankWrangler` item supplies the Ads credentials through the
environment contract. It copies the same provider credential used by BidBeacon; coordinate rotation
of both items. The separate item does not issue a separate Amazon application or quota.

## Once-per-keyword autocomplete

Autocomplete expands enabled tracked US keywords once, separately from
recurring product discovery. Trials must first find Merch and graduate before becoming seeds.
`keyword_autocomplete`, keyed by canonical query, saves the response before judging and records
completion even for empty responses. Failed judgment resumes the saved response. The seed-to-candidate
join retains provenance. Completed seeds are never automatically expanded again.

Each autocomplete pass makes one provider call for one seed and keeps at most ten suggestions from Amazon's public all-departments completion
endpoint. The request uses Amazon’s desktop `www.amazon.com/suggestions` profile (`version=3`,
`site-variant=desktop`, `fb=1`, `lop=en_US`, and both WIDGET/KEYWORD suggestion types), without
copying browser session, request or keystroke identifiers. Widget payloads are ignored. No Ads
credentials are needed for autocomplete. Keep the endpoint’s native KEYWORD suggestions, including pluralization and words inserted inside
the phrase; exclude the seed itself and duplicates. Exact seed-prefix matching drops valid Amazon
suggestions. Strip stray trailing commas when recording search terms and requesting suggestions;
retain internal punctuation. Department aliases do not guarantee
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

Each discovery claim fetches one page. Due heads (a first head, or a recurring check that has come
due) are claimed ahead of continuing depth, except on every fourth claim, which prefers depth so
deep passes keep moving under a steady head load. Either kind borrows the other's unused turn. The
directory's processing order does not yet include this head/depth preference.

Two low-yield pages stop deeper exploration. Low yield cannot demote a known strong niche. Completed
passes revisit at the target's next check; unfinished continuations retain provider cursor, budget
retry and ownership rules. An expired continuation preserves old evidence and starts a new pass.

Operator collection status exposes completed mining counts and leading keyword scores, tiers and
intervals. Ads recommendations are advertising evidence, not organic ranking or verified volume.

## Keyword jobs

The pipeline follows [background jobs](../decisions/background-jobs.md): one job per external call,
one queue per provider, at most one queued-or-running job per entity.

| Job | Entity | Provider gate | What it does next |
| --- | --- | --- | --- |
| `schedule-keyword-work` | none, every minute | none | Enqueues due scans, saved responses awaiting Jev, and new sources while allowed |
| `scan-keyword` | keyword target | SP-API background capacity | Fetches one page; queues the next page of a continuing pass at depth priority |
| `recommend-product-keywords` | Product | Ads, ten-second spacing | Saves up to 100 Ads phrases, then queues `judge-keywords` for the Product |
| `autocomplete-keyword` | tracked seed | autocomplete, ten-second spacing | Saves up to ten suggestions, then queues `judge-keywords` for the seed |
| `judge-keywords` | Product or seed | Jev, two-second spacing | Sends one fit or relevance batch; requeues itself until selection finishes |

A gated queue fetches its next job only once its provider can start, so waiting work stays visible
in the queue. Scan jobs for due heads carry priority 1 and deeper pages priority 0; within a priority
the oldest waits least. The scheduler raises depth jobs waiting six hours to head priority, well
before an SP-API continuation cursor expires at a day, so depth cannot starve behind heads. A provider wait or lost reservation re-sends the same job for the provider's
ready time instead of failing it. Pause stops the scheduler and every gated fetch; a running job
finishes saving. Claims and leases still guard each entity, so a lost or duplicate job repeats no
saved stage.

Mining and autocomplete are the producers of scan work. The scheduler tops their queues up to
thirty jobs (about five minutes of starts) only while the estimated scan backlog is within two days
of productive background SP-API capacity; saved responses are always judged. The backlog estimate
counts five pages for a keyword with no first head, the remaining planned depth of a continuing pass
(at least one page) and one page per due recurring head. Capacity is the current background rate
times 86,400 times 0.7. The 70% share, five-page allowance and two-day threshold are planning
assumptions from the October capacity model, not measured throughput. Unmined cold and unranked
products wait behind ranked ones but are never excluded.

Settings → Keyword Jobs shows pause state, scan backlog against its allowance, each queue's waiting,
scheduled and running jobs with its provider's readiness, and recent runs. It refreshes when a job
run is recorded (`job_activity` over the existing WebSocket), never on an interval. Runs are recorded
when they did work or failed; empty or waiting runs are not.

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
the existing job logs. Directory rows, sync control and activity entries each have a dedicated
tRPC WebSocket subscription and React listener hook; none polls. Directory notifications contain
only changed terms. The client batches targeted row reads, patches matching cached rows and
reorders them inside the loaded window. New arrivals cannot grow that window without bound;
when they displace rows, pagination rewinds rather than skipping the displaced rows. Reconnect
reconciles the loaded directory once. See [Realtime events](realtime-events.md).

Brand Analytics reports, jobs, metrics, health checks, demand bonus and Search Terms page are retired.
Migration 0048 drops the three BA report tables and two catalog demand columns, and disables BA
source evidence. Canonical keywords, product membership, candidate judgments and Amazon search
runs remain. This migration is not applied to production until an explicitly requested deployment.

## Pause and resume

The Keywords page has one admin-only Pause sync / Resume sync control for the keyword-processing
pipeline. It controls the keyword scheduler and the four gated keyword queues: discovery,
autocomplete, Ads and Jev work. Existing Product refresh, history refresh and deliberate reads stay outside this
switch. Pausing does not disable tracked keywords or delete queued work.

`automatic_sync_control` persists the flag and actor. Migration 0049 seeds it paused; a missing row
also means paused. The initial deployment therefore does not start the new keyword backlog until
an admin resumes it. Already admitted requests may finish and save their response. Every provider
admission and child-work claim rechecks the flag. Admission transactions hold a shared control-row
lock, so Pause waits for any capacity reservations already in progress before acknowledging.

Resume preserves saved suggestions, judgments, cursors, backoffs and provider cooldowns. Queued
jobs stay queued while paused; gated workers resume fetching within ten seconds and the scheduler
on its next minute. Read-only status and
its dedicated WebSocket event are separate from the admin-only mutation. Real transitions produce keyword.sync.paused/resumed Logs
events transactionally; repeated requests for the same value do not duplicate events.
