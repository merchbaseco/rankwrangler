---
summary: Keyword-driven collection from weekly Brand Analytics search terms, keyword prefixes, admission by a real first-page SP-API search, autocomplete expansion and popularity-driven keyword checks.
read_when:
  - changing keyword sources, the Brand Analytics import, trial admission or tracked-keyword registration
  - changing keyword prefixes, prefix extraction or prefix autocomplete
  - changing keyword popularity, cadence, scan depth, dormancy, autocomplete top-up or provider pacing
---

# Keyword collection

Keywords come from what Amazon shoppers actually search, not from guesses about each product. A
weekly Brand Analytics import supplies real search terms; a term that plausibly sells Merch becomes
a trial; one real SP-API search of its first page decides whether it is tracked. Products join a
keyword only by appearing in its scanned results (`keyword_products`).

Scans store Merch and unknown Products only. A result classified non-Merch is written only when the
Product already exists (it is still refreshed); otherwise it is skipped, so keyword collection does
not fill the catalog with other sellers' listings. Skipped results still count toward the page's
result count, its non-Merch count and its page fingerprint (sorted ASINs, used to detect a provider
repeating a page), so admission, standing and novelty see the whole page.

This replaced per-product mining (Amazon Ads `KEYWORDS_FOR_ASINS` plus Jev fit and relevance
judgments). An October eval against the owner's real Amazon ad search-term data showed invented
per-product phrases were the wrong direction, so the Ads and Jev keyword paths were deleted.

User searches directly track normalized keywords. Product search records the exact supplied phrase
on its first page; explicit keyword-results reads register the same identity. The dashboard's
live as-you-type search reads with `recordInterest: false` and records a phrase only when the
person submits it (⏎ in the banner search, or Track), so typed prefixes never become keywords. The extension records the Amazon US
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

Each unfinished step queues the job again for its next time; a saved week queues keyword listing.
A failed step stops the chain until its backoff passes and the six-hourly check restarts it. A
90-minute claim lease fences overlapping runs.
Report generation took one to ten minutes in the POC.

The document is one JSON object whose `dataByDepartmentAndSearchTerm` array has one row per search
term and top-3 clicked ASIN (about 8.8M rows and 2.95M terms a week for the US). Parsing it whole
exhausts a 2 GB heap, so `readBrandAnalyticsRows` scans the text stream and parses one row object at
a time; the accumulator keeps only the current term's rows and the kept terms. A term is kept for
either of two reasons:

- **Apparel click.** At least one of its top-3 clicked item titles matches the apparel pattern
  (`t-shirt`, `tee`, `shirt`, `hoodie`, `sweatshirt`, `tank top`, `raglan`, `pullover`, `crewneck`,
  `v-neck`). In the eval this kept about 197k terms and 83% of the owner's real clicked-search
  volume, and correctly dropped terms such as "halloween makeup" and "christmas lights". These terms
  become trials directly.
