# @rankwrangler/cli

Official CLI for RankWrangler.

## Install

```bash
npm install -g @rankwrangler/cli
```

## Usage

```bash
rw --version
rw changelog
rw auth set ak_...
printf %s "$MERCHBASE_API_KEY" | rw auth set --stdin
rw config set storage-dir ~/.config/rankwrangler
rw config get marketplace
rw config unset marketplace
rw products get B0DV53VS61
rw products summary B0DV53VS61
rw products history B0DV53VS61 --metrics bsr,price --bucket week
rw operations get 11111111-1111-4111-8111-111111111111
rw catalog search "retro gardening shirt" --maxAgeSeconds 0
rw catalog query "retro gardening shirt"
rw catalog runs 11111111-1111-4111-8111-111111111111 --limit 20
rw catalog run 22222222-2222-4222-8222-222222222222
# `rankwrangler` is also supported as an alias
```

`rw auth set [apiKey]` stores the Merchbase API key in the platform secure store (`macOS Keychain`
on macOS). `rw auth status` reports whether the CLI will use an env override, stored auth, or no
auth. `rw auth set --stdin` reads the key from standard input for agents and scripts. `rw auth clear`
removes the stored key.

`rw config set storage-dir <path>` saves the active storage directory globally. After that, every
CLI command reads and writes its non-secret config/data from that directory, while preserving
existing config values when switching. `rw config get <key>`, `rw config unset <key>`, and
`rw config reset` inspect or remove non-secret config without touching stored auth.
`MERCHBASE_API_KEY`, `RR_STORAGE_DIR`, `RR_API_URL`, and `RR_MARKETPLACE_ID` override saved CLI
state when set for CI, automation, or agent runtimes.
`rw products get` returns product summary plus bucketed agent history. `rw products summary`
returns the cheap summary only. `rw products history` returns bucketed history (`auto`, `day`,
`week`, or `month`), not raw point series.
`rw products history` output includes `status: ready | empty` and a category-level
`freshness: { stale, updatedAt }` envelope. Product-history Operation identifiers and polling state
are internal to that command; temporary capacity or deadline failures return a retryable error with
a hint. `rw products get` retains its existing embedded Operation-shaped history contract until the
rich Product caller migrates.
Catalog search returns the same pending Operation contract or a reusable source-ordered Search
run. `catalog query` and `catalog runs` inspect existing persisted state without provider work.
`catalog run` separates nullable canonical current Products from immutable observed metrics.
Each product search renews the keyword's 30-day active window, including cached reuse. Active
keywords are eligible for weekly automatic refresh; expired interest becomes inactive without
backfill. Search history identifies Requested search versus Automatic refresh.
`rw --version` prints the installed CLI version.
`rw changelog` prints the latest bundled release notes shipped with the package.

## Development

```bash
bun run cli:build
bun run cli:test:e2e
```

## Maintainers

See the repository [CLI reference](../../docs/reference/cli.md),
[release workflow](../../docs/operations/releases.md), and
[npm publishing workflow](../../docs/operations/npm-packages.md).
