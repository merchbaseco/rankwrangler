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
