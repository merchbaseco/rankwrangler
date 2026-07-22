---
summary: Defines RankWrangler documentation ownership, frontmatter, brevity, migration, and validation rules.
read_when:
  - adding, moving, reviewing, or retiring Markdown files under docs
  - deciding whether a claim belongs in product, internals, reference, operations, or decisions
  - correcting documentation that is stale, repetitive, over-detailed, or difficult for agents to route
---

# Docs Policy

RankWrangler docs preserve knowledge that is costly to recover from code: product contracts,
ownership boundaries, source precedence, exact external surfaces, operational workflows, and
accepted tradeoffs.

Do not document what a well-named type, procedure, script, or test already makes obvious.

## Surfaces

| Section | Owns | Excludes |
| --- | --- | --- |
| `product/` | Human- and agent-visible capabilities, states, edge cases, and non-goals. | Source tours and job mechanics. |
| `internals/` | Sources of truth, data flow, ownership, freshness, and invariants. | Marketing copy and exhaustive inventories. |
| `reference/` | Exact APIs, data shapes, identifiers, commands, precedence, and executable behavior. | Target-only contracts and broad rationale. |
| `operations/` | Commands, verification, deployment, repair, and recovery. | Product specifications. |
| `decisions/` | Accepted tradeoffs and their consequences. | Task lists and implementation diaries. |

Split pages that cross surfaces. Link to the owner instead of repeating its contract.

## Frontmatter

Every Markdown file under `docs/` starts with:

```yaml
---
summary: One specific sentence naming what this page owns.
read_when:
  - a concrete task or diagnostic trigger using RankWrangler nouns
---
```

Use specific, varied `read_when` hints. Run `bun run docs:list` at task start and after docs
changes.

## Writing Rules

- Prefer breadth over exhaustive depth.
- State durable contracts directly and in present tense.
- Use nouns from [the domain glossary](../CONTEXT.md).
- Use tables for ownership, state, precedence, and command maps.
- Use bullets for invariants, limitations, and non-goals.
- Keep current behavior separate from accepted target behavior.
- Put exact commands only in reference or operations pages.
- Remove release diaries, source-file tours, test inventories, and duplicated motivation.
- Let readers inspect code for ordinary implementation detail.

## Change Workflow

For substantive documentation changes:

1. Read the old page and relevant source.
2. Assign each durable claim to one owning surface or discard it as stale.
3. Draft from evidence, then cut content that code already explains.
4. Run an independent review for contradictions, missing context, overlap, and excess prose.
5. Validate frontmatter, local links, routes, and stale names.

Retire an old page only after its useful claims have destinations.

## Completion Contract

- The final tree is the documentation source of truth; no parallel `specs/`, `server/`,
  `ai-commands/`, or flat legacy hierarchy remains.
- Every page has useful `summary` and `read_when` metadata.
- Every local Markdown link resolves.
- `bun run docs:list` presents a clean task-routed index.
- Reference pages describe executable behavior only.
- An independent reviewer checks substantive pages before completion.
