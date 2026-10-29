# Adversarial review of the Merch database direction

October 23, 2026. Codex and Claude Opus 5.5 completed four rounds of read-only review. Claude's
final verdict was "AGREE" and "There are no blockers left." Agreement is on product and architecture
direction. It is not proof that the implementation, provider capacity or proposed performance works.

The original four-round conclusions below are historical. Subsequent user feedback and a
four-round scheduling follow-up supersede the cold-fill rule and generic one-off collection policy.
The [collection policy](merch-collection-policy.md) and [revised plan](merch-research.md) are current.
No implementation or deployment was performed during this review.

## Intent

Build an agent-accessible everything Merch database, like Handmade for Amazon. Provide reusable
product and keyword evidence efficiently. Keep collection and provider decisions behind the API.
This is a personal internal service, not a competing subscription business.

## Disagreements and resolutions

| Issue | Challenge | Resolution |
| --- | --- | --- |
| Separate live search and stored list | Codex's original proposal exposed acquisition mechanics. | One general `product.search` over canonical Products. |
| Cold searches | Codex initially preferred immediate database-only reads; Claude challenged the empty-first-query experience. | Permit one capped initial collection for genuinely cold text terms, then query the same database. No fill for empty text or restrictive filter changes. |
| Recurring spend | Claude found that reusing the current interest lease makes every exploratory phrase refresh weekly for 30 days. | Separate observed query interest from recurring Search collection. Background initial collection is bounded and one-off. |
| Relevance after collection | Claude noted provider matching may not reproduce lexical matching. | Include bounded latest observed term membership as relevance evidence. Apply all structured filters and never force unknown Products through them. |
| Lost placement evidence | Codex rejected silently losing the old public Search capability. | Preserve it in an independent keyword-scoped evidence read with its existing freshness policy and shared collection path. |
| Oversized API expansion | Claude proposed richer `getMany`, public provider status and summaries. | Keep settled reads and status unchanged. Put operating metrics in admin surfaces. Add aggregates only after research-call profiling. |
| Pagination promises | Codex challenged claims of stable paging over changing BSR and dates. | Document live keyset semantics. Do not imply snapshots or call listing dates immutable. |
| History storage | Codex rejected naive per-product extrapolation and Claude's proposal to downsample. | Preserve history. Measure storage by admission tier and control new enrichment rather than delete evidence. |
| Scheduling complexity | Codex challenged copying Handmade's complete adaptive scheduler immediately. | Keep target cadences with admission, an actual token reserve and ordered deferral. Measure before redesigning intervals. |
| Discovery and completeness | Codex challenged treating Finder inventory as all Amazon Merch. | Pilot several sources; measure cost per newly verified Merch Product and report source-relative funnels. |
| One-day estimates | Claude challenged ungrounded hour estimates and broad completion claims. | Deliver verified milestones. Aim for search and a small acquisition pilot today; prove sustained freshness over subsequent operation. |

A term with stored non-Merch text matches may have no default Merch results and no interactive cold
fill. Its recorded interest can drive a bounded background first collection. The result remains
honestly partial. A successful paid collection is never guaranteed to produce visible matches.

## FlyingResearch comparison and evidence limits

| Capability | Fresh evidence | What it means for RankWrangler |
| --- | --- | --- |
| Database research and live Amazon research | Vendor research page advertises both. | Learn the supported business questions without copying the live/stored choice. |
| BSR, listing-date and brand filters | Vendor research page advertises them. | Include reusable search predicates and sorting. |
| BSR/price history and gainers | Vendor research page advertises both. | Reuse existing history. Validate comparable time-window metrics before adding gainers. |
| Keyword extraction and product comparison | Vendor research page and launch email advertise these. | Keep product and keyword evidence composable; inspect real agent calls before inventing summaries. |
| MCP research and historical records | October 19 launch and September 30 update emails advertise them. | Relevant competitive benchmark, not verified exact API parity. |
| Exact MCP inputs, quotas and bulk export | Not verified in this review; settings redirects to sign-in. | Remain explicit unknowns. Do not invent tool names, entitlement, completeness or backend behavior. |

Sources read during the review:

