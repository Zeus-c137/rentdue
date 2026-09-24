# RULES — Clean Deprecation & Purge Completeness

## The failure mode this addresses
When a change has a wide blast radius (many call sites, many files), agents take
the path of least resistance: they add the new thing, leave the old thing in place
"for safety," and call the migration done. This looks like progress but is actually
**duplication with extra steps** — now there are two implementations, one of them
silently rotting, and nobody fully migrated. This is a first-class code smell, not
a minor cleanup nit, and must be treated with the same severity as the DRY
violations in `rentdue/feature/step2_scrutinize.md`.

## Definition of "cleanly purged"
A deprecation/migration/rename is only complete when **all** of the following are true:
1. Zero remaining references to the old symbol/file/pattern anywhere in the repo,
   verified by an actual search command — not by memory or by "I updated the ones
   I saw."
2. The old file/function is **deleted**, not renamed to `_old`/`_deprecated`/`_v2`/
   `_backup`/`.bak`/`copy of` and left in the tree. Version control is what
   preserves history — a parallel file is not a substitute for `git log`.
3. No commented-out block of the old implementation left "just in case."
4. No wrapper/shim that calls the new implementation under the old name, **unless**
   the blueprint explicitly declared a deprecation window with an owner and a
   removal date. An undeclared shim is coexistence-as-avoidance and must be
   rejected the same as an undeclared duplicate.
5. Every call site uses the new symbol directly — not through a compatibility layer
   that exists only because updating the call site felt like extra work.
6. Tests that referenced the old implementation are updated or removed to match,
   not left passing against dead code.
7. No orphaned exports left in an index/barrel file pointing at something deleted.

If any of these is false, the migration is **not done** — it is abandoned midway,
and must be flagged as such, not described as complete.

---

## Required: Blast Radius Mapping (before any rename/move/delete)

Before planning a rename, move, consolidation, or deletion, the blueprint (Step 2)
must include a table like this, generated from real search commands, not estimated:

```markdown
## Blast Radius
| Symbol/file being changed | Search command used | Call sites found | Files affected |
|---|---|---|---|
| formatPrice (src/features/cart/utils.ts) | `grep -rn "formatPrice" src/` | 14 | 9 |
```

This number is a contract. The Adversarial Reviewer (Step 3) re-runs the same
search command after the change and the count of remaining references to the OLD
name/path must be **zero** (excluding CHANGELOG/git history references). A
mismatch is an automatic reject — it means either the blueprint undercounted the
blast radius, or the coder didn't finish the migration.

---

## Anti-patterns to reject on sight

### ❌ The permanent "temporary" shim
```typescript
// src/utils/price.ts
/** @deprecated use formatCurrency instead */
export function formatPrice(amount: number): string {
  return formatCurrency(amount, 'USD');
}
```
If this wasn't an explicit, blueprint-declared deprecation window with a removal
date, this is avoidance. The correct move is: update all 14 call sites to call
`formatCurrency` directly, then delete `formatPrice` entirely, in the same change.

### ❌ The parallel "just in case" file
```
src/utils/currency.ts
src/utils/currency_old.ts     <- still imported by 3 files nobody updated
```
Any `_old`/`_v2`/`_backup` file found during review is an automatic reject unless
the blueprint explicitly justified a permanent (not "temporary") coexistence.

### ❌ The partial migration
"I updated the checkout and cart features to use the new pricing util, the
remaining 4 call sites in the admin panel can be migrated later." — This is not
acceptable as a completed task. Either the blueprint scoped the task to only those
features explicitly (and said so up front, before the reviewer sees it as a
surprise), or the migration is incomplete and gets rejected.

### ✅ What "done" looks like
```markdown
## Blast Radius: formatPrice -> formatCurrency
- Search: `grep -rn "formatPrice" src/` -> 14 references, 9 files
- All 9 files updated to import formatCurrency directly
- src/utils/price.ts deleted (formatPrice no longer exists anywhere)
- Post-change search: `grep -rn "formatPrice" src/` -> 0 results
- Tests in price.test.ts merged into currency.test.ts, price.test.ts deleted
```

---

## Adversarial Reviewer enforcement
Add to the Step 3 checklist (see `rentdue/feature/step3_adversarial_reviewer.md` Section A):
- [ ] Post-change search for every old symbol/path named in the blueprint's Blast
      Radius table returns zero hits outside git history.
- [ ] No `_old`/`_deprecated`/`_v2`/`_backup`/`.bak` files introduced without an
      explicit, dated deprecation justification in the blueprint.
- [ ] No commented-out implementation blocks.
- [ ] No compatibility shim introduced that wasn't explicitly planned.

A single ❌ here is an automatic REJECT, same severity as a duplication violation.
