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
rw auth set rrk_...
printf %s "$RR_LICENSE_KEY" | rw auth set --stdin
rw config set storage-dir ~/.config/rankwrangler
rw config get marketplace
rw config unset marketplace
rw products get B0DV53VS61
rw products summary B0DV53VS61
rw products history B0DV53VS61 --metrics bsr,price --bucket week
RR_LICENSE_KEY=rrk_... rw license status
# `rankwrangler` is also supported as an alias
```

`rw auth set [licenseKey]` stores the license key in the platform secure store
(`macOS Keychain` on macOS). `rw auth status` reports whether the CLI will use an env override,
stored auth, or no auth. `rw auth set --stdin` reads the key from standard input for agents and
scripts. `rw auth clear` removes the stored key.

`rw config set storage-dir <path>` saves the active storage directory globally. After that, every
CLI command reads and writes its non-secret config/data from that directory, while preserving
existing config values when switching. `rw config get <key>`, `rw config unset <key>`, and
`rw config reset` inspect or remove non-secret config without touching stored auth.
`RR_LICENSE_KEY`, `RR_STORAGE_DIR`, `RR_API_URL`, and `RR_MARKETPLACE_ID` override saved CLI state
when set for CI, automation, or agent runtimes.
`rw products get` returns product summary plus bucketed agent history. `rw products summary`
returns the cheap summary only. `rw products history` returns bucketed history (`auto`, `day`,
`week`, or `month`), not raw point series. `rw --version` prints the installed CLI version.
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
