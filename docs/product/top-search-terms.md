---
summary: Explains the Brand Analytics Top Search Terms signal and its research uses and limits.
read_when:
  - researching Amazon demand, seasonality, or search-frequency movement
  - interpreting the Search Terms dashboard and its Amazon results panel
---

# Top Search Terms

RankWrangler stores Amazon Brand Analytics Top Search Terms snapshots as a historical demand and
timing signal. This dataset helps prioritize terms already under consideration; it is not a complete
keyword-discovery engine.

## Available evidence

- Daily and Sunday-through-Saturday weekly windows for the US marketplace.
- Search Frequency Rank plus the top-three clicked and converted shares supplied by the report.
- Trend points and change summaries across stored snapshots.
- A Merch-relevance classification and reason for each stored term.

The default dashboard view shows Merch-relevant terms. A researcher can select the latest day, the
last complete week, or a valid custom day/week; search the terms; filter by rank; and inspect a
selected term's 90-day trend. The adjacent Amazon Results panel is a current SP-API lookup. It is
not a historical Search run and does not preserve result position over time.

Daily datasets cover a rolling 90 days. Weekly datasets are retained for longer trend analysis.
RankWrangler schedules reports around Amazon's availability windows and keeps report progress
separate from the last completed snapshot.

**Brief user story:** An agent notices that `st patricks day shirt` is climbing in Search Frequency
Rank, then inspects current Products to understand the market before making its own assessment.

## Boundaries

- Rank movement indicates relative search frequency, not exact query volume.
- Top-three click and conversion share describe concentration among reported products, not total
  sales.
- Merch relevance is a filtering heuristic; it is not an endorsement or IP-safety check.
- Candidate discovery can also use autosuggest, listing mining, and external catalog search.
