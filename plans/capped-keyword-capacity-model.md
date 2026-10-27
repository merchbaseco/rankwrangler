# Capacity with five or ten selected keywords per product

October 26, 2026. Follow-up to [the original study](sync-capacity-model.md).
These are projections against frozen production data and bounded live samples, not work actually
written to the production catalog. Production was checked paused again after the study.

## Result

Start with **five** topical, distinct buyer searches per product, allowing fewer. Ten is a ceiling
we can support, but is not automatically better: it creates more scan work per ASIN. Product listing
rows become usable as soon as SP-API supplies them; keyword mining is additional discovery work,
not a prerequisite for searching those rows.

There are two different questions:

1. What does today's known-product backlog generate? Roughly **10k / 19k distinct keywords** in
   the middle scenario for limits of five / ten, with a **$6 / $7 initial Jev bill**.
2. What happens if we keep following newly found products? The system can stay busy indefinitely.
   The 30-day middle scenarios below consume roughly **$44 / $22 of Jev** and store many more
   usable product rows than they have finished mining for more keywords. They are workload models,
   not a forecast of how many Amazon listings actually exist in our reachable niches.

## What changed in the assumptions

Keep the existing stack and budgets. A product's selection limit includes phrases already tracked.
Do not search further to fill a quota of NEW terms. Keep once-only product mining, global keyword
identity/deduplication, popularity-based rechecks and selective Keepa history admission.

Evaluate up to 100 Ads recommendations once; only selected phrases enter product scanning. The
model prices a product-specific relevance check conservatively on every ASIN, even when many
phrases have already appeared elsewhere. Product relevance cannot be cached as a global rejection:
“epilepsy shirt” being irrelevant to a cat ASIN says nothing about its relevance to an epilepsy ASIN.
The existing globally cached apparel-fit judgment can still be reused separately.

For timing, the proposed ready-work coordinator and batched writes are assumed. **They are not
deployed.** Discovery gets the existing observed 0.16 RPS background ceiling, with **70% productive
utilization** for retries, provider cooldowns, foreground demand and overhead. That is 9,677 accepted
pages/day; Ads and autocomplete have 6,048 productive starts/day at their existing ten-second spacing.
This allowance is an assumption, not measured sustained production throughput.

Head checks take priority over depth. Initial depth is five pages per keyword for comparison with
the earlier middle scenario; real low-yield/source-end stops can reduce this. Recurring checks use
one head page. The producer pauses when initial scanning work exceeds roughly two days of spare
capacity. Already-saved work can finish. No permanent exclusion of cold/unranked products is assumed.

## New bounded selection test

Used the same **25 eligible sampled ASINs and their 2,500 saved Ads recommendations**. No new Ads
or SP-API requests were required. Sent **25 Jev requests**, each with 100 candidate questions and
two controls, pinned `jev-1.13.0`, at two-second spacing. No errors. Total: **503,109 input tokens**,
about **$0.021**. Each question includes its phrase directly and asks whether it is both a specific
apparel buyer search and topically relevant to the product title.

Then preserve Ads ordering, accept probabilities at least 0.8, collapse simple apparel/style/word-order
variants within each product and stop at the cap. Global tracked identity remains the exact phrase;
this is a selection proxy, not a change to keyword normalization or a validated diversity-ranking model.

| Selection limit | Selected across 25 products | Average/product | Distinct phrases not already tracked |
| --- | ---: | ---: | ---: |
| Five | 120 | 4.80 | 94 |
| Ten | 213 | 8.52 | 176 |

Not every product has ten good distinct suggestions; don't pad it. Unrelated Batman and other
character suggestions that passed the old apparel-only test on cat shirts were filtered out.
All 25 negative controls were rejected; 23/25 full-title positive controls passed 0.8. The other two
were below threshold, so this is not a claim of perfect relevance classification. No labeled search
volume, conversion or sales outcome is available; “selected” does not mean verified high demand.

At a 25-candidate examination budget, the same saved judgments would yield averages of 2.96 / 3.28
selected phrases for caps five / ten. At 50 candidates: 4.44 / 6.12. Examining fewer candidates is a
possible later token saving; the main results here retain the full-100 assumption from our discussion.

## First pass through the 6,669 currently eligible products

The novelty curve remains a scenario: `distinct = sampleDistinct × (products / 25)^beta`, bounded
by total selections. Use beta 0.65 / 0.80 / 0.95 to vary how strongly vocabulary overlaps as we grow.
Add autocomplete using **0.2 genuinely new approved phrases per keyword, after global deduplication**,
a stable 1.25× vocabulary multiplier. This is unmeasured: 0.0 and 0.5 are also tested below. Assume
70% of trials graduate and receive their once-only autocomplete expansion.

Middle scenario, beta 0.80:

