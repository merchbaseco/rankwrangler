---
summary: Keyword-driven collection from weekly Brand Analytics search terms, admission by a real first-page SP-API search, autocomplete expansion and popularity-driven keyword checks.
read_when:
  - changing keyword sources, the Brand Analytics import, trial admission or tracked-keyword registration
  - changing keyword popularity, cadence, scan depth, dormancy, backlog bounds or provider pacing
---

# Keyword collection

Keywords come from what Amazon shoppers actually search, not from guesses about each product. A
weekly Brand Analytics import supplies real search terms; a term that plausibly sells Merch becomes
a trial; one real SP-API search of its first page decides whether it is tracked. Products join a
keyword only by appearing in its scanned results (`keyword_products`).

This replaced per-product mining (Amazon Ads `KEYWORDS_FOR_ASINS` plus Jev fit and relevance
judgments). An October eval against the owner's real Amazon ad search-term data showed invented
per-product phrases were the wrong direction, so the Ads and Jev keyword paths were deleted.

User searches directly track normalized keywords. Product search records the exact supplied phrase;
explicit keyword-results reads register the same identity. The extension records the Amazon US
`k` search term once per content-page mount by calling Product search with limit one, using its
existing authenticated client. This incurs one ordinary search usage debit and no provider fanout.
ASIN-only lookups do not create keyword searches. Product tags do not participate. User-tracked
keywords bypass trials.

## Weekly Brand Analytics import

`import-brand-analytics` requests `GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT` (`reportPeriod` WEEK,
US marketplace) for the latest complete Sunday–Saturday week, two days after it ends to give
Amazon time to publish. Only the latest week is imported; an older unfinished week is superseded.
`brand_analytics_imports` holds one row per week as a durable state machine, and each job runs one
step with one provider call:

1. `pending`: create the report and record its id (`requested`).
2. `requested`: read its status every two minutes. `DONE` records the document (`ready`);
   `IN_QUEUE`/`IN_PROGRESS` waits; `CANCELLED` (usually not yet published) or `FATAL` requests the
   week again after six hours, doubling to two days.
3. `ready`: download the GZIP JSON document, aggregate it while streaming and save (`imported`).
   A failing download backs off from ten minutes to six hours; three failures request it afresh.

The scheduler enqueues the step that is due; a 90-minute claim lease fences overlapping runs.
Report generation took one to ten minutes in the POC.

The document is one JSON object whose `dataByDepartmentAndSearchTerm` array has one row per search
term and top-3 clicked ASIN (about 8.8M rows and 2.95M terms a week for the US). Parsing it whole
exhausts a 2 GB heap, so `readBrandAnalyticsRows` scans the text stream and parses one row object at
a time; the accumulator keeps only the current term's rows and the kept terms. A term is kept when
at least one of its top-3 clicked item titles matches the apparel pattern
(`t-shirt`, `tee`, `shirt`, `hoodie`, `sweatshirt`, `tank top`, `raglan`, `pullover`, `crewneck`,
`v-neck`). In the eval this kept about 197k terms and 83% of the owner's real clicked-search
volume, and correctly dropped terms such as "halloween makeup" and "christmas lights". There is no
keyword-level official-brand filter: the verified official-brand registry applies to Product
brands, not search phrases.

`brand_analytics_search_terms` keeps one row per marketplace and normalized term (normalized like
canonical keywords): latest search frequency rank, apparel clicks, up to three clicked ASINs, first
and last seen week (the rank is from the last seen week) and when it was registered as a trial.
Imports upsert; no weekly snapshot history is stored (the retired design kept about 10M rows and
4 GB). The import row records rows, terms, kept terms and terms new to the table.

## Trials and admission

While the scan backlog is within bounds, the scheduler registers up to 500 unregistered kept terms
a minute, most searched first, through the canonical keyword and discovery-evidence path with
eligible `brandAnalytics` evidence (`week:<sunday>`). Existing keywords only gain the evidence: a
tracked keyword stays tracked and a dormant one stays dormant. Due trial heads are listed most
searched first.

