# BA Top Search Terms Purpose

## Scope

This document is specifically about Amazon Brand Analytics **Top Search Terms** data used by
RankWrangler.

It does not describe generic search-term data from other sources.

## Why We Store BA Top Search Terms

RankWrangler stores BA Top Search Terms to provide a historical demand signal that the agent can use
for timing and prioritization.

This data is most valuable for:

- Tracking `searchFrequencyRank` changes over time (daily + weekly snapshots).
- Detecting seasonal ramps and declines (for example, when `st patricks day shirt` starts climbing).
- Prioritizing which keywords the agent should execute on first.
- Giving the dashboard a quick way to inspect demand movement during targeted research.

## Primary Consumer

- Main consumer: CLI agent workflows (listing research, launch planning, ads planning).
- Secondary consumer: dashboard spot checks and manual investigation.

## What BA Top Search Terms Is Not For

- It is not the main keyword discovery engine.
- It is not a complete competitive moat signal for Merch.

Keyword discovery should continue to come from seed expansion, autosuggest, and SERP/listing mining.

## Practical Usage Model

Use BA Top Search Terms as a ranking and timing layer:

1. Discover candidate keywords from seed + autosuggest + SERP.
2. Join candidates with BA Top Search Terms rank snapshots.
3. Prioritize by trend/rank movement and PoD intent quality.
4. Execute listing/design/ads work on highest-priority terms first.

## Current Heuristic Notes

- For Merch workflows, top-3 click/conversion concentration should be low-weight or optional.
- `searchFrequencyRank` trend over time is the highest-value signal in this dataset.
- Daily BA windows are retained for 90 days; weekly windows are retained indefinitely.
- Ingest filtering is term-signal based and no longer depends on Top Clicked Category slots or
  `departmentName` values.
- Ingest filtering blocks known non-PoD commodity patterns (for example `100% cotton`,
  `classic fit`, `twill-taped neck`, `spun-polyester`).
- Ingest filtering blocks stored-value and greeting-card patterns (for example `gift card`,
  `ecard`, `digital code`, `... card`) while preserving broad `gift` intent.
- Ingest filtering blocks seasonal non-PoD merchandise patterns without apparel product signals
  (for example `decorations`, `basket stuffers`, `candy`, `wrapping paper`, `gift bags`,
  `dresses`, `lingerie`, `tablecloth`, `plates/napkins`, `backdrop`, `toys`, `plush`).
- Sleepwear terms like `pajamas`/`pjs` are intentionally kept.
- Ingest filtering recognizes additional product-type signals (for example `raglan`, `v neck`,
  `tote bag`, `popsocket`, `phone case`, `throw pillow`, `tumbler`, `mug`).