- [FlyingResearch research page](https://flyingresearch.net/research/).
- [FlyingResearch landing page](https://flyingresearch.net/), including its vendor claim of five million Research Designs.
- [October 19 MCP launch email](https://mail.google.com/mail/u/0/#all/1a154eb5a4c6b6b9).
- [September 30 update email](https://mail.google.com/mail/u/0/#all/1a0f32d3df40155a).
- [Keepa Product Finder documentation](https://keepa.com/api-docs/product-finder.html). Finder returns ASINs from Keepa's inventory, has paging limitations and costs 10 tokens plus 1 per 100 ASINs in the result set. Subscription access and real yield remain pilot checks.
- [Keepa API overview](https://keepa.com/api-docs/). Use actual telemetry to size budgets rather than infer token costs from our local response limit.
- RankWrangler public API, catalog-search decision, current routers and dashboard query implementation.
- Handmade's current research recipe, market contract, screener and budget implementation.

## Review receipts

The Claude CLI session was `71951d3b-1c0c-4ef6-87ab-ec192d1d83e9`. It ran with read-only tools.
The actual model reported in the response was `claude-opus-5-5`.

Local prompts, original plan and full responses are retained under
`apps/server/tmp/direction-review/` as `brief.md`, `challenge-2.md`, `challenge-3.md`,
`resolution-4.md`, `plan-before.md`, and `round-1` through `round-4` JSON/Markdown files.
That directory is ignored operator evidence. This file preserves the durable conclusions.

## Checks still required before implementation or scale claims

- Actual index support, Product/date semantics and existing caller migration scope.
- Keepa subscription capacity, real collection cost and visible-result yield.
- SP-API enrichment throughput and source-specific discovery yield.
- Real agent research calls and query latency under representative load.
- Storage growth, overdue backlog and useful freshness by admission tier.

These are measurements to perform, not reasons to ask the user to choose provider mechanics.


## Follow-up scheduling review

The user identified that five stored Products do not establish keyword coverage, and requested
regular keyword checks based on popularity, aligned with Handmade. Codex and Claude completed four
additional rounds. Claude's final response was "AGREE, no direction blockers left."

Settled changes:

- General search returns database matches immediately. Initial keyword checks depend on admission
  and observation history, never the number of matching Products.
- Keywords use hot/warm/cold interval bounds and adapt only after successful observations.
  Buyer-demand rank, personal interest and collection coverage remain separate.
- Head rechecks, exploration, SP-API listing checks and Keepa history have distinct schedules.
- Exploration progresses beyond five pages across bounded jobs. Global Product novelty does not
  establish keyword coverage. Paging remains partial source evidence.
- Preserve Product BSR tiers. Add history admission independently of keepaFetchedAt so incidental
  keyword histories do not create a standing refresh obligation.
- Grandfather baseline identities, including search-only and never-fetched eligible rows.
  Existing active/Merch/BSR gates still apply. New identities default to unadmitted.
- Distinguish successful empty observations, provider failures and budget deferrals.
- Preserve BA shared dataset retrieval and waits. Claude's first follow-up draft incorrectly said
  these reads never wait; source inspection corrected it.
- Proposed refill shares are 20% interactive, 50% history, 20% heads and 10% discovery.
  These starting allocations require actual cost and capacity measurements.
- Existing provider selection stays. New scheduling and admission are proposed work, not claims
  about today's implementation.

Prompts and full responses remain in the same ignored directory under scheduling-round-1,
scheduling-round-2, scheduling-resolution and scheduling-final-check filenames.
The final response is scheduling-final-check-response.md. Session and model remain the same.

## Check competitor behavior before reopening product decisions

Before asking the user to settle a remaining product edge, inspect FlyingResearch's actual
interface or MCP contract first. Report what is observed, what is merely advertised and what
remains unknown. Prefer a proven research convention when it meets the product goal.

On October 23, the public research page confirmed official-brand exclusion controls and a separate
Official Brands browsing capability. This supports retaining those records and offering a filter;
it does not establish the default toggle state or an equivalent MCP input.
Exact lexical, phrase and semantic matching rules were not established by the public material.
The MCP settings page redirected to sign-in, so no fresh tool-schema verification was possible.
Neither open grill question is treated as answered by the user.

## Signed-in interface verification

After the user signed back in, inspected the MCP settings, free Best Sellers page and the linked
official interface guide at https://documentation.flyingresearch.net/#best-sellers.

Verified in the guide:

- Search has Specific search and Title only controls. Specific search prioritizes a specific keyword
  match; Title only restricts listing fields. The guide does not specify exact token, phrase,
  stemming or semantic matching rules.
- Exclude Words accepts up to five entries and requires a search term.
- Hide official brands is a catalog filter; Official Brands also has a separate browsing page.
- The Advanced Options screenshot shows Hide official brands on. This is a pictured configuration,
  not proof of the factory default.
- Standard research also exposes marketplace/product, BSR, price, rating and publication-date filters.
- The guide distinguishes loaded result counts from the full niche and advises broadening wording
  when catalog coverage is sparse.

The live free account gates sorting and filters behind the paid version. The guide contains actual
app screenshots, so control availability is verified from official interface documentation rather
than tested paid search behavior. Its chapter is dated October 8, 2026.

The signed-in MCP settings verify the server URL https://api.flyingresearch.net/mcp, Streamable
HTTP, bearer-token/OAuth authentication and stored-history research examples. Setup help does not
publish tool input schemas. Exact MCP filter parity and matching behavior remain unverified.

Recommendation for the remaining grill edges: use ordinary filterable text search with optional
specific/title-focused controls; do not infer automatic semantic expansion from Flying's AI
marketing. Keep official-brand Products in the database and make hiding them an explicit search
filter. The pictured setting does not establish Flying's factory default.

The user subsequently accepted conventional search and hiding known official brands by default
for research. Records remain stored and callers can include them. Unknown brand status remains
visible. The light grilling session has no remaining product questions; numeric capacity defaults
still require the planned measurements.
