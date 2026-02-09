# /commit - Lint, Fix, and Commit Changes

## Overview
This slash command automates the process of linting, fixing, and committing code changes with a meaningful commit message.

## Process

When you type `/commit`, Claude will:

1. **Run lint and format check** - Execute `yarn format` to fix any linting issues
2. **Fix all linting errors** - Automatically resolve all linting problems found
3. **Review changes** - Run `git status` and `git diff` to understand what's being committed
4. **Generate commit message** - Create a meaningful, conventional commit message based on the changes
5. **Commit all changes** - Stage and commit everything with the generated message

## Commit Message Format

The command follows conventional commit format:

- `fix:` - Bug fixes
- `feat:` - New features
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks
- `docs:` - Documentation updates
- `style:` - Code style/formatting changes
- `test:` - Test additions or changes
- `perf:` - Performance improvements

## Important Notes

- The command will NEVER push to remote unless explicitly asked
- All uncommitted changes will be included in the commit
- The commit message includes the Claude Code attribution footer
- If linting fails after fixes, the command will stop and report the issue

## Example Usage

```
User: /commit
Claude: [Runs yarn format]
        [Fixes any linting errors]
        [Reviews changes]
        [Commits with message like: "fix: resolve linting errors and improve code quality"]
```

## When NOT to Use

- When you have partially staged changes (it commits everything)
- When you need a specific commit message
- When you want to commit only certain files
- When you need to push immediately after committing

For these cases, use standard git commands instead.
