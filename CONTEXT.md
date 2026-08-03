# RankWrangler

RankWrangler provides source-attributed intelligence about Amazon catalog products and their
marketplace behavior without prescribing what a seller should create.

## Language

**Product intelligence**:
Current and historical, source-attributed observations about Amazon listings and the marketplace
contexts in which they appear.
_Avoid_: Opportunity, recommendation, verdict

**Opportunity assessment**:
A consumer-specific interpretation of product intelligence used to decide whether to pursue a
market idea. It is not itself product intelligence.
_Avoid_: Opportunity score, winning niche

**Product**:
The canonical current state of an Amazon marketplace listing, identified by marketplace and ASIN,
regardless of how RankWrangler discovered it.
_Avoid_: Search product, discovered product

**Catalog query**:
A marketplace-scoped product search definition whose results may be observed repeatedly over time.
_Avoid_: Indexed keyword

**Search run**:
A source-attributed execution of a Catalog query at a specific time.
_Avoid_: Query refresh

**Search result**:
A Product's membership, position, and surfaced metrics within one Search run. Position describes
the source result order, not Amazon organic search rank unless the source guarantees that meaning.
_Avoid_: Product observation, organic rank
