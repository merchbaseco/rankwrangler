# What Resume will do, how long it takes, and what it costs

Measured October 26, 2026 (artifacts timestamped October 27 UTC). Production remains paused.
This is a capacity study and a proposed implementation direction, not a deployed scheduler change.

The follow-up [five/ten-keyword study](capped-keyword-capacity-model.md) supersedes the unlimited
admission assumptions below for proposed implementation. The original measurements remain intact.


The service is affordable on the current stack. The main constraint is **which work gets processed
first**, not Jev's bill. Increasing Jev's batch size alone hardly changes full-catalog coverage time.
The initial discovery graph is growing strongly; slower refresh schedules do not bound that first pass.

## What happens when you click Resume today

Resume preserves the durable queue and clears its pause flag. The minute watchdog can take up to
about a minute to start the coordinator; the observed first wake took 39 seconds. Each pass:

1. Claims a due keyword exploration and fetches pages until the provider budget, low-yield stop,
   source end or five-page job bound makes it yield. The one-token background bucket normally
   prevents back-to-back pages, so this frequently means one page before deferral.
2. Expands one eligible tracked seed through autocomplete and judges its uncached suggestions.
3. Mines one eligible ASIN: saves up to 100 Ads suggestions once and judges up to two batches of
   25. Already-saved suggestions and globally settled phrases are reused on later visits.
4. Saves progress, admits finished parents' accepted phrases as trials, then waits at least ten
   seconds after the pass. New verified Merch products join the ASIN mining frontier.

These stages share a coordinator, not a literal single FIFO. Provider cooldowns and unfinished
parents can alter the order. The pause flag is checked at claims and provider admission; already
admitted calls may finish saving. Existing product/history refresh continues separately. Our sample
calls used isolated read-only probes, so they did not resume any of these production stages.

## Observed production backlog

Read-only snapshot at 01:21 UTC, using the production container's existing credentials:

| Item | Count |
| --- | ---: |
| Stored US products | 15,121 |
| Active confirmed Merch products | 6,878 |
| Eligible products not yet fully keyword-mined | 6,669 |
| Eligible products ranked below 1M | 490 |
| Eligible products above 1M / missing rank | 4,376 / 1,803 |
| Enabled tracked keywords, all awaiting first observation | 15 |
| Existing candidates: pending / accepted / rejected | 50 / 15 / 35 |

The current miner prioritizes strong BSR, but eventually mines every eligible product, including
cold and unranked listings. Exact official-brand exclusions currently cover Disney, Marvel,
STAR WARS and DC Comics; this is an incomplete registry, not a general licensed-design classifier.

One successful production coordinator pass took **13.956 seconds**, followed by the configured
10-second continuation delay. It performed an empty autocomplete expansion, one Ads recommendation
request and two Jev calls of 25; discovery deferred for capacity. The two Jev starts were 3.716 seconds
apart. API latency accounts for only a small part of this pass; claims, persistence and other work
also matter. This is one observation, not a sustained throughput benchmark.

## Jev: tested 5, 25, 50 and 100

Same shuffled 100 cases: 50 hand-labeled clear apparel/non-apparel cases and 50 real Ads suggestions.
Five interleaved repetitions per batch size, pinned production model `jev-1.13.0`, threshold 0.8.
The 50 real suggestions are decision-consistency probes, not additional ground-truth labels.

| Keywords/request | Existing prompt: correct out of 50 | Explicit-phrase prompt: correct out of 50 | Revised input tokens per 100 keywords |
| --- | --- | --- | ---: |
| 5 | 49–50 | 49 | 20,386 |
| 25 | 40–42 | 49 | 16,082 |
| 50 | 33–34 | 49 | 15,544 |
| 100 | 27 | 49 | 15,275 |

All 5/25/50/100 requests succeeded. The failure was semantic: each original question points into
`candidates[index].phrase` in a large shared array. Moving the actual phrase into its question,
with only marketplace in shared state, removes the observed size-dependent collapse. The remaining
revised-prompt miss, “nope not today cat shirt,” was consistent across sizes. Do not interpret this
small fixture's 98% as population-wide accuracy. An additional five revised 100-case runs agreed.

A shared-policy alternative used only 5,213 tokens per 100, but scored 48/50. Prefer the explicit
phrase plus full per-question policy for now. That is 11.4% fewer tokens than the existing 25-case
prompt and four times fewer requests for full batches. Compared with revised batches of 25, the
additional token saving from 100 is only 5%.

