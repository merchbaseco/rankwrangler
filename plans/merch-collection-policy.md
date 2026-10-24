# Keyword and Product collection policy

Proposed October 23, 2026 after a follow-up adversarial review with Claude. Not implemented.
This supersedes the earlier zero-matching-Products trigger and fixed weekly lease for generic
database searches. New intervals, shares, page limits and percentile cutoffs are starting defaults,
not measured guarantees. Existing Product schedules are identified separately below.

## Keep four kinds of work separate

| Work | Purpose | Trigger |
| --- | --- | --- |
| Keyword head check | Observe what the source currently returns on its first page. | Keyword is due, or a caller explicitly requests current keyword result evidence. |
| Keyword exploration | Discover relevant Products beyond the first page. | Initial admission, unfinished budget-limited exploration, or a later exploration recheck. |
| SP-API Product check | Update listing details, Merch classification and current BSR. | Initial identity resolution, the Product's own due time, or existing direct-read policy. |
| Keepa Product check | Import history and richer metrics. | Existing on-demand read policy or admitted Product history schedule. |

Five matching Products do not establish that a keyword was checked. Checking a keyword does not
mean checking every Product that matches it. A head check does not establish deep coverage.

## Define live behavior by the question asked

| Read | Immediate result | Work and waiting |
| --- | --- | --- |
| General product.search | Stored catalog matches, even for a never-collected term. | Register normalized keyword interest. Never wait for collection in V1. No per-result provider fan-out. |
| Proposed keyword.results | Reuse a current observed Search run. | Missing or policy-expired evidence starts or joins the existing collection path and waits within its deadline. Initial reuse target remains 24 hours. |
| product.get | Preserve the existing listing and requested market-data behavior. | Known listing can return last-known data and queue a listing refresh after its two-day policy. Cold identities wait. Default marketData may also require Keepa under existing policy. |
| product.getMany | Preserve the basic listing-only batch contract. | Known values and cold identity resolution follow existing behavior. Do not add synchronous rich history. |
| product.history | Preserve existing history and coverage retrieval policy. | Missing required history can start or join work and wait. No new fetch on every chart opening. |
| Brand Analytics keyword reads | Reuse policy-current shared report snapshots. | Missing or expired report datasets can start or join their existing jobs and wait. This is a shared reporting-window pipeline, not a new report per phrase. |

The browser extension still resolves visible ASINs through product.get and product.history.
Changing search filters or sorting does not initiate separate external collection.
Early gaps are accepted. No special prepopulation or automatic first-search continuation is
required for launch; ordinary collection expands coverage while the operator observes it.

A business-data coverage projection accompanies text search. It includes the last successful head
observation time, or null if never observed, and a dated exploration depth when available. A
budget-limited observation may say so. Do not expose job IDs, queue state or provider health.
Depth means contiguous pages from the head observed in the latest dated exploration pass;
its timestamp is the oldest included page observation. Reset it conservatively when a pass restarts
or has gaps. Further noncontiguous page observations remain available internally. A new head check
does not refresh old deep-page observations. Budget-limited means the latest pass actually stopped
on budget, rather than on low yield or a page cap. No complete-market flag.

An agent seeing an unobserved important phrase can ask keyword.results for current search evidence,
then repeat product.search. This distinguishes business questions without asking callers to choose
live versus cached storage.

## Admit keywords before scheduling them

A generic search creates or updates one deduplicated candidate per marketplace and normalized
term. Candidate existence does not create an unlimited recurring subscription.

- Reuse current input validation and normalization. Valid short terms such as RN and AI remain valid.
- Admit first checks from the discovery allowance. A never-checked admitted term is due immediately,
  regardless of whether the catalog contains zero, five or hundreds of matching Products.
- Leave excess candidates stored and waiting for admission. The next minute is an opportunity to
  dispatch, not a guarantee that provider capacity is available.
