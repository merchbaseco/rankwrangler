# Give research agents a readable Amazon search

Proposed November 19, 2026. Not approved, not built. Once approved, the accepted contract moves
into `docs/reference/mcp.md` and `docs/reference/public-api.md` and this plan is retired.

## Why

Factory's research agents scan Amazon Merch for a niche keyword through RankWrangler MCP. In the
2026-11-18 "2 Bruh Thanksgiving designs" commission the scan was noisy and hard to read:

| Symptom | Cause in today's code |
| --- | --- |
| `getMany` rejected bare ASIN strings. | `products` only accepts `{ asin, marketplaceId }` pairs (`mcp/product-input.ts`). |
| `search` rejected `marketplaceId`. | `get`/`history` take `marketplaceId`; `search` takes `marketplaceIds`. |
| "bruh thanksgiving" returned Halloween costumes, "Glowing Era", "Jesus Loves You Bruh". | The agent called Product `search`, which screens our **stored** catalog, not Amazon. Its term is an AND match over title, brand **and both bullets** (`db/product-search-document.ts`); Merch bullets routinely list holidays ("great gift for Thanksgiving, Christmas…"), so any "bruh" shirt matches. Sorting by `monthlySoldDesc` then floats the popular off-topic ones. |
| Only ~10 results; relevant ones had no `salesRank`. | Stored search only sees Products we already collected; `salesRank` is null until a Keepa refresh lands. |
| Bought count misread as missing. | The filter and sort are named `monthlySold`; the field is `demand.boughtInPastMonth` in search and `get`, and flat `boughtInPastMonth` in keyword results. |
| No way to see the art. | Results carry `thumbnail: { status, url }` only; agents curl `m.media-amazon.com` and stitch contact sheets by hand. |

The capability the agent needed already exists: `rankwrangler_keyword` `operation: results`
returns a dated Keepa Product Search of Amazon's first page (up to 20 Products, sponsored excluded,
with placement, thumbnail, BSR, price and bought count). It is named and placed so that agents do
not find it, and it lacks first-available date, Merch filtering, depth and images.

## Proposal

### 1. One argument shape

| Concept | Field, everywhere | Replaces |
| --- | --- | --- |
| Marketplace | `marketplaceId`, optional, default US (`ATVPDKIKX0DER`). | `marketplaceIds` on Product search. |
| One Product | `asin` + `marketplaceId`. | (unchanged) |
| Many Products | `asins: string[]` (1–200) + one `marketplaceId`. | `products: [{ asin, marketplaceId }]`. |
| An Amazon search phrase | `keyword`. | `term` on keyword results. |
| Text filter over stored data | `query`. | `term` on Product search, `text` on keyword directory search. |

No aliases. Instead every `INVALID_INPUT` for an unknown or misplaced field names the right one
("`marketplaceIds` is not accepted; use `marketplaceId`"), so an agent recovers in one retry.
Cross-marketplace stored search is dropped; nobody calls it, and one marketplace per call keeps
results comparable.

### 2. `amazonSearch`: what Amazon shows for a keyword

Rename keyword `results` to `rankwrangler_keyword` `operation: amazonSearch`, and rename Product
`search` to `operation: catalogSearch`. Both tool descriptions open with the routing rule: "To see
what Amazon shows for a search, use `amazonSearch`. `catalogSearch` screens RankWrangler's stored
catalog and is not Amazon's results."

Input:

```ts
{
  operation: 'amazonSearch',
  keyword: string,
  marketplaceId?: string,            // US only for now; others are INVALID_INPUT
  pages?: 1 | 2 | 3,                 // default 1; each page is one Keepa Product Search page
  merchOnly?: boolean,               // default true
  titleMatch?: 'all' | 'any' | 'off',// default 'all'
  excludeWords?: string[],
  refresh?: boolean,                 // default false, as today
}
```

Output:

```ts
{
  keyword: string,
  marketplaceId: string,
  searchedAt: string,                // ISO; when Amazon was read
  pagesSearched: number,
  amazonResultCount: number,         // organic results Amazon returned before filtering
  results: Array<{
    position: number,                // Amazon organic position, 1-based, never renumbered
    asin: string,
    title: string | null,
    brand: string | null,
    imageUrl: string | null,         // main image, full size
    thumbnailUrl: string | null,     // same image, small (for contact sheets / quick looks)
    boughtInPastMonth: number | null,// Amazon's "N bought in past month" badge; null = no badge
    salesRank: number | null,        // root-category BSR
    salesRankCategory: string | null,
    priceMinor: number | null,
    currencyCode: string | null,
    firstAvailableAt: string | null, // ISO date
    isMerchListing: boolean,
    titleMatches: boolean,           // all keyword words appear in the title (see below)
  }>,
  filteredOut: { notMerch: number, titleMismatch: number, excludedWord: number },
}
```

