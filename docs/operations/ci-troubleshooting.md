---
summary: Defines the GitHub-first workflow for diagnosing RankWrangler CI failures and secret-scan findings.
read_when:
  - investigating a failing GitHub Actions run or pull-request check
  - resolving a Gitleaks finding without weakening secret scanning
---

# CI Troubleshooting

Start with GitHub Actions evidence. Do not install local tools merely to reproduce CI unless the
user asks.

```bash
gh run view <run-id> --job <job-id> --log
gh api repos/<owner>/<repo>/check-runs/<check-run-id>
gh api repos/<owner>/<repo>/check-runs/<check-run-id>/annotations
```

Watch a rerun when needed:

```bash
gh run watch <run-id> --exit-status
```

For Gitleaks findings, first replace high-entropy fixture values with obvious placeholders. If a
finding is still demonstrably false, use a narrow path- and regex-scoped allowlist. Never broadly
disable history scanning.

Completion means a new run passes on the relevant commit and no real secret was introduced.

## What Quality runs

Quality runs `bun run check:fast` and nothing heavier, deliberately — the server
build lives in full `bun run check`. If a Quality failure looks like a missing
build step, that is the policy working, not a gap. See "Quality is the fast
lane, on purpose" in `operations/development.md`.