- Keep personal interest, buyer-demand evidence and observed collection coverage as separate facts.
- Owner seeds, explicit pins and recent keyword evidence requests can receive a bounded 30-day
  business-interest lease. Repeated generic searches only boost priority within the admitted tier.
- Evaluate buyer popularity using fresh comparable Brand Analytics search-frequency rank. It is
  relative rank, not absolute search volume. Missing BA data means unknown popularity.
- Use existing deterministic Merch-relevance filtering before BA candidates compete for first checks.
  Require observed Merch evidence before treating a candidate as a proven Merch research keyword.
- Owner catalog phrases and listing-derived candidates can enter probation without BA coverage.
  Unsupported Merch evidence stays provisional rather than being treated as non-Merch.
- BA-driven admission intentionally replaces the old rule that BA never activates Catalog queries.
  Relevance checks, population admission and budget limits still apply.

For the initial popularity policy, compare ranks among relevant observed eligible keywords.
Use the top 10% as hot candidates, the next 40% as warm candidates and the remainder as cold
candidates. These relative cutoffs and the minimum evidence sample must be calibrated from real
Merch terms. They are scheduling hypotheses, not market facts or opportunity scores.

## Set keyword head-check times

| Tier | Admission reason | Initial interval | Interval bounds |
| --- | --- | --- | --- |
| New probation | Newly admitted relevant phrase, including one with unknown buyer popularity. | First check due now; seven days after first success. | Warm bounds during 30-day probation. |
| Hot | Strong buyer-demand evidence, or a bounded owner seed/pin/research lease. | One day. | 1–7 days. |
| Warm | Relevant measured candidate or continuing research interest. | Seven days. | 7–21 days. |
| Cold | Lower-priority relevant candidate retained within capacity. | Thirty days. | 30–60 days. |
| Stored-only | Not admitted, expired probation or withdrawn capacity admission. | None. | Data remains searchable. New interest can make it eligible for another bounded probe. |

Only a successful check changes the adaptive interval:

- Meaningful change halves the interval, clamped to the tier bounds.
- Quiet observations multiply it by 1.5, clamped to those bounds.
- Spread due times by up to 10% to avoid synchronized batches.
- Initially detect changed head membership when less than 80% remains and at least three observed
  Merch ASINs were replaced. A thin cohort cannot prove stability from this rule alone.
- New comparable demand evidence can promote a keyword. Promotion advances its due time but never
  rewrites the last-success time. Respect the tier's minimum check interval.
- Market-signal demotion needs two successful observations and a 14-day grace. Capacity withdrawal
  is a separate operational decision and records that reason.
- At the end of probation, keep the term scheduled only if relevance and capacity justify it.
  Otherwise retain it as stored-only. A 90-day inactivity rule can retire admission when neither
  business interest nor fresh positive demand evidence supports it. That does not assert no demand.
- Do not infer seasonality from unavailable evidence. Comparable BA trends can change priority;
  richer seasonal rules require their own measured evidence.

## Explore beyond the first page under a different budget

The current Keepa adapter supports page zero only. Multi-page exploration requires an adapter
change and a pilot of actual paging, response size and cost. Compare full history/stats flags with
lighter discovery requests before sizing caps. Keep existing payload semantics until the pilot
proves that lighter requests retain necessary listing and classification evidence.

Proposed initial limits:

1. Give an admitted initial exploration a two-page sample when budget permits. Already-known
   Products do not suppress it.
2. Allow at most five page requests per exploration job. This is a job cap, not a lifetime depth cap.
3. Allow at most ten page requests per keyword in a rolling 24 hours, inside the global discovery
   allowance. This is a starting fairness limit, not a promise to spend ten pages.
4. After the initial sample, stop after two completed low-yield pages. Initial low yield means
   fewer than three useful Merch ASINs new to this keyword's observed membership. Do not confuse
   novelty to the keyword with novelty to the whole catalog.
