---
summary: Records why Amazon listing existence uses active/deleted status independently from offer and thumbnail availability.
read_when:
  - changing Amazon listing status, Product deletion semantics, or SP-API omission handling
  - adding offer buyability, inventory availability, or another Product availability concept
---

# Amazon Listing Status

Status: Accepted
Date: 2026-08-09

## Decision

RankWrangler models marketplace detail-page existence as
`amazonListingStatus: 'active' | 'deleted'`. Active means Amazon still returns the listing for the
marketplace and ASIN. Deleted means a successful Amazon Catalog lookup omitted the ASIN and the
customer-facing listing is effectively gone. A later successful lookup may restore active status.

Amazon listing status is independent from offer buyability, inventory, discoverability, Product
data completeness, and thumbnail availability. Active does not promise that customers can currently
purchase an offer. Deleted Products retain last-known listing values.

## Tradeoff

A boolean is compact, and `available` resembles familiar Amazon vocabulary, but both obscure the
noun and encourage consumers to interpret catalog existence as stock or offer availability. An
explicit status costs a slightly larger public contract while making both states self-describing
and leaving room for a separate offer-availability model.

## Consequences

- Public API, MCP, CLI, client, website, and extension surfaces use the same active/deleted status.
- Internal unresolved work may use `pending`; caller-synchronous public reads never return it.
- Thumbnail status remains available/unavailable and describes only the image.
- Future buyability or inventory evidence must use a separate field.