| Work / records | Five selected | Ten selected |
| --- | ---: | ---: |
| Existing eligible ASINs mined once | 6,669 | 6,669 |
| Product-to-selected-keyword relationships | ~32k | ~57k |
| Distinct keywords from those products | ~8,200 | ~15,400 |
| Distinct keywords including autocomplete descendants | ~10,300 | ~19,200 |
| Initial SP-API requests at five pages each | ~51k | ~96k |
| Product observations returned, including duplicates | ~1.03M | ~1.92M |
| Ads recommendation requests | ~6,669 | ~6,669 |
| Autocomplete requests | ~7,200 | ~13,400 |
| All source ASINs mined and their first heads/expansions complete | ~3.5 days | ~8.6 days |
| Full initial five-page coverage, simulated planning time | ~5.5 days | ~10.8 days |
| Jev for the above | ~$6.10 | ~$6.50 |

The timing is from a closed-backfill simulation with producer backpressure, 30% unavailable
capacity, due-head maintenance and negative-trial rechecks. Newly found product rows are stored
but not admitted to further ASIN mining in this closed scenario. Backpressure delays later sources
until earlier depth work drains; therefore the all-first-head milestone is later than the simple
1.2 / 2.2-day quota floors. Those floors are not the expected time to finish all sources. Ads alone requires at least 18.5 hours at ten-second starts. The current serial loop, merely
adding the selection cap while retaining its unconditional delays, models closer to **10 / 17 days**
for these full first-generation passes before outages. That comparison is arithmetic, not a measured
scheduler speedup; it also conservatively prices per-ASIN candidate persistence rather than global reuse.

Sensitivity to vocabulary overlap, still five initial pages and the same autocomplete assumption:

| Selection cap | Distinct keywords: more / middle / less overlap | Full first-generation planning time |
| --- | --- | --- |
| Five | ~4.4k / 10.3k / 23.7k | ~2.4 / 5.5 / 13.5 days |
| Ten | ~8.3k / 19.2k / 44.4k | ~4.5 / 10.8 / 27.1 days |

**Product observations are not new product records.** A product can appear under many keywords.
For illustration, assume 25% of the modeled result slots provide a fresh sampling opportunity after
within-niche/keyword overlap, seven of twenty result slots are eligible Merch on average, and the
reachable pool contains 100k–1M eligible Merch plus an equal pool of other listings. Expected-value
occupancy/deduplication gives **~130k–237k new total product rows** from the five-keyword first pass,
or **~163k–419k** with ten. These ranges depend on explicit, unmeasured overlap/universe assumptions;
they are not extrapolations of 1M observations into 1M unique products.

## Continued recursion: one week and one month

An hourly expected-value simulator adds newly discovered eligible ASINs to mining, emits globally
deduplicated keywords using the same novelty curve, adds the autocomplete multiplier, prioritizes
recurring/new heads over deeper pages, and slows producers using pending scan work. It respects
provider budgets and explicitly separates stored products, mined ASINs and keyword observations.

The product model samples from a finite reachable pool. Only 25% of result slots enter the uniform
sampling calculation; products already found are deduplicated again. Uniform sampling is a simplifying
assumption, not an Amazon graph model: actual keyword results are correlated and may expose far less
breadth. Two scenarios, 100k and 1M eligible Merch listings, expose that uncertainty. Neither is a
measurement of Amazon's catalog size. The equal non-eligible pool affects total stored product rows.

Other middle assumptions: beta 0.80, 0.2 autocomplete branching, five initial pages, 70% productive
capacity, and 70% keyword graduation. Among graduated keywords, 5% recheck daily, 25% every 14 days
and 70% every 45 days. Negative trials get one additional head at seven days, then become dormant.
Recurring heads are charged to capacity but are assumed only to refresh existing listings; additional
novelty from those heads is not modeled. Recurring checks schedule their next check after service, so an overdue target does not accumulate
multiple redundant queued scans.

| Milestone | Five selected | Ten selected |
| --- | ---: | ---: |
| Day 7: total stored product rows, reachable-pool scenarios | ~159k–312k | ~159k–312k |
| Day 7: ASINs finished mining for keywords | ~12,300 | ~5,500 |
| Day 7: distinct keywords | ~16,800 | ~16,600 |
| Day 7: cumulative Jev cost | ~$11.18 | ~$5.43 |
| Day 30: total stored product rows | ~199k–900k | ~199k–900k |
| Day 30: ASINs finished mining for keywords | ~49,900 | ~22,900 |
| Day 30: distinct keywords | ~51,300 | ~51,600 |
| Day 30: initial acquisition pages accepted | ~243k | ~243k |
| Day 30: recurring head checks served | ~47k | ~47k |
| Day 30: cumulative Jev cost | ~$44.48 | ~$21.69 |

Ten is cheaper here **because backpressure lets it mine fewer ASINs**, not because a ten-keyword
selection is intrinsically cheaper. Both runs fill scanning capacity, so catalog growth is nearly
the same in this simplified uniform model. Five spreads the source-mining budget over more products.
It does not prove the same real-world niche coverage or quality for both caps.

