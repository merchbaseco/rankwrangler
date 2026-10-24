---
summary: Records the target separation between immediate Product database search and scheduled keyword collection.
read_when:
  - implementing unified Product search or changing when keyword collection starts
  - deciding whether missing search coverage should block reads or trigger a bootstrap flow
---

# Search one growing Merch database

Status: Accepted target; database search prepared in source, collection scheduling pending
Date: 2026-10-23

Product search queries canonical Products immediately. Keyword collection runs independently under
bounded admission and schedules informed by keyword popularity, research interest and observed
change. Callers do not choose live versus stored search. Existing Product identity and history reads
retain their retrieval contracts; observed keyword result evidence remains a separate question.

Research search uses conventional text matching with explicit narrowing controls, rather than
silent expansion into related ideas. Known official-brand Products are hidden by default but
remain stored and explicitly includable. Unknown brand status does not justify exclusion.

Early sparse or empty results are accepted. There is no special launch prepopulation or automatic
first-search handoff. A keyword's collection coverage, rather than its number of matching Products,
determines whether an initial observation is missing. Dated coverage keeps incomplete evidence
honest without exposing provider jobs.

This trades immediate breadth for consistent database reads and controlled collection costs.
Keyword interest does not automatically create an unlimited recurring subscription. History
admission is separate from possessing history, so broad discovery does not silently commit every
new Product to recurring Keepa work.

The existing [Search-run model](catalog-search.md) preserves source observations separately from
current Products. The target changes public search semantics and generic keyword scheduling;
the current [public retrieval decision](public-retrieval.md) still describes deployed behavior.
Execution details remain in the [research plan](../../plans/merch-research.md) and
[collection policy](../../plans/merch-collection-policy.md).