Freshness keeps the [public retrieval](../docs/decisions/public-retrieval.md) contract: stored
evidence of any age answers at once and evidence older than 24 hours refreshes in the background;
a keyword never searched, a deeper `pages` than stored, or `refresh: true` waits.

Relevance filtering. Amazon's own ordering is the main relevance signal, so filtering only removes
rows and never reorders. `position` keeps gaps, and `filteredOut` says why rows vanished.

- `merchOnly` drops listings whose `isMerchListing` is false.
- `titleMatch: 'all'` keeps a row when every keyword word (case-folded, simple plural stemming,
  stop words ignored) appears in its title. `any` needs one word; `off` keeps everything. Every row
  carries `titleMatches` either way, so a caller can judge the filter.
- `excludeWords` drops rows whose title contains any listed word.
- Bullets are never matched. They are where the holiday-list noise comes from.

### 3. Flat, named sales fields

Every Product shape (`get`, `getMany`, `catalogSearch`, `amazonSearch`) uses the same top-level
names: `boughtInPastMonth`, `salesRank`, `salesRankCategory`, `priceMinor`, `currencyCode`,
`firstAvailableAt`, `imageUrl`, `thumbnailUrl`. The `demand` wrapper goes away; rank drops and
averages stay grouped as `salesRankDrops` and `salesRankAverages`. The `monthlySold` filter and
`monthlySoldDesc` sort become `boughtInPastMonth` and `boughtInPastMonthDesc`. The tool
descriptions say `boughtInPastMonth` is Amazon's bucketed badge (50, 100, 200 … 1000+), not unit
sales, and that null means Amazon shows no badge or we have not observed one.

### 4. Seeing the art

`imageUrl`/`thumbnailUrl` replace `thumbnail: { status, url }` (null when unavailable). Optionally,
`amazonSearch` takes `contactSheet: true` and adds an MCP image content block: one grid of the kept
results' thumbnails, each labelled with its `position`. The agent sees every design in one look
instead of curling and stitching. Generation reuses the server's existing Amazon-image fetch path
(`product-cutout-thumbnail-media.ts`).

### 5. `catalogSearch` noise

`textFields` defaults to `title` instead of `all`. `catalogSearch` stays a screen of stored data
with dated `coverage`; its description says empty or thin results do not describe Amazon.

## What exists versus what is new

| Piece | Today | Change |
| --- | --- | --- |
| Live Amazon first page for a keyword | `keyword.results`, Keepa page 0, ≤20 | Renamed `amazonSearch`; adds `pages` 2–3. |
| Organic position | `organicSearchPlacement`, nested | Flat `position`. |
| Bought badge, BSR, price, title, brand, image | In `keyword.results` | Flat names; `imageUrl` added beside `thumbnailUrl`. |
| First-available date, Merch flag, BSR category | Stored on Products, not in keyword results | Added to `amazonSearch` rows. |
| Merch/title/word filters with counts | None for keyword results | New. |
| Contact sheet | None | New, opt-in. |
| Consistent `marketplaceId`, `asins`, `keyword`, `query` | Mixed | New shape; old names removed. |
| Flat sales fields | `demand.boughtInPastMonth`, `monthlySold` filter | Renamed. |

## Changes for existing callers

This is a breaking change to the public tRPC surface, MCP and CLI; per AGENTS.md there are no
compatibility aliases.

- Factory: update its RankWrangler skill/prompts to call `amazonSearch` for niche scans and use the
  new field names. It is the only known MCP caller.
- `@rankwrangler/http-client`: minor bump (types change). `@rankwrangler/cli`: minor bump;
  `rw keyword results` becomes `rw keyword amazon-search`, `rw product search` becomes
  `rw product catalog-search`, and `--minMonthlySold`-style flags follow the new names.
- Website: Explore and the Product page share `productSearchInput` with the public router
  (`marketplaceIds`, `monthlySoldDesc`), so the renames land there in the same change. Its
  `api.app.*` response shapes need not change.
- MCP server version bumps to 0.7.0 so clients refresh cached tool schemas.

## Open questions for Zach

1. Depth: is `pages` up to 3 worth the extra Keepa tokens per scan, or is page 1 (≤20) enough?
   Per-page token cost needs measuring before the cap is final.
2. Contact sheet: build it now, or ship the URLs first and add it if agents still struggle?
3. `merchOnly` default `true`: right for Factory, but hides competing non-Merch sellers. Keep?
4. Renaming Product `search` to `catalogSearch` (vs. only rewording its description).
