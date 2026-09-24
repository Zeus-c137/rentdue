---
name: audit-refactor
description: Trigger for /audit, or when the user asks to audit, clean up, deduplicate, or reduce complexity across an existing codebase (not a single new feature). This is a whole-repo scan, not a task-scoped search.
---

# Audit & Refactor Pipeline

This is a different shape from the feature pipeline. The feature pipeline searches
*before writing new code*. This one searches the *entire existing codebase* to find
what's already broken, then refactors it safely and incrementally. Never treat these
as the same loop — an audit that turns into one giant automated rewrite is how you
lose the ability to review it, and how a subtle behavior change slips through.

## Phase 1 — Inventory (use real tools, not just LLM reading)

An LLM cannot hold a large repo in context reliably enough to catch every
duplicate. Pair it with static analysis:

- **Copy-paste / near-duplicate detection**: run `jscpd` (or similar) across `src/`
  and capture its report.
- **Dead/unused exports**: run `ts-prune` to find exported symbols nothing imports —
  candidates for deletion, or evidence a "shared" util was actually abandoned.
- **Import graph / circular deps**: run `madge --circular src` — circular deps are a
  common side effect of the "duplicate instead of import" pattern this whole system
  exists to prevent.
- **Complexity hotspots**: run `eslint` with `complexity`, `max-depth`, and
  `max-lines-per-function` rules configured to the limits in
  `rentdue/feature/cyclomatic_complexity.md` (CC 8 / depth 3 / 30 lines), and capture violations.

Delegate this phase to a subagent via `delegate_task` with terminal access; have it
run the above tools and return raw output, not a summary — summaries lose the
specific file:line evidence the next phase needs.

## Phase 2 — Duplication & Complexity Report

A second subagent reads the Phase 1 tool output (not the whole repo) and produces:

```markdown
# AUDIT REPORT

## Duplicate/Near-Duplicate Logic
| Instances (file:line) | Similarity | Proposed canonical location |
|---|---|---|

## Dead Exports (candidates for deletion)
| File:symbol | Confidence it's truly unused |
|---|---|

## Circular Dependencies
| Cycle | Root cause guess |
|---|---|

## Complexity Violations
| Function | File | CC | Depth | Lines | Which limit(s) exceeded |
|---|---|---|---|---|---|

## Prioritized Refactor List
(ordered by risk/impact — highest-traffic duplicated logic first, cosmetic complexity last)
```

## Phase 3 — Incremental Refactor Blueprints (one item at a time, not a mega-PR)

For **each** item in the Prioritized Refactor List, run it through the *same*
blueprint-architect subagent used in the feature pipeline (`rentdue/feature/step2_scrutinize.md`),
but with a refactor-specific framing:

- Identify the single canonical location the duplicates should collapse into.
- List every call site that needs its import changed.
- Explicitly flag any behavioral difference between the duplicate instances (they're
  rarely byte-identical) and require the blueprint to state which behavior wins and why.
- Require existing tests (or new characterization tests if none exist) to cover the
  call sites *before* the refactor lands, so behavior preservation is checkable.

## Phase 4 — Refactor Coder (one blueprint per delegate_task, sequential)

Same `ts-coder`-style subagent as the feature pipeline, one refactor blueprint per
`delegate_task` call, run **sequentially, not in parallel** — refactors that touch
overlapping call sites will conflict if run concurrently. After each one: run the
project's test suite and `tsc --noEmit` before moving to the next item.

## Phase 5 — Adversarial Review (per refactor, same protocol)

Same `rentdue/feature/step3_adversarial_reviewer.md` protocol — Sections E (Purge
Completeness) and F (Directory Boundary) matter *more* here than in the feature
pipeline, because refactors are exactly where "path of least resistance" avoidance
shows up: keeping the old function alive as a shim, leaving `_old.ts` files around,
or dumping a one-off migration script into whatever `src/` folder was already open.
Plus one extra check specific to refactors:
- [ ] Behavior preserved — tests that existed before still pass; new
      characterization tests (if added) pass.
- [ ] The audit's own Blast Radius count (Phase 1 tool output) matches the
      post-refactor zero-hits search — a mismatch here means the "prioritized
      refactor list" item was closed out incompletely, not actually finished.

## Hard rule
Never let a single delegate_task attempt to "refactor the whole codebase." Cap each
delegated refactor to one canonical consolidation. A 40-item Prioritized Refactor List
means 40 sequential Phase 3→4→5 cycles, not one. This is slower but reviewable —
which is the entire point of having an adversarial reviewer in the loop.
