# RankWrangler

RankWrangler provides source-attributed intelligence about Amazon catalog products and their
marketplace behavior without prescribing what a seller should create.

## Language

**Product intelligence**:
Current and historical observations about Amazon Products and the marketplace contexts in which
they appear. Providers supply evidence; RankWrangler owns the provider-neutral domain model.
_Avoid_: Opportunity, recommendation, verdict

**Provider observation**:
Evidence supplied by an external data source before RankWrangler reconciles it into Product
intelligence.
_Avoid_: Product truth, public Product field

**Opportunity assessment**:
A consumer-specific interpretation of product intelligence used to decide whether to pursue a
market idea. It is not itself product intelligence.
_Avoid_: Opportunity score, winning niche

**Product**:
The canonical current state of an Amazon marketplace listing, identified by marketplace and ASIN,
regardless of how RankWrangler discovered it.
_Avoid_: Search product, discovered product

**Merch-listing classification**:
Product-level classification of listing type from bullet evidence. It is separate from Top Search
Terms' `isMerchRelevant` classification and from opportunity assessment.
_Avoid_: Merch relevance, opportunity verdict

**Merch-listing truth**:
The real-world proposition that a Product either is or is not a Merch listing.
_Avoid_: unknown as a third truth value

**Merch-listing knowledge**:
RankWrangler's knowledge of Merch-listing truth: known Merch, known non-Merch, or unknown.
_Avoid_: treating `null` as non-Merch

**Bullet evidence**:
Listing bullet points available to support Merch-listing classification. An available empty set is
evidence; unavailable bullets are not evidence of a non-Merch listing.

**Catalog query**:
A marketplace-scoped product search definition whose results may be observed repeatedly over time.
_Avoid_: Indexed keyword

**Search run**:
A source-attributed execution of a Catalog query at a specific time.
_Avoid_: Query refresh

**Search result**:
A Product's immutable membership and Organic search placement within one Search run.
_Avoid_: Product snapshot, Product observation

**Organic search placement**:
The Product ordinal supplied for one Search run. It is evidence about that run, not a promise of
exhaustive Amazon rank-tracking coverage.
_Avoid_: Rank, position history

**Sales-rank drop**:
An observed numeric improvement in a Product's Best Sellers Rank. It is demand evidence, not a
confirmed sale.
_Avoid_: Sale, unit sold

**Keyword interest**:
A decaying indication that callers still value Search runs for a Catalog query. It enables bounded
automatic collection without creating a permanent rank-tracking subscription.
_Avoid_: Subscription, tracked keyword