A trial's first-page head scan decides admission. At least `MIN_MERCH_ON_FIRST_PAGE` (3) confirmed
active Merch listings on page one graduates it to tracked; otherwise it counts a failure, and two
heads without enough Merch make it dormant. Three is a starting point, to be calibrated from real
first-page scans. No model judges keyword fit.

## Autocomplete

Autocomplete expands enabled tracked US keywords once. Trials must graduate before becoming seeds.
Each pass makes one call for one seed and keeps at most ten suggestions from Amazon's public
all-departments completion endpoint, using Amazon's desktop `www.amazon.com/suggestions` profile
(`version=3`, `site-variant=desktop`, `fb=1`, `lop=en_US`, both WIDGET/KEYWORD suggestion types)
without browser session, request or keystroke identifiers. Widget payloads are ignored. Native
KEYWORD suggestions are kept, including pluralization and inserted words; the seed itself and
duplicates are excluded, and stray trailing commas are stripped.

Suggestions become trials directly, with `autocomplete` evidence naming the seed, in the same
transaction that saves them on `keyword_autocomplete` and completes the seed. The first-page check
decides each one. Completed seeds are never expanded again, and new trials are not recursive seeds.

Autocomplete has durable pacing in `keyword_mining_capacity` (the table keeps its earlier name):
ten seconds between starts at base; each 429 or 5xx doubles the spacing (to at most fifteen
minutes) and waits the longer of Retry-After and a backoff of one minute doubling to thirty; each
success clears the streak and eases spacing 10% toward base. 403 pauses it for an hour. A daily
ceiling (`daily_limit`, 1,000 by default, UTC day) applies. Failures back off per seed.

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

## Scan depth and freshness

A durable claim counter reserves one in five dispatch opportunities for trials and the rest for
tracked checks, with unused opportunities available to either. Each discovery claim fetches one
page. Due heads (a first head, or a recurring check that has come due) are claimed ahead of
continuing depth, except on every fourth claim, which prefers depth so deep passes keep moving
under a steady head load. Either kind borrows the other's unused turn.

Brand Analytics popularity sets a pass's page limit: rank up to 100k gets ten pages, up to 1M five,
anything rarer three. Keywords Amazon does not rank keep ten (`passPageLimit`). Two consecutive
pages that each add fewer than three Merch products new to the whole catalog also stop the pass;
later passes restart from the first page. Novelty is catalog-wide, so a pass stops paying for
pages of products already stored. Low yield cannot demote a strong niche. An expired continuation
preserves old evidence and starts a new pass.

## Keyword jobs

The pipeline follows [background jobs](../decisions/background-jobs.md): one job per external call,
one queue per provider, at most one queued-or-running job per entity.

| Job | Entity | Provider gate | What it does next |
| --- | --- | --- | --- |
| `schedule-keyword-work` | none, every minute | none | Enqueues due scans and the due import step; registers trials and seeds while backlog allows |
| `scan-keyword` | keyword target | SP-API background capacity | Fetches one page; queues the next page of a continuing pass at depth priority |
| `autocomplete-keyword` | tracked seed | autocomplete spacing | Saves up to ten suggestions as trials and completes the seed |
| `import-brand-analytics` | weekly import | SP-API Reports limiter | Requests, checks, or downloads and saves one week's report |

A gated queue fetches its next job only once its provider can start, so waiting work stays visible
in the queue. Scan jobs for due heads carry priority 1 and deeper pages priority 0; within a
priority the oldest waits least. The scheduler raises depth jobs waiting six hours to head
priority, well before an SP-API continuation cursor expires at a day. A provider wait or lost
reservation re-sends the same job for the provider's ready time instead of failing it. Claims and
leases still guard each entity, so a lost or duplicate job repeats no saved stage. The import job
may run up to an hour, the time a weekly download and aggregation can take.

Background keyword scans may use 75% of the measured SP-API Catalog rate, up to
`spapi_catalog_capacity.background_max_rps` (0.5 by default); raising that value speeds scanning
without a deploy.

