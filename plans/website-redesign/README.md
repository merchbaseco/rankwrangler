# Website redesign mockups

October 26, 2026. Look-and-feel mockups for the expanded website, made before implementation. The
accepted direction is recorded in
[Website visual direction](../../docs/decisions/website-visual-direction.md); this folder holds the
mockups and the research behind them. Nothing here has shipped.

The live canvas is the private Claude design artifact
<https://claude.ai/artifact/1D1WxedyFwyRyzM5GtVRPq>. The files in `mocks/` are its artboard
sources. They render only inside that canvas: they load its `support.js` runtime, and the top-bar
hat references an asset uploaded there. Product art is drawn in SVG as a stand-in for real
thumbnails, and every number is sample data. Site-wide totals are left as `[N]`.

## Screens

| Mock | Shows |
| --- | --- |
| `explore.dc.html` | The card table: a pannable, zoomable canvas of tilted Product cards with search, tier filters, a minimap and a preview panel. |
| `keywords.dc.html` | The keyword table: search-rank trend, Top 10 shelf, median BSR, fresh sellers, click share and mining state, sortable and filterable by facet. |
| `product.dc.html` | A Product: art and listing properties, a six-stat strip, log-scale rank history with tier bands, keywords and nearby Products. |
| `card-anatomy.dc.html` | The Product card's parts, the five BSR tiers and the niche facet chips. |
| `explore-terminal.dc.html` | Explore under the command bar: a dense ranked table, a detail pane and a risers ticker. |
| `keywords-terminal.dc.html` | Keywords under the command bar: a dense keyword table and a keyword detail pane. |

## Terminal command bar (October 27, 2026)

The terminal command-bar direction ("4a · Command bar" on the canvas) superseded the card table.
Every route sits under one 32px bar (mark, `>` search with ⌘K, view tabs with `g` shortcuts in
place of the mock's F-keys, live status cells, theme, account) and is laid out as hairline panes
of 24px rows in 13px Geist Mono, with Onest kept for product names. `explore.dc.html`, `keywords.dc.html` and `product.dc.html` remain
as the record of the card-table direction; the two `*-terminal` mocks are the current target.

## Product page (October 30, 2026)

Three Product page directions in the Grid language sit on the private canvas
<https://claude.ai/artifact/JQpVfaE8Af4g2ojFwxPFkP>: A · Dossier (the product sidebar beside banded
KPIs, a tier-halftone rank chart and the Keywords grid), B · Header strip, and C · Grid-first. A was
chosen and built.

## Competitive research

Flying Research is the broadest tool: best-seller search, niche scores, live niche pulls,
"winners" and newcomer lists, a keyword tool with Amazon and Google volume, trademark watchlists
and an events calendar. Merch Informer, Merch Dominator and PrettyMerch offer much the same set,
split into separate modules and shown as dense, plain tables. The research could only read vendor
marketing pages, not their signed-in apps.

Gaps the redesign aims at: one search that returns Products, keyword stats and niche context
together; charts and sparklines inside rows; filters that stay consistent across views; and a
designed visual identity. Features still to match: a movers board, a visual niche report, inline
trademark flags, saved lists with alerts, and a seasonal calendar.

## Not yet designed

Niches and Movers views, saved lists, mobile layouts, and empty and error states.