TypeSafe documents no question-count cap beyond the 64k/request and 32k/question context limits;
100 revised questions used about 15.3k input tokens. It specifically documents indirection and
irrelevant shared state as Jev 1.13 weaknesses. Organization TPS/RPS limits still apply; this test
used the current two-second request-start spacing, with no Jev errors.
[Models and pricing](https://docs.typesafe.ai/models),
[Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

**Recommendation:** revised prompt, up to 100 independent judgments per request, a new recorded
judge version, and one pooled claim/persistence batch. Preserve existing settled judgments unless
we deliberately choose a separate correction pass. “Select winners” still means one independent
probability per candidate, not asking Jev to generate a shortlist.

## What the bounded provider samples found

- **27 ASINs**, spanning rank bands, two licensed controls and eight shirts from one Hawaiian
  Christmas niche, each returned 100 Ads recommendations: 2,700 raw, **2,142 unique phrases**.
- Excluding the two licensed controls leaves **25 ASINs / 1,965 unique phrases**. Revised Jev accepted
  **864 / 1,965 (44.0%)** as coherent apparel searches. This measures model admission, not demand.
- Within the eight-product Hawaiian Christmas cluster, 800 recommendations became **570 unique
  phrases**. Incremental unique counts were 100, 100, 95, 59, 52, 47, 56, 61. Overlap is helping,
  but it is nowhere near “only one new phrase per product” in this small sample.
- **43 distinct keyword pages** were sampled with the production SP-API mapper/classifier.
  Nine deliberately selected new Ads phrases, three pages each, exposed **260 unique verified
  Merch ASINs absent from our database**, including **91 below BSR 1M**. Page one alone exposed
  86 new verified ASINs, including 38 below 1M. These are discovery opportunities, not catalog writes.
- Example: `bigfoot shirt` found 12 / 14 / 10 verified Merch listings on pages one / two / three.
  `school shirt` found zero verified Merch in all three. Most sampled frontiers still had next pages.
- Ads median latency: **746ms**; SP-API median: **1,032ms**. All sampled SP-API success headers
  reported **2.0 requests/sec**. These are small samples, not sustained-rate guarantees.
- Errors retained: one Ads **429** at ten-second spacing; two desktop autocomplete **503s**;
  one SP-API **500**. Failed requests did not become successful empty responses. One initial
  all-or-fail sampler stopped sibling lanes; the resumed sampler retained completed work and
  allowed independent lanes to finish. The failed SP-API term was not retried.

Autocomplete is an additional source, not something the capacity plan should depend on being
continuously available. The modern endpoint returned a valid middle-insertion suggestion for
`retro gardening shirt`; the old strict-prefix parser would drop it. Subsequent desktop 503s show
that successful connectivity is not proof of reliable unattended collection.

The nine new phrases were chosen for coherent apparel intent, not randomly from all accepted
terms. The catalog is seasonal and user-selected; licensed controls are excluded from extrapolation.
Do not generalize the observed ASIN yield or 44% admission rate to all Amazon niches.

## What fits the existing provider budgets

| Provider | Existing local pacing/budget | Planning implication |
| --- | --- | --- |
| Ads | At least 10 seconds between starts, shared provider credential | At most 8,640 ASINs/day before cooldowns; a 429 occurred even below this ceiling |
| Jev | At least 2 seconds between starts | At most 43,200 requests/day; 100-case batches are ample for the current Ads producer |
| Autocomplete | At least 10 seconds between starts | At most 8,640 seeds/day, but availability is unproven |
| SP-API keyword discovery | 10% of safe Catalog rate, capped at 0.25 RPS | Observed 2.0 header → 1.6 safe → **0.16 RPS / 13,824 pages/day** |
| SP-API before fresh rate observation | Conservative 0.1 RPS | **8,640 pages/day**; foreground demand and cooldowns reduce available discovery time |
| Keepa | Observed subscription refill **20 tokens/minute** | 28,800 standard product tokens/day, separately shared with existing work |

The current coordinator often spends one background page token, then immediately defers its
next page. It runs discovery, autocomplete and ASIN mining serially, then sleeps ten seconds.
It does not automatically achieve the SP-API budget's theoretical throughput.

Metadata and current BSR come from SP-API; there is no Keepa request for each newly discovered
ASIN. Current ranked Merch metadata policies imply roughly **419 product refreshes/day**, about
21 fully packed 20-ASIN calls, plus missing-rank/classification probation checks, retries and
foreground reads. Actual batches can be underfilled. Existing admitted automatic Keepa history
work is roughly **260 tokens/day** under standard one-token requests, excluding manual work.
[Keepa token rules](https://keepa.com/api-docs/plans-tokens.html).

## Initial coverage: conditional estimates, not a promised finish date

Mining **only today's 6,669 known eligible ASINs**, without following new keywords or products,
has an Ads-only floor of **18.5 hours**. The simple current-loop model is approximately **1–3 days**
including judgments/persistence, before failures, competing work or recursion. The 490 stronger
known products have a 1.36-hour Ads-only floor; allow several hours for the complete mining stages.

For extrapolation, anchor to the 25 eligible sampled ASINs and 1,965 distinct terms. Vary the
novelty-growth exponent rather than pretending 25 products identifies a global saturation curve.
The formula is `min(100 × products, 1,965 × (products / 25)^beta)`, with beta 0.65 / 0.80 / 0.95.
Apply measured 44.0% admission, assume five initial pages per keyword and 70% graduate to
one autocomplete expansion. Those last two values are scenario inputs, not measured population means.

| Scenario | Unique candidate judgments | New accepted keywords | Current loop, 25/batch | Ready queue, full five-page passes | Ready queue, first-page coverage + seed expansion | Initial Ads-candidate Jev cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| More overlap | 74k | 33k | ~27 days | ≥12 days | ≥3 days | ~$0.48 |
| Middle scenario | 171k | 75k | ~62 days | ≥27 days | ≥6 days | ~$1.10 |
| Less overlap | 396k | 174k | ~143 days | ≥63 days | ≥14 days | ~$2.54 |

These compare **the same corrected target workload**. The current prompt can appear cheaper by
incorrectly rejecting useful terms. Changing only its batch size to 100 changes these full-scan
estimates by minutes, not days: keyword page acquisition dominates.

The ready-queue numbers are optimistic quota/service-demand floors, not benchmarked speedups.
They require scheduling at provider readiness, batched persistence and sufficient database capacity.
The current-loop estimate assumes ideal overlap of stage visits, 2.5 seconds of database work per
page, 0.14 seconds per candidate write and 0.5 seconds of cycle bookkeeping. The write assumption
is informed by one production pass, not a measured per-row profile. Both approaches need an
allowance for retries, underfilled work and foreground traffic; 30% unavailable capacity makes a
quota-bound floor about 1.43× longer. Keeping a ten-second SP-API start floor instead of using
0.16 RPS makes its page-limited portion 1.6× longer.

**Excluded from this closed-workload table:** new keywords from autocomplete, new products found
by scans, their Ads descendants, negative-trial rechecks and ongoing maintenance. Those can exceed
the first generation. This is why “everything synced by tomorrow” is unsupported.

## Recursion and steady state

Let B be globally new approved keywords per newly mined ASIN, and M be new mineable ASINs per
new keyword pass. Without autocomplete, each generation multiplies by approximately **B × M**.
Below one the frontier shrinks; above one it grows until overlap, a finite source or admission
pressure changes that ratio. Even **one** genuinely new keyword per ASIN is expansive if it finds
several genuinely new ASINs. Autocomplete adds another branch. Slower cold-keyword refresh only
reduces repeat scans; it does not reduce the first-pass branching factor.

For example, assume 5% hot checked daily, 25% warm every 14 days and 70% cold every 45 days:

| Tracked keywords | First-page checks/day | Share of 13,824-page budget | If every check repeats three pages |
| --- | ---: | ---: | ---: |
| 10k | 834 | 6% | 2,502/day |
| 50k | 4,171 | 30% | 12,512/day, 91% |
| 100k | 8,341 | 60% | 25,024/day, does not fit |
| 250k | 20,853 | 151%, does not fit | 62,560/day, does not fit |

This mix is illustrative. All-hot keywords would support far fewer; an almost entirely cold
population supports far more. Current cadence ranges remain hot 1–7, warm 7–21, cold 30–60 days.
Recrawling depth every time can exhaust the budget well before compact-row storage gets expensive.
At 100k keywords in the example mix, only about 5,483 pages/day remain for new discovery at the
quota ceiling. Backlog clearance is `new pages / spare pages per day`, not total capacity.

## Dollars and disk

Jev 1.13 costs **$0.042 per million input tokens**, output free. At the measured revised prompt
size, **one million candidate judgments cost about $6.42**. Even the deliberately pessimistic
no-dedup ceiling of 6,669 × 100 candidate judgments is **$4.28 once**, not monthly. Autocomplete's
additional unique phrases add judgments at the same rate. Every 1,000 new ASINs/month contributes
at most roughly **$0.64** for its 100 suggestions each, before deduplication, excluding descendants.
The entire live Jev study used about 1.17 million input tokens: roughly **five cents**.
[TypeSafe pricing](https://docs.typesafe.ai/models).

Amazon Ads states API use has no additional API fees; these recommendation reads create no
campaign spend. Amazon's current primary announcement cancels the proposed SP-API annual/usage
fees. There is no per-call Amazon bill in this model; requests still consume shared quotas.
[Ads API fees](https://advertising.amazon.com/about-api),
[SP-API fee cancellation](https://developer.amazonservices.com/cancellation-of-sp-api-fees).

Keepa remains the existing fixed subscription. Its refill capacity was observed; its invoice amount
was not reverified. The PlanetScale approval earlier in this conversation was about **$18.25/month
initially**, up to **$25.75/month for configured compute/disk at the 80GB cap**, plus applicable
backup/traffic overages. This study does not revalidate the current invoice or promise that future
compute demand never requires resizing. No additional fixed service is proposed.

Actual storage is dominated by history today: **6.94GB** of history-point tables/indexes versus
**27.8MB** for 15,121 product rows, about 1.84KB/product including indexes. Listing rows alone are
roughly 1.8GB per million at today's footprint. But mining relationships matter too:

A disposable local Postgres experiment used the actual migration's tables/indexes, 100k settled
candidates, one million product-candidate links and 10k completed mining records with 100 saved
recommendations each. It measured approximately **292 bytes/candidate**, **130 bytes/link** and
**1.69KB/mining record**. Thus a million fully mined Merch ASINs with 100 links each costs about
**13GB of links + 1.7GB of mining records + 1.8GB of products**, before global candidates,
keyword membership, evidence, logs, history and free-space/bloat allowance. This synthetic test
measures disk layout, not PlanetScale throughput. Its UUID and phrase distribution differ from prod.

Provision roughly **25–40GB** for a one-million-product, fully mined catalog plus these structures
and today's history as an initial planning envelope; shared candidate vocabulary and number of
memberships can move it. Storing legacy-sized history for every ASIN would instead mean hundreds
of GB. Keep selective history admission. Also define operational-event/attempt retention before
sustained crawling: transient logs should not grow forever alongside durable catalog evidence.
Disk billing is based on allocated capacity, not simply bytes used.
[PlanetScale storage/billing](https://planetscale.com/docs/postgres/cluster-configuration/cluster-storage),
[additional storage, backup and network costs](https://planetscale.com/docs/postgres/pricing).

## Recommended implementation order

1. **Fix the judgment shape and batch up to 100.** Claim globally unique candidates once, persist
   fenced decisions in a set-based operation, insert their activity events together and notify once
   per committed group. Preserve per-keyword event records. Avoid 100 sequential network round trips.
2. **Use one pauseable coordinator over ready work.** Separate task readiness for keyword heads,
   continuations, autocomplete and once-only ASIN mining. Provider reservations/cooldowns remain
   shared; waiting on one provider should not force unrelated ready work to wait ten seconds.
   A new process per lane is unnecessary to start. Preserve durable leases/checkpoints and pause guards.
3. **Prioritize coverage and freshness before depth.** Due tracked heads and new trial heads get
   guaranteed service. Continue useful deeper pages with spare capacity and existing low-yield stops;
   do not repeatedly recrawl all depth just to refresh a popularity score. Measure change/novelty
   before setting a broad depth policy. Do not silently alter the public research-read contract.
4. **Add producer pressure based on scan backlog age/work, not a permanent catalog cutoff.** Slow
   new ASIN recommendation and autocomplete expansion work when pending trial pages exceed roughly two days of measured spare
   capacity. Let already-saved judgments finish. Prioritize strong ASINs; let cold/unranked mining
   consume spare capacity. Keep explicit user research prompt. Store the rest for later, don't discard it.
5. **Measure a controlled rollout before broadening.** Start with the 15 tracked heads and the 490
   stronger known ASINs. Report oldest due-head age, pending trials/pages, oldest unmined product,
   new/unique/accepted phrases per ASIN, new ASINs per page, tier counts, provider errors/cooldowns,
   input tokens and storage growth. Use those observations to replace the extrapolation inputs.

A two-day pending-page threshold is a proposed tunable starting point, not an already implemented
limit. Keep maintenance reserved, and estimate spare capacity from successful committed pages,
not nominal quota. Monitor cold-product wait time so backpressure does not hide indefinite starvation.

## Evidence and verification

Raw private study artifacts are ignored under `apps/server/tmp/research-baseline/sync-model-2026-10-26/`:
`snapshot.json`, `extra-snapshot.json`, the Jev datasets and JSONL runs, provider samples including
failures, `provider-judgments.jsonl`, `sample-summary.json`, `storage-experiment.json`,
`capacity-model.json` and `final-paused-state.json`. An interrupted first eval start is explicitly
excluded; the completed baseline contained 140 requests. Completed runs recorded **307** successful Jev requests; the interrupted start has no complete-batch result and is excluded from comparisons and the recorded token total.

Reproducible read-only probes, evaluators, summarizer, capacity model and disposable storage script:
[`apps/server/src/scripts/research/`](../apps/server/src/scripts/research/).
Run the Python summarizer, then model against that artifact directory; neither calls providers.
The model's six tests cover quota floors, maintenance exhaustion, equal-work batch comparison,
deferring rather than deleting depth, token arithmetic and generation growth. Offline `check:fast`
passed. Full repository TypeScript checking has unrelated existing errors; this study fixes its
own new snapshot typing error. No collector code, batch setting, production data or paid plan was changed.