These are finite-horizon workload scenarios, not a promised crawl result or an Amazon-wide completion
date. In the 100k-eligible-Merch world, five reaches 95% mined and an acquisition queue below one day's
capacity around day 61 in the middle assumptions; ten does not reach that milestone within 180 days.
The observed product catalog becomes useful much earlier. Vocabulary overlap, autocomplete yield,
head-check mix and depth dominate this long tail; limiting selected keywords does not make it vanish.
With stronger vocabulary overlap (beta 0.65), the corresponding milestone is roughly 16 / 29 days.
Do not treat any of those dates as a deployment estimate.

## Costs and storage beyond Jev

Use the PlanetScale compute/disk prices previously approved: **about $18.25/month initially**, up to
**$25.75/month at the configured 80GB storage cap**, excluding applicable backup/traffic overages.
That is an existing fixed cost, not an extra database for this feature. Mini compute is existing capacity.

At the modeled 30-day activity levels:

- Five selected: **about $63–70/month for database + Jev**, plus the existing Keepa subscription.
- Ten selected: **about $40–47/month for database + Jev**, plus the existing Keepa subscription,
  with the lower mining throughput shown above.

Keepa's invoice was not reverified. Listing discovery does not call Keepa per ASIN. Existing history
admission uses the protected history allocation and can stop admitting new subscriptions when it
fills; this model assumes no paid upgrade and does not promise history for every new listing.

No added Amazon Ads API per-use charge is assumed, and Amazon currently cancels the proposed
SP-API annual/usage fees. Jev is $0.042/M input tokens; the product-specific prompt is longer than
the earlier apparel-only prompt and is conservatively priced per ASIN rather than per new phrase.
[TypeSafe pricing](https://docs.typesafe.ai/models),
[Amazon Ads fees](https://advertising.amazon.com/about-api),
[SP-API fee cancellation](https://developer.amazonservices.com/cancellation-of-sp-api-fees).

The selection cap is **not a hard dollar budget**. At the full ten-second Ads ceiling, always
judging 100 candidates per ASIN would cost around **$219/month in product-selection Jev alone**;
autocomplete adds more. The month model is lower because scan backpressure stops producers. At
70% productive Ads capacity without that backpressure, product-selection Jev would still be about
$153/month. Fewer examined candidates, cached global checks and an explicit spending limit can reduce
or enforce that ceiling, but are not silently included in the table above.

For disk, retain all 100 source-candidate links per mined ASIN as current provenance; the cap reduces
which phrases are indexed, not automatically what raw evidence is stored. Apply the measured prior
storage test: 130 bytes/source link, 1.69KB/mining record, 292 bytes/global candidate; production
products average 1.84KB, keyword-product membership about 255 bytes. Budget 4KB per keyword's
query/target state and 400 bytes per selected-source evidence edge (the latter two are assumptions).

At day 30, five adds roughly **11.3–12.0 million compact records totaling 2.9–4.2GB**;
ten adds **8.1–8.8 million totaling 2.3–3.6GB**. Most records are membership/provenance links,
not products. Allow another 50% for fragmentation, indexes differing from the sample and estimation
error. These figures exclude additional history and operational logs.

Today's history tables already consume 6.94GB. Legacy history footprint averages about **0.5MB per
admitted product**, so each additional 10k such histories would add approximately **5GB**; actual
history size depends heavily on listing age and rank-change frequency. Keepa capacity admission
limits ongoing provider demand, not total disk. Watch history and log retention separately. The
80GB limit is a spending ceiling, not proof that arbitrary future history fits indefinitely.
[PlanetScale billing](https://planetscale.com/docs/postgres/pricing).

## Implementation judgment and evidence

Use five selected phrases as the default, allow fewer, and treat ten as a measured exception rather
than a quota to fill. Keep producer backpressure, due-head priority and one pause control. Measure
accepted keyword yield, product novelty, maintenance demand and actual daily cost before broadening.

The first 25 recommendations often already provide about three usable distinct queries. That is a
reasonable later experiment for reducing token cost further, especially if we are happy with a couple
of strong roots instead of requiring five. The current model does not assume that optimization.

Reproducible sources under `apps/server/src/scripts/research/`:
`evaluate-product-keywords.ts`, `model_capped_sync.py`, `simulate_capped_frontier.py`,
`test_capped_sync.py`. Ignored artifacts in the existing study directory:
`capped-selection-input.json`, `capped-selection.jsonl`, `capped-capacity-model.json`,
`capped-final-paused-state.json`. The raw per-product selections are included in the model output.

Twelve model tests pass, covering selection limits, existing keywords consuming their slot,
underfilled products, quota/supply conservation, recurrence, token arithmetic and invalid branching.
The TypeScript probe bundles successfully. No collector logic, production data, sync setting,
credential, paid resource, git branch or deployment changed.
