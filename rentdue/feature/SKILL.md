---
name: build-feature
description: Run the full Map -> Blueprint -> Code -> Review pipeline for a feature task, invoked as /build-feature <task description>. Use whenever implementing a new feature or non-trivial change in this repo, instead of coding directly. For audits/cleanups of existing code, use audit-refactor.md (/audit) instead.
---

# /build-feature — Pipeline Orchestrator

You are running as the main thread. You do not do the mapping, planning, coding, or reviewing yourself — you dispatch each to a separate worker, persist its output to scratch files, and enforce the loop. This is what turns the step and rules documents in this directory into an actual automatic loop instead of advice the agent can ignore.

All pipeline documents live in this directory (`rentdue/feature/`). There are no `skills/` or `rules/` directories in this repo — any reference to those paths in older docs is stale; the canonical files are the ones listed below.

## Setup
1. Create a scratch dir for this run: `rentdue/scratch/<slug-of-task>/`.
2. Set `attempt = 1`, `max_attempts = 3`.

## Loop

**Step 1 — Map (only on attempt 1; memory map doesn't change across retries)**
- Dispatch the `codebase-mapper` worker (it follows `rentdue/feature/step1_map.md` exactly), prompt = the task description.
- Write its full output to `rentdue/scratch/<slug>/memory-map.md`.

**Step 2 — Blueprint**
- Dispatch the `blueprint-architect` worker (it follows `rentdue/feature/step2_scrutinize.md` exactly), prompt = task description + contents of `memory-map.md` + (if attempt > 1) the previous verdict's blocking issues, if the verdict said to return here.
- Write output to `rentdue/scratch/<slug>/blueprint.md`.
- Touch `rentdue/scratch/<slug>/blueprint-approved` (empty marker file) — this is what the enforcement hook (`rentdue/feature/gate-feature-edits.sh`) checks for before allowing any Edit/Write to feature code.

**Step 3 — Code**
- Dispatch the `ts-coder` worker (it follows `rentdue/feature/ts-coder.md` exactly), prompt = contents of `blueprint.md` + (if attempt > 1) the previous verdict's blocking issues, if the verdict said to return here.
- Record its diff summary to `rentdue/scratch/<slug>/diff-summary-<attempt>.md`.

**Step 4 — Review**
- Dispatch the `adversarial-reviewer` worker (it follows `rentdue/feature/step3_adversarial_reviewer.md` exactly), prompt = contents of `memory-map.md`, `blueprint.md`, and the diff summary. The reviewer also enforces `rentdue/feature/cyclomatic_complexity.md`, `rentdue/feature/file_placement.md`, and `rentdue/feature/clean_deprecation.md`.
- Write output to `rentdue/scratch/<slug>/verdict-<attempt>.md`.

## Branch on verdict
- **APPROVE** → report success to the user with a short summary (files touched, verdict location). Stop.
- **REJECT**, `attempt < max_attempts` → increment `attempt`. Re-run from Step 2 if the verdict says the issue is architectural, or Step 3 if implementation-only. Pass the blocking issues forward explicitly.
- **REJECT**, `attempt == max_attempts` → stop. Report to the user: this needs a human. Show the last verdict's blocking issues verbatim. Do not keep retrying silently past the cap — repeated failure usually means the task or existing codebase has an ambiguity a human should resolve.

## Non-negotiable
Never skip Step 1 or Step 4. Never let the main thread write feature code directly instead of dispatching to the Step 3 worker — the whole point of worker isolation is that the coder only ever sees the blueprint, not a context window full of earlier "easier" approaches it was tempted by.
