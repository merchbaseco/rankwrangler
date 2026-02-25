# CI Troubleshooting Workflow

Use this workflow when GitHub Actions fails.

## Core Policy

- Start with GitHub logs and check-run metadata first.
- Do not install local tools (`brew`, `npm -g`, etc.) unless the user explicitly asks.

## GitHub-First Flow

1. Identify the failing run/job from PR checks.
2. Pull full logs:

```bash
gh run view <run-id> --job <job-id> --log
```

3. Pull check-run metadata and annotations:

```bash
gh api repos/<owner>/<repo>/check-runs/<check-run-id>
gh api repos/<owner>/<repo>/check-runs/<check-run-id>/annotations
```

4. If needed, watch reruns:

```bash
gh run watch <run-id> --exit-status
```

## Secret Scan (Gitleaks) Notes

The workflow currently runs:

- `gitleaks detect --log-opts='--all'`

This scans commit history in scope, not just working tree contents.

Recommended order of fixes:

1. Replace high-entropy/mock secret-like fixture strings with obvious placeholders.
2. If still a false positive, use a narrow `.gitleaks.toml` allowlist:
   - Scope to specific file path(s)
   - Scope to specific regex(es)
   - Add a short description
3. Do not broadly disable secret scanning.

## Verification Checklist

- Confirm fix with new CI run on the PR head.
- Confirm no real secret was introduced.
- Document in PR comment/description what was changed and why.