5. Checkpoint accepted pages and the next frontier. A job cap yields to other work. A budget stop
   resumes when capacity permits. Neither means the keyword is exhausted.
6. A low-yield stop makes deeper re-exploration eligible after 30 days for hot keywords and 60 days
   for warm keywords. Cold terms get head checks, not routine deep mining.
7. Paging cursors are advisory because source ordering changes. For a frontier older than 24 hours,
   refresh the head and overlap the previous frontier before continuing; those requests count
   against the job and daily limits. If the provider cannot support continuation, restart or
   partition within budget and record partial coverage.
8. Store source limits and stop reasons separately from claims about Amazon. A provider page cap
   or exhausted provider query is not proof of exhaustive Amazon Merch coverage.

Keyword head checks normally request only page zero. They do not repeat all explored pages.

## Preserve existing Product targets

These targets already exist for active known Merch Products with numeric BSR.

| Current BSR | SP-API listing/current BSR target | Keepa standalone history target |
| --- | --- | --- |
| Below 200,000 | Every 24 hours. | Every 24 hours. |
| 200,000–299,999 | Every three days. | Every 24 hours. |
| 300,000–499,999 | Every three days. | Every seven days. |
| 500,000–999,999 | Every seven days. | Every seven days. |
| 1,000,000–2,999,999 | Every fourteen days. | On demand. |
| 3,000,000 and above | Every thirty days. | On demand. |

SP-API reads batch up to twenty same-marketplace identities through the existing ingestion path.
Keepa standalone loads retain the existing 24-hour successful-fetch guard. A fetched history can
update the Product without moving its keyword's observation date.

Current keyword search payloads include Product history. Accepted ingestion advances Product
freshness and clears redundant queue work. Do not immediately buy the same ASIN again.
Selective history admission controls standalone Product work; it does not remove history cost
already included in a purchased keyword payload.

Proposed blind-spot handling uses the SP-API background allowance:

| Product state | Proposed recheck |
| --- | --- |
| Newly discovered identity | Initial resolution through existing ingestion. |
| Known Merch, active, no BSR | First revisit after three days, then fourteen-day checks during 30-day probation; later a bounded thirty-day cold sample. No automatic Keepa history merely because BSR is missing. |
| Classification unknown | Initial resolution, then seven-day checks during 30-day probation if successful responses still lack evidence; later stored-only or bounded thirty-day sampling. |
| Known non-Merch | No automatic schedule. |
| Deleted | Preserve no automatic sweep. Authoritative rediscovery or a specifically watched exception can recheck it. |

Technical failures use retry rules, not these successful-observation intervals.

## Admit history without silently changing its cadence

Add explicit Product history admission independent of keepaFetchedAt and BSR eligibility. Use
admitted, notAdmitted and paused states. The scheduled scan requires admission in addition to
the Merch/BSR eligibility rules and an active-listing predicate. The current scan lacks that
active predicate; add it as a correction alongside the new capacity gate.

At rollout, grandfather existing Product identities as legacy admitted and record the baseline
watermark atomically with the new default. Products arriving afterward must not inherit admission. The resulting eligibility must
exclude non-Merch and deleted Products from automatic scheduling. Preserve baseline search-only and
never-fetched eligible Products too; do not backfill only from standalone import provenance.
Newly discovered identities start notAdmitted. Explicit get/history reads keep their current
on-demand behavior without creating permanent admission. Search payload history advances freshness
but never grants admission.

A newly discovered Product can remain in the SP-API listing tier without automatic standalone
Keepa work. This separates broad catalog coverage from a standing history-refresh obligation.

Admit additional history only when the combined projected workload fits 90% of the protected
history allowance. Include every daily and weekly cohort in that sum. Incidental keyword histories
can reduce actual due work, but do not assume that saving before observing it.

If sustained history overload or falling freshness persists for seven days, pause new standalone
history admissions, prioritize the existing overdue population using available lending, and report
the measured deficit. Broad listing discovery can continue within its separate capacity.
Do not silently change BSR thresholds, claim target cadence was met, delete history, or increase spend.

