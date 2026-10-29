# Build the agent-accessible Merch database

Revised October 23, 2026 after the original review and a follow-up scheduling review with Claude. This is the implementation plan,
not a statement that the proposed capabilities have shipped.

## Current checkpoint, October 25

The October 24 deployment delivered unified stored search, keyword evidence, adaptive Keepa heads,
selective history admission and a constrained SP-API acquisition pilot. It did not complete broad,
sustained collection. The day-one check found 578 new identities, including 92 confirmed Merch;
listing growth stopped at the pilot's twenty-request daily ceiling. Existing data was preserved.

[Growth completion](merch-growth-completion.md) implements the remaining autonomous acquisition:
independent scoped SP-API targets, catalog-derived roots/pairs/brands, narrower BA acquisition,
durable measured-rate capacity and operator yield reporting. Local migration, database, MCP and
package checks are recorded there. These new changes are not deployed yet. Historical checkpoints
below describe their dated state, not today's production status. Sustained yield/freshness still
requires observation after deployment.

## Product goal

RankWrangler is one growing Amazon Merch database for efficient agent research. A caller asks
business questions about products and keywords. Provider selection, storage, collection and
refresh are server responsibilities. The core returns evidence rather than opportunity verdicts.

"Everything" describes the intended breadth of the database. It does not assert exhaustive Amazon
coverage or complete history for every listing. Start with US Merch shirts, preserve general Product
identity, and expand types and coverage as measured capacity permits.

Early coverage gaps are accepted. Do not add special launch prepopulation or an automatic
first-search collection/retry flow. Use normal collection and operator observation as the catalog
grows. The accepted boundary is recorded in the [database decision](../docs/decisions/unified-merch-database.md).

The [collection policy](merch-collection-policy.md) owns proposed live/background behavior,
keyword admission and tiering, Product targets, coverage, history admission and provider budgets.
It supersedes the earlier zero-match cold fill and generic weekly collection lease.

## Public direction

- Expand `product.search` into the general search over canonical Products. Support browsing without
  a term, text relevance, structured filters, useful sorting and cursor pagination. Do not add a
  second public live-versus-stored search mode.
- Cover known Merch classification, listing status, brand inclusion/exclusion, category, BSR,
  price and listing-date ranges. Use existing rank averages, rank-drop and demand measurements
  where available. Distinguish missing measurements from zero and unknown classification from false.
- Use conventional text search with optional specific/title-focused controls and word exclusions.
  Do not silently broaden into related ideas. Hide known official brands by default in research
  search, retain their records, and let callers include them explicitly. Unknown brand status
  must not silently exclude a Product.
- Return compact current Product evidence including market metrics needed to screen results. Keep
  full Product details and history available through existing reads. Avoid one detail call per row.
- Preserve the current search-result evidence under a keyword-scoped read, provisionally
  `keyword.results`. It answers what a particular phrase's collected search showed, including
  observation time and placement. It is independent of Brand Analytics keyword retrieval.
- Give that evidence read the existing Search retrieval policy. A current run returns immediately;
  missing or expired evidence starts or joins collection and waits within its deadline.
- Keep `product.get`, basic-only `product.getMany`, `product.history`, existing keyword reads and
  public status unchanged. Keep provider health, budget and backlog in operator surfaces.
- Change the old public search contract and migrate all callers in the same delivery. Preserve
  internal Search runs. Bump affected published packages through repo scripts. Add no legacy shim.
- Add generic aggregate reads only after real research demonstrates that retrieving result rows is
  insufficient. Add no special seasonal-analysis, ideation or research-autopilot public API.

Procedure and field names beyond the existing contract remain provisional until implementation
checks the router, typed client, CLI and MCP together.

## Search and collection rules

1. General product.search always returns observed database matches without waiting for providers.
   Record normalized keyword interest independently of the number of matching Products.
2. A never-checked keyword is eligible for an initial background check once admitted under budget,
   even if five or hundreds of its Products already exist. Matching rows do not prove coverage.
3. Recheck admitted keywords regularly according to buyer-demand evidence, business interest and
   observed change. Proposed bounds are hot 1–7 days, warm 7–21 days and cold 30–60 days.
   Candidate existence alone does not create an unlimited recurring subscription.
4. keyword.results retains caller-synchronous retrieval of current observed keyword evidence.
   It shares the collection path but answers a different business question from database search.
5. Track dated keyword head/deep observations separately from individual Product freshness.
   Expose minimal business-data coverage without provider/job state or completeness claims.
6. Default to known Merch listings. Apply all filters to lexical and observed-term relevance.
   Missing values remain unknown. Zero filtered results do not create negative keyword observations.
7. Product-search order is database order, not Amazon search placement. Keep placement in the
   keyword evidence cohort. Match/cohort counts are not Amazon-wide competition or search volume.
8. Use live keyset pagination with documented movement under updates. No snapshot guarantees.
   Validate first-observed semantics separately from the correctable provider listing date.

## Deliver in verifiable milestones

### A. Establish the actual baseline

- Inventory current public, dashboard, CLI and MCP behavior from source and real calls.
- Compare relevant FlyingResearch questions against advertised features and verified MCP tools.
  Record unavailable schemas as unknown rather than inventing parity.
- Measure the actual Keepa refill rate, tokens and results per collection, SP-API operation limits,
  overdue refresh work and database storage. Reuse current telemetry before adding accounting.
- Check PlanetScale index support and current Product/date semantics before choosing query indexes.
  Resolve an unsupported index approach before implementing the search contract.
- Keep this baseline bounded. Unavailable competitor schemas do not hold up grounded search work.
- Finish with a capability matrix and a repeatable baseline research scenario.

### B. Deliver unified research reads with collection safeguards