- **Merch product text.** The search text itself ends with a Merch product name
  (`merchProductTermKind`, see [Keyword prefixes](#keyword-prefixes)), such as "teacher blanket" or
  "christmas mugs". These terms become trials only once their prefix is a registered prefix.

Widening the clicked-title pattern to every Merch product type was tried and measured on a real
week: ordinary brands sell mugs, cases, bags and pens, so it admitted searches such as "diamond
tester", "glp1", "iphone 16 case", "umbrella" and "storage bin". Titles cannot tell a Merch blanket
from any other blanket, so the clicked-title filter stays apparel-only and other product types come
through prefixes. Product-text terms add roughly as many kept terms again (generic searches ending in
"case", "bag", "cup" or "bottle" are common); only kept terms are held in memory and they are
upserted 1,000 per statement. There is no
keyword-level official-brand filter: the verified official-brand registry applies to Product
brands, not search phrases.

`brand_analytics_search_terms` keeps one row per marketplace and normalized term (normalized like
canonical keywords): latest search frequency rank, apparel clicks (0–3), whether the text names a
Merch product (`merch_product_text`), its prefix, up to three clicked ASINs, first and last seen
week (the rank is from the last seen week) and when it was registered as a trial. A row has an
apparel click or product text, or both.
Imports upsert; no weekly snapshot history is stored (the retired design kept about 10M rows and
4 GB). The import row records rows, terms, kept terms and terms new to the table.

## Trials and admission

After a week is saved, `register-brand-analytics-keywords` lists unregistered kept terms as trial
keywords, 2,000 per job, most searched first, queueing itself until none remain. A term with an
apparel click always qualifies; a product-text term qualifies when its stored prefix has a
`keyword_prefixes` row (a join on the prefix, indexed over unregistered product-text rows). Product-text
terms whose prefix is not known yet simply wait: the six-hourly nudge lists them as soon as a keyword
of that prefix is tracked. Listing ignores
Pause sync, so new searches appear in the Keywords directory as Queued soon after an import.
Registration goes through the canonical keyword and discovery-evidence path with
eligible `brandAnalytics` evidence (`week:<sunday>`). Existing keywords only gain the evidence: a
tracked keyword stays tracked and a dropped one stays dropped. Due trial heads are listed most
searched first.

A trial's first-page head scan decides admission. At least `MIN_MERCH_ON_FIRST_PAGE` (3) confirmed
active Merch listings on page one graduates it to tracked; anything less drops it. One check decides:
a keyword with real Merch demand shows it right away, so a dropped keyword is never re-checked on a
schedule. Three is a starting point, to be calibrated from real first-page scans. No model judges
keyword fit.

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

## Keyword prefixes

A prefix broadens a keyword's specificity: it is the search with its Merch product and its audience
or filler words removed (`extractKeywordPrefix`, deterministic, no model). "teacher shirts for
women" and "teacher blanket" are both "teacher"; "funny pickleball dad shirt" is "pickleball dad".
Autocomplete then expands the prefix back out into specific searches on other Merch products. A
tracked keyword proves its prefix sells as Merch, so the prefix vouches for searches of the same
prefix on any of the 41 Merch product types.

Extraction lowercases the term, turns hyphens and other punctuation into spaces (keeping internal
apostrophes, and reading "1/4" as "quarter"), then:

1. drops trailing filler words;
2. drops at most one Merch product phrase at the end, longest first;
3. drops filler words at either end.

The prefix is null when fewer than two characters remain or what remains is itself a product phrase.
A product word inside a prefix survives ("hat trick hockey shirt" is "hat trick hockey", "cat in the
hat shirt" is "cat in the hat"). `merchProductTermKind` uses the same steps and reports which
product family the trailing phrase names (apparel, headwear, bag, phone accessory, home, drinkware,
stationery), or null.

- **Product phrases** (each also plural): shirt, t shirt, tshirt, tee shirt, tee, tank, tank top,
  top, crop top, raglan, jersey, baseball/soccer/basketball jersey, sweatshirt, crop sweatshirt,
  crewneck, crew neck, v neck, hoodie, hoody, pullover, pullover hoodie, zip hoodie, zip up hoodie,
  zip up, zip, polo, polo shirt, quarter zip, quarter zip pullover, jacket, softshell jacket, long
  sleeve, long sleeve shirt, long sleeve t shirt; hat, cap, baseball cap, baseball hat, trucker hat,
  dad hat, snapback, visor, sun visor; backpack, tote, tote bag, bag, crossbody, crossbody bag,
  cross body bag, laptop sleeve, laptop case; popsocket, pop socket, popgrip, pop grip, phone grip,
  phone case, iphone case, case; mouse pad, mousepad, pillow, throw pillow, pillow case, pillow
  cover, throw pillow cover, blanket, throw blanket, throw, poster; tumbler, travel tumbler, mug,
  coffee mug, travel mug, cup, coffee cup, water bottle, bottle; journal, notebook, pen.
- **Filler words**: a, an, and, of, the, to, for, with, women, womens, women's, men, mens, men's,
  ladies, kids, kid, kid's, boys, boy's, girls, girl's, toddler(s), youth, adult(s), unisex, funny,
  cute, cool, gift(s), idea(s), novelty, graphic. Style words such as "vintage" and "retro" stay.

`keyword_prefixes` holds one row per US prefix with the tracked keyword it first came from. A prefix is
registered in the same transaction that makes a keyword tracked: a trial graduating on its first
page, or user interest tracking it. Keywords tracked before prefixes existed are backfilled by the
keyword scheduler, 2,000 tracked targets per minute by a creation-order cursor (`discovery_source_scans`
key `keyword-prefixes`); once caught up it looks again daily. The backfill is database-only and runs
even while sync is paused.

### Prefix autocomplete

Each prefix is expanded once through the same Amazon autocomplete call, with the prefix text as the
seed. A suggestion is kept when it names a Merch product and its own prefix equals or contains the
seed prefix as whole words ("teacher" keeps "teacher tumbler" and "teacher bags for women", not
"teacher gifts" or "preacher shirt"). Kept suggestions become trials with `prefixAutocomplete`
evidence whose source key is the prefix, in the transaction that saves all suggestions and completes
the prefix. Prefix expansion shares the `autocomplete-keyword` queue, its gate, pacing and daily
ceiling, and Pause sync; the scheduler fills its thirty-job top-up alternately with tracked-keyword
seeds and prefixes.

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

`head_product_ids` stores the page-one active Merch head in provider placement order, so the
first ten are the keyword's shelf. `keyword_standing_observations` keeps score history: one
`search` row per page-one observation, and one `storedRanks` row only when the cursor scan changes
the score. Rows are small and grow with check cadence (hot keywords at most daily); no pruning job
exists yet. When volume warrants it, prune rows older than a year, keeping the weekly trend.

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
| `schedule-brand-analytics` | none, every six hours | none | Starts the newest week's import when due and nudges keyword listing; ignores Pause sync |
| `schedule-keyword-work` | none, every minute | none | Backfills keyword prefixes; while sync runs, enqueues due scans and tops up autocomplete seeds and prefixes |
| `scan-keyword` | keyword target | SP-API background capacity | Fetches one page; queues the next page of a continuing pass at depth priority |
| `autocomplete-keyword` | tracked seed or prefix | autocomplete spacing | Saves up to ten suggestions (for a prefix, those naming a Merch product) as trials and completes the seed or prefix |
| `import-brand-analytics` | weekly import | always open | Requests, checks (every two minutes) or downloads and saves one week's report; queues its own next step, then keyword listing |
| `register-brand-analytics-keywords` | none (one chain) | always open | Lists 2,000 kept terms as trial keywords; queues itself while a full batch was listed |

A gated queue fetches its next job only once its provider can start, so waiting work stays visible
in the queue. Due re-checks of graduated keywords carry priority 2, trial keywords' qualifying first pages
priority 1 and deeper pages priority 0, so a backlog of trials never delays keeping graduated
keywords fresh; within a priority the oldest waits least. The scheduler raises depth jobs waiting
six hours to trial-head priority, well before an SP-API continuation cursor expires at a day. A provider wait or lost
reservation re-sends the same job for the provider's ready time instead of failing it. Claims and
leases still guard each entity, so a lost or duplicate job repeats no saved stage. The import job
may run up to an hour, the time a weekly download and aggregation can take.

Background keyword scans may use 75% of the measured SP-API Catalog rate, up to
`spapi_catalog_capacity.background_max_rps` (0.5 by default); raising that value speeds scanning
without a deploy.

Listed Brand Analytics trials are the main source of due scans; scans themselves run at the
background SP-API rate in work order. Expansion is not held back by scan load or a compute-time
budget: autocomplete seeds and prefixes are enqueued whenever they are due, and the scan queue is
allowed to grow. Autocomplete keeps its own pacing and daily ceiling, and the scheduler only tops its
queue up to thirty jobs (about five minutes of starts) so it never floods.

Job runs are recorded in `job_executions` when they did work or failed.

## Keyword directory and activity

The Keywords page (`/keywords`, `apps/website/src/features/keywords/`) has a top-bar search, a KPI
band, a filter sidebar and a paged table with server sorts (score, median BSR, fresh, Merch).
Each keyword shows two separate dimensions, both derived from durable state with no stored copy:

- **Stage** says whether the keyword is worth tracking. `trial` awaits or is undergoing its
  first-page qualification check; `graduated` is tracked (it passed, or a user asked for it);
  `dropped` is a trial whose first page had too little Merch (shown as not enough Merch on page 1);
  `untracked` is a stored query with no enabled keyword target, such as a brand-only scope.
- **Freshness** says whether our data is current. `live` means the first page is fresh: deeper
  pages of a continuing pass and the one-time autocomplete expansion run in the background without
  holding it back. `needsSync` means the next check is due or the head was never observed.
  `syncing` means a scan or expansion is claimed now. Trials only ever need or undergo their
  check, so the page reads them as Awaiting check and Checking. Dropped and untracked keywords have
  no freshness, interval or next check.

The grid opens on Graduated keywords. The sidebar filters stage (Graduated, Trial, Dropped, plus
Untracked while any exist; no stage box means every stage), freshness, heat, the Elite shelf and
Merch results, each with counts from `keyword.directoryFacets`. The Needs sync KPI shows the
needing-sync and syncing counts, and its tooltip how many trials await their check. Counts follow
directory events. The Score column's tooltip adds the Brand Analytics search frequency rank when
Amazon ranks the term; an unscored trial shows that rank in place of the score.

The Status column reads a graduated keyword's freshness: green dot Live (with time since the last
check), grey dot Needs sync, accent spinner Syncing. Trials read Awaiting check or Checking, and
dropped and untracked keywords a hollow dot with why. Text remains visible and reduced motion
disables the spinner. Track appears for dropped and untracked keywords; tracking records interest,
which schedules the keyword again.

The default ordering is a work view without a separate customer-facing sort label: graduated
keywords first (syncing, then needing sync by due time, then live by next check), then trials by
Brand Analytics rank with unranked trials last (their admission order), then dropped and untracked
keywords newest first. Ties fall back to target creation and target identity, matching the
dispatcher. Workers run independently, so this is a priority view rather than a fixed FIFO
position. Pagination carries the complete ordering and a fixed observation time; microsecond
creation times are retained as exact epoch microseconds. Live state changes may reorder rows. API
callers can request sort=newest; cursors must be passed through unchanged.

The dashboard directory also sorts by score, shelf median BSR, fresh shelf count (first available
within 60 days) or Merch count, and filters by the dominant facet value across the keyword's
retained Products. Each row adds the shelf (ASIN, rank, thumbnail, stored short name, first
available), median BSR, fresh count, dominant facet, seven-day score delta and twelve weekly score
points read from score history. These are dashboard-only; public keyword get/search keep the base
input and row shape.

The dashboard directory's sidebar filters are unions (empty means any): `heat` (Hot, Warm,
Cold), `stage` and `freshness` (replacing the public single values), plus `shelfElite` (the shelf
holds a Product at BSR ≤2,500, or not) and `merch` (any retained active Merch, or none). `page` with
`pageSize` reads by offset and ignores the cursor; every page carries `total` from a window count
over the filtered rows. `api.app.keyword.directoryFacets` takes the same filters and returns the
sidebar counts and KPI band in one aggregate over the same directory source: each group counted
under the other filters but not its own, a 20-bucket score histogram (bucket heat follows the
75/35 score thresholds), keywords checked within 24 hours, the median of shelf median BSRs, and
the needing-sync and syncing counts (freshness counts, so they hold under a freshness filter). It computes
the shelf lateral for every keyword (at most ten head Products each, by primary key). A result is
fresh per filter for 15 seconds; for ten minutes after that it is served at once while one
background read replaces it. Discovery sources are display-only, so the page read fetches them for
its returned rows only.

Track keyword explicitly records user interest; typing in the filter does not schedule work.
The public directory get/search share stage, freshness and ordering with the dashboard; get reads
a keyword in any stage.

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

System Status (`/status`, the Keywords section) has the one admin-only Pause / Resume control for
the keyword pipeline. It
controls refresh work only: the keyword scheduler (due scans and autocomplete seeds) and the gated
scan and autocomplete queues. The weekly Brand Analytics import and keyword listing always run,
because they are free and spend no scan capacity; paused, new keywords simply wait in Queued.
Existing Product refresh, history refresh and deliberate reads also stay outside this switch. Pausing does not disable tracked
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