Brand Analytics trials are the main producer of scan work, with autocomplete second. Both are
admitted only while the estimated scan backlog is within two days of productive background SP-API
capacity; autocomplete is topped up to thirty queued seeds (about five minutes of starts). The
backlog estimate counts five pages for a keyword with no first head, the remaining planned depth of
a continuing pass (at least one page) and one page per due recurring head. Capacity is the current
background rate times 86,400 times 0.7. The 70% share, five-page allowance and two-day threshold are
planning assumptions, not measured throughput.

Settings → Keyword Jobs shows pause state, scan backlog against its allowance, the Brand Analytics
import (last imported week, kept terms, new terms in the last import, terms awaiting trial and the
latest report state), each queue's waiting, scheduled and running jobs with its provider's
readiness, and recent runs. It refreshes when a job run is recorded (`job_activity` over the
existing WebSocket), never on an interval. Runs are recorded when they did work or failed.

## Keyword directory and activity

The Keywords page uses the Products layout: filter sidebar, search, paginated table and footer.
Its single status is Queued, Scanning or Up to date. Up to date means the keyword's first page is
fresh: deeper pages of a continuing pass and its one-time autocomplete expansion run in the
background without holding it in Queued. Trial checks, expansion and product acquisition remain
internal stages rather than separate visible status columns. Untracked keywords are hidden by
default. Their reason comes from durable state: dormant after two failed trials (No Merch found) or
no enabled target (Not scheduled). No second mutable copy of these reasons is stored. The
popularity column shows standing tier, score and, when Amazon ranks the term, its Brand Analytics
search frequency rank.

Clock/amber, spinner/blue, check/green and pause/muted badges distinguish queued, scanning,
up-to-date and untracked states; text remains visible and reduced motion disables the spinner.
The directory shares the Products DashboardTable background and fixed column layout. Data rows
are 40 pixels high; retry and untracked notes stay inline and truncate with a full-text tooltip.

The default ordering follows processing priority, without a separate customer-facing sort label:
scanning, ready queued work, deferred work, up-to-date entries by next check, then untracked.
Ready product scans use the dispatcher's current trial/tracked preference, normalized overdue
score, last selection, target creation and target identity. Other stages have independent workers,
so there is no fixed global FIFO position. Pagination carries the complete ordering, a fixed
observation time and trial-turn snapshot; microsecond creation/selection times are retained as
exact epoch microseconds. Live state changes may reorder rows. API callers can request
sort=newest; cursors must be passed through unchanged.

Track keyword explicitly records user interest; typing in the filter does not schedule work.
The public directory get/search share this state and ordering with the dashboard.

Keyword events are written in the same transaction as their state change: keyword added, tracking
changed, expanded, products mined (one per accepted page) and standing changed. Retries do not
duplicate completion events. Logs supports the keyword type filter and searches keyword messages;
details carry phrase, counts, page and status evidence. Job failures remain in the existing job
logs. Directory rows, sync control and activity entries each have a dedicated tRPC WebSocket
subscription and React listener hook; none polls. Directory notifications contain only changed
terms. The client batches targeted row reads, patches matching cached rows and reorders them inside
the loaded window. New arrivals cannot grow that window without bound; when they displace rows,
pagination rewinds rather than skipping the displaced rows. Reconnect reconciles the loaded
directory once. See [Realtime events](realtime-events.md).

## Pause and resume

The Keywords page has one admin-only Pause sync / Resume sync control for the keyword pipeline. It
controls the keyword scheduler (scans, trial registration, autocomplete and the Brand Analytics
import), the gated scan and autocomplete queues, and import claims. Existing Product refresh,
history refresh and deliberate reads stay outside this switch. Pausing does not disable tracked
keywords or delete queued work.

`automatic_sync_control` persists the flag and actor; a missing row also means paused. Already
admitted requests may finish and save their response. Every provider admission and child-work claim
rechecks the flag. Admission transactions hold a shared control-row lock, so Pause waits for any
capacity reservations already in progress before acknowledging.

Resume preserves saved suggestions, cursors, backoffs, import state and provider cooldowns. Queued
jobs stay queued while paused; gated workers resume fetching within ten seconds and the scheduler
on its next minute. Read-only status and its dedicated WebSocket event are separate from the
admin-only mutation. Real transitions produce keyword.sync.paused/resumed Logs events
transactionally; repeated requests for the same value do not duplicate events.
