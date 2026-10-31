---
summary: Records the accepted visual direction for the RankWrangler website redesign and the directions rejected on the way.
read_when:
  - building or restyling Explore, Keywords, Product or other website screens
  - choosing BSR tier colours, the banner, typography or density for the website
  - proposing a new logo, illustration style or loading animation for RankWrangler
---

# Website visual direction

Status: Accepted; the Grid direction superseded the terminal command bar on 2026-10-28 (which had
superseded the card table on 2026-10-27)
Date: 2026-10-26

The website becomes a dense, warm-paper research tool whose primitive is the Merch Product card.
The mockups and their notes live in [the redesign plan](../../plans/website-redesign/README.md).

## The direction

The Grid direction (mocks Grid J/K for Explore dark and light, Grid I for Keywords, OptsL for the
row marks; see the redesign plan).

- **Handmade-style chrome.** One full-width near-black banner on every route, in both themes: the
  hat, the view tabs (`g e`, `g k`), the page's search (⌘K or `/`), a status pill from real data
  only (keyword sync and, on Keywords, the scan), saved (not built), theme, settings and account.
  Under it, one rounded content surface inset 6px from the window.
- **Sidebar, KPI header, flat grid, pager.** Explore and Keywords share one layout: a filter
  sidebar with result counts bound to the URL (a Sheet below 72rem), KPI cells over their column
  groups (a figure over a dot-matrix band), a flat ranked hairline grid, and a pager
  ("1–50 of N · Page x of y · Rows 50"). A row click or ⏎ opens the product (or Explore's results
  for a keyword); there is no side detail pane.
- **Product page in the same frame** (mock A · Dossier; see the redesign plan): a product
  sidebar where the filters sit (art, name, brand, actions, listing, niche rows that open Explore),
  then one scrolling column of the KPI header with its bands, the rank history as a halftone whose
  dots take the ink of the tier band they reach, and the keywords grid in the Keywords columns with
  this design's block ringed on each Top 10 shelf.
- **Density.** Comfortable rows are 56px with 40px art (Grid J); compact keeps the 24px line.
  14px body, 13px secondary, 15px names, 16px BSR figures, 20px KPI figures.
- **Two faces.** Onest for the UI and names; Geist Mono for every figure. No display face.
- **Warm paper neutrals** in light, graphite in dark, with one azure accent for actions,
  selection and upward moves (burnt orange for downward).
- **Five BSR tiers are the data palette** and the only saturated fills on data surfaces: Elite
  ≤2.5K (violet), Hot ≤15K (orange), Strong ≤60K (amber), Steady ≤250K (teal), Slow (grey). They
  also differ in lightness, so their order reads without colour vision. Thresholds are a starting
  guess to tune against sell-through.
- **BSR is a plain tier-coloured figure** (no ring, pill or bar, no direction glyph: the 7d column
  carries direction). The 30-day rank is a halftone area: the exact 1.5px line over a dotted
  fill in the tier ink.
- **Art.** Background-removed cutouts sit on the well; when only Amazon's white image exists it
  sits on an inset light tile.
- **The Top 10 shelf.** Each keyword row shows its top ten Merch results as ten tier-coloured
  blocks in rank order. It is the signature data component.
- **The mark stays the cowboy hat** already on the site (`apps/website/public/cowboy-hat.png`).

## Rejected

| Direction | Why it lost |
| --- | --- |
| Airy first pass with large type | Read as generated, not as a production tool. |
| Cel-shaded identity (ink outlines, hard shadows, slab display type) | The flatter, denser paper style was preferred. |
| The card table (pannable canvas of tilted Product cards, floating glass chrome) | Built, then superseded by the terminal command bar: denser, keyboard-driven, and one layout language across every route. |
| The terminal command bar (32px bar, 13px-only type, hairline panes, side detail pane, risers ticker) | Built, then superseded by the Grid direction: filter counts, KPI bands and a paged grid read better at millions of rows. |
| New marks: lasso, sheriff star, horseshoe, longhorn, galloping and one-line horse | None beat the existing hat. |

A one-line horse that draws itself as a loader was explored and set aside with the logo work.