- Share the database query implementation across dashboard, public API, CLI and MCP.
- Add the generic filters, screening metrics, sorting and pagination described above.
- Preserve keyword search evidence in the same delivery rather than silently removing it.
- Reserve tokens before background dispatch. Priority alone is not a reserve. Account for physical
  attempts, retries and actual consumption. Keep SP-API limits separate from Keepa tokens.
- Implement candidate admission and regular keyword tiers. Replace the fixed weekly lease for
  generic queries. Initial checks do not depend on Product match counts.
- Verify that general search never waits. Head checks, exploration and Product refresh remain
  independently scheduled and accounted.
- Verify that Products discovered through unrelated searches can match a new database query.
- Verify filter changes and warm reads do not cause synchronous provider fan-out.
- Verify deduplication, negative expiry, classification exclusions, empty versus failed
  observations and explicit evidence-read deadline exhaustion.
- Verify cursor behavior under inserts and metric updates against the documented live semantics.
- Measure real query latency and plans at current scale, then use an isolated synthetic larger
  catalog to identify scaling limits. The earlier million-row rehearsal is not sustained proof.
- Run real research through MCP or CLI on several niches and an empty case. Profile tool calls
  before deciding whether summaries or additional batch reads earn their scope.

### C. Pilot broad acquisition without buying history for everything

- Compare own-catalog/root phrases, existing keyword collection, brand/category discovery and
  Keepa Finder or best-seller enumeration. Treat extension browsing as an existing passive input.
- Persist discovery provenance, deduplicate canonical identities and checkpoint collection work.
- Resolve listing details, current BSR and Merch classification through existing SP-API ingestion.
- Add explicit history admission separate from freshness. Grandfather baseline identities
  atomically; new identities start unadmitted. Existing active/Merch/BSR gates still apply.
- Direct reads and incidental keyword history never create permanent background admission.
- Compare tokens, SP-API requests, duplicate rate and cost per new verified Merch Product.
  Enumeration can produce many irrelevant identities, so ASIN count alone is not success.
- Verify that committed collection pages are not repeated after restart. Bound and record retries
  across the unavoidable crash window between a provider response and durable persistence.
- Measure storage growth separately for identity, listing and history admission tiers. Preserve
  all existing history. Do not compact or downsample history under this plan.

### D. Grow coverage while proving useful freshness

- Preserve current Product cadence targets. Use adaptive keyword intervals, bounded admission
  and deferral by priority and due age.
- Pause new history admission under overload. Do not silently change thresholds, spend more or
  mark deferred work fresh.
- Report discovered identities, resolved listings, known Merch, known non-Merch and unknown records
  per named source. Never label a source-relative percentage as coverage of all Amazon Merch.
- Report fresh/overdue shares, backlog and spending by tier. Successful jobs alone do not establish
  that the database is usefully current.
- Expand the real catalog only while measured query latency, storage and refresh capacity remain
  acceptable. Choose the next size checkpoint from pilot throughput rather than an invented quota.

Today's desired outcome is B plus a small C pilot if the baseline supports it. Large coverage and
sustained freshness are subsequent measured outcomes, not promises achievable in one day. Landing
and deployment remain separate explicit user instructions. Use drizzle-kit for schema migrations. Zach authorized agent generation for this work.

## Evidence and reuse

- PlanetScale cutover completed October 22 with full preservation. It is the production database;
  the Mini runs compute. Migration work is complete and is not today's research feature work.
- Handmade supplies the bounded collection, selected-field storage, query and scheduling patterns.
  Reuse the useful structure without copying Etsy sales estimation, publishing or opportunity scores.
- FlyingResearch publicly advertises database/live research, brand and BSR filters, new arrivals,
  gainers and BSR/price history. Its launch emails advertise MCP access to research and history.
  Exact current MCP schemas, quotas and bulk export entitlement remain unverified in this review.
- Keepa Finder is a verified enumeration option. It returns ASINs from Keepa's own database rather
  than complete Amazon coverage. Actual subscription access and pilot yield must be checked.

See [the review record](merch-research-review.md) for disagreements, resolutions and source links.

## Implementation checkpoint, October 23

- Capacity baseline completed with read-only production evidence. See
  [measured capacity and pilot limits](merch-capacity-baseline.md). Sustained SP-API capacity remains
  a pilot measurement, not a blocker to conservative implementation.
- First schema unit prepares native weighted word-search indexing, browse/BSR indexes and an exact
  official-brand evidence registry. A separate search-document table was rejected because it adds
  synchronization across three ingestion paths without demonstrated benefit.
- Shared database query, filters, compact metrics, keyset paging and keyword candidate registration
  are implemented. Public API, CLI, MCP and dashboard callers migrated together. The former external
  search is preserved under `keyword.results`; Product get/history and extension reads are unchanged.
- The actual query runs against a disposable PostgreSQL database built from the exported schema.
  Eleven database checks cover text/placement membership, filters, facets, unknown classification,
  official brands, missing sort values, cursor scope and timestamp precision. This proves query
  behavior against the target schema, not the still-pending migration transition.
- Migration `0039_unified_product_search` was generated with drizzle-kit and passed the local
  upgrade/backup/restore harness plus 57 database checks. No migration was handwritten and no
  production schema or deployed public contract has changed. Published packages are prepared at
  0.11.0 because the search transport and response change incompatibly.
- Search records normalized keyword candidates without renewing standing collection. Current
  evidence reads retain their existing 24-hour reuse and weekly activation behavior.
- Next unit adds term-level candidate admission, scheduled tiers, token reservations and explicit
  history admission, with a separate transactional migration and preservation proof. The current
  automatic history scan also selects deleted listings; add the active predicate in that unit.