## Dispatch against actual capacity

Starting Keepa flow allocations, to calibrate from real use:

| Share of observed refill flow | Class |
| --- | --- |
| 20% | Explicit interactive evidence/history work. |
| 50% | Standalone Product history, all scheduled tiers combined. |
| 20% | Scheduled keyword head checks. |
| 10% | Initial checks, deeper exploration and other discovery. |

First checks caused by generic database-query interest use discovery capacity even though a caller
asked the original question. Explicit keyword.results can use interactive capacity.

Compute F as the measured 95th-percentile head-check cost plus ten measured Product-load costs.
Check that it fits the actual token bucket before relying on it. Unknown costs require a small
controlled pilot. Hold F before dispatching background work.

- Use actual tokensLeft, refill timing, refillRate and physical request costs. The current request
  limiter's twenty requests per minute is not proof of twenty tokens per minute.
- Account for every physical attempt and retry, including search payload enrichment costs.
- Keep rolling-hour spending and current bucket availability. Tokens expire after sixty minutes;
  daily totals are forecasting equivalents, not banked credit.
- Head/history work can lend unused protected capacity to each other after their due work clears.
  Discovery does not automatically borrow beyond its cap.
- Head/history work may opportunistically borrow unused interactive allowance only with no
  interactive work waiting and a post-dispatch balance of at least 2F. Record borrowed spend;
  stop borrowing when interactive work arrives. This protects a burst, not guaranteed future latency.
- Recheck capacity and freshness immediately before each dispatch. Claim work durably and deduplicate.
- SP-API uses its own endpoint limits, batched identities and interactive headroom. Keepa token
  percentages do not define SP-API request capacity.

Every minute, dispatch eligible due work by importance multiplied by 1 + overdue-time/interval.
Initially maintain protected hot/warm work within head checks and cap cold work. Determine admitted
population sizes from measured cost and due load rather than assigning every candidate a schedule.

The steady-state forecast is sum(population × cost/check ÷ interval-days), including retries and
all cohorts sharing an allocation. Admit below 90% of that class's expected refill-flow allowance.
Measure backlog, oldest overdue work and on-time share by tier.

## Handle failures without falsifying coverage

Keep lastAttemptAt, lastSuccessAt, nextDueAt and nextRetryAt separate.

- A provider failure retries from five minutes with exponential backoff up to twenty-four hours,
  honoring a longer provider Retry-After. It never counts as successful, quiet or fresh.
- A budget deferral preserves due age. It is not a provider failure.
- A successful zero-result provider check is eligible again in seven days, then thirty days after
  a second successful empty check. Strong new evidence or an explicit evidence read may override
  negative reuse under its own bounded retrieval policy.
- Zero matches after user filters do not create a negative keyword observation.
- Check only when due and after retry cooldown. No catch-up replay of every missed historical run.
- Retries, restarts and repeated callers join the same canonical work. A provider-response-before-
  commit crash can still cause repeated spend; bound and record that window rather than promise
  exactly-once billing.

## Acceptance evidence

- Five stored matches with no keyword observation still make an admitted initial check due.
- Normal search and filter changes return without waiting for providers.
- Repeated callers deduplicate candidates, checks and retries.
- Head and deep coverage timestamps remain distinct from Product freshness.
- Existing extension reads and Product history behavior remain intact.
- Search payload history prevents redundant standalone loads.
- No-BSR and unknown-classification probation work stays bounded.
- Negative observations, failures and budget deferrals produce different next-check behavior.
- Exploration can progress beyond five pages across jobs without claiming stable/exhaustive coverage.
- Actual costs, protected flow, lending and overdue shares are visible internally.
- New history admission stops before it makes existing target cadence silently unsustainable.

See [the research plan](merch-research.md) for sequencing and
[the review record](merch-research-review.md) for conclusions and receipts.
