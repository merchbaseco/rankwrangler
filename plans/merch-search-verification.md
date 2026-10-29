# Unified search implementation checkpoint

October 23, 2026. Code is prepared locally; production is unchanged.

## Implemented

- One stored Product query owns text/observed-keyword matching, structured filters, compact metrics,
  live keyset paging and null-last order. Text and keyword-membership candidates are unioned before
  shared filters rather than using a correlated OR across the entire catalog.
- Public API, MCP, CLI and dashboard use that query. The dashboard preserves its explicit catalog
  management defaults and moves filters/order to the server. Unsupported local column sorts are
  disabled. Product and history reads, including extension ASIN lookups, retain their behavior.
- The old external search capability is `keyword.results`, preserving current reuse, collection,
  placement and error behavior. No compatibility alias remains at `product.search`.
- Text searches register deduplicated keyword candidates without dispatching provider work or
  renewing a standing weekly collection window. Dated head coverage remains separate from matches.
- Migration `0039_unified_product_search` adds the indexes and exact official-brand evidence registry.
  The registry starts empty; no title heuristics or guessed official-brand records were seeded.
- Published packages are prepared at 0.11.0 through the repository release script. Nothing published.

## Verification

- Offline environment/contract and repository tests pass. Server suite has 448 passing tests;
  database-dependent tests skip in that lane. Release tests pass.
- Eleven actual PostgreSQL checks pass against an isolated loopback database built from a schema
  export. They exercise the query/service, text semantics, scalar/date/facet filters, observed
  membership, known/unknown classification, official-brand exclusions, missing sort values,
  cursor scope and sub-millisecond timestamp boundaries. Exported SQL was used only for disposable
  test bootstrap; it is not a handwritten application migration.
- CLI build and 17 end-to-end CLI checks pass, including query transport, browsing/filter input,
  opaque paging and keyword-results mutation. Release metadata and packed CLI checks pass.
- Website production build and three focused website checks pass.
- Changed server files pass scoped Biome checks, excluding the existing schema barrel whose
  re-export pattern predates this work. New source modules stay under 300 lines.
- A scoped Comment Sicko pass found no added comments or suppressions to remove. Direct source
  review corrected candidate-query indexability and validated cursor casts.

## Still required

- Migration generation and local upgrade rehearsal are complete after Zach authorized agent
  generation in chat. The generated migration contains one new table and three new indexes, with
  no data rewrite or deletion. The full migration/backup/restore harness and all 57 database checks
  pass. Production application still requires an explicit deployment instruction.
- Real authenticated browser verification remains pending. The local test lifecycle has placeholder
  Clerk credentials, and this Codex worktree cannot resolve the development secrets through 1Password.
  The successful Vite build is not a browser-flow verification.
- Full repository TypeScript checking still reports failures in untouched job/report code and
  missing Bun test declarations. The generated public client and CLI type/build gates pass.
- Adaptive candidate admission, keyword tiers, protected token budgets, exploration and explicit
  recurring history admission remain the next implementation unit. Existing collection behavior
  has not been replaced or claimed as budget-safe.

Sanitized logs and the isolated test harness are available in the ignored
`apps/server/tmp/research-baseline/` directory. The accepted policy and measured limits remain in
[the collection policy](merch-collection-policy.md) and [capacity baseline](merch-capacity-baseline.md).
