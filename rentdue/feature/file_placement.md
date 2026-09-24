# RULES — File Placement & Directory Boundaries

## The failure mode this addresses
Once an agent finds a directory that's "valid" for the current task — it's writable,
it's in scope, something related already lives there — that directory becomes a
junk drawer. Tests, shell scripts, fixtures, and one-off files all end up dumped
there regardless of whether that file *type* belongs, because dropping it in the
cwd-adjacent folder is easier than looking up where that type of file actually goes
project-wide. **A directory being reachable and syntactically valid is not the same
as being the correct location.**

---

## Required: classify before you place

Before creating any new file, answer these in order — do not skip to "where does
this feel like it goes":

1. **What TYPE of file is this?** (implementation source, test, shell/build script,
   config, fixture/mock, type definition, documentation, generated/build output)
2. **What does the Memory Map (`rentdue/feature/step1_map.md` output) say is the existing,
   repo-wide convention for that TYPE?** Not "what's nearby," what's the *pattern*
   observed across multiple existing examples of that type.
3. **Does the feature/task at hand change that convention?** (almost never — if you
   think it does, that's a flag to ask, not to quietly diverge.)

If the Memory Map didn't capture file-placement conventions, that's a gap in Step 1,
not a license to guess — send it back to the mapper rather than inventing a
placement.

---

## Canonical taxonomy (defaults — override with whatever the Memory Map actually
observes in this repo; these are fallbacks, not a mandate to restructure an
existing project)

| File type | Default location | Never goes in |
|---|---|---|
| Implementation source (.ts/.tsx) | Its feature/domain directory | A shared utils dir unless it's actually shared logic |
| Unit/integration tests | Co-located `*.test.ts` next to source, OR a parallel `__tests__/`/`tests/` tree — whichever the repo already dominantly uses | Scattered ad hoc inside unrelated feature folders; a second, competing test convention introduced alongside an existing one |
| Shell/build scripts (.sh, .mjs build helpers) | Repo-root `scripts/` or `bin/` | Anywhere under `src/**`, regardless of which feature "needed" the script |
| Config files | Repo root, or `config/` | Nested inside a feature directory because that's where it was needed |
| Type-only files | `src/types/**` (or wherever Memory Map shows types living) | Inline in a feature file when the type is used by more than one feature |
| Fixtures / mocks | `__mocks__/` or `test/fixtures/` per repo convention | Inline in the test file for anything reused across more than one test |
| Documentation | `docs/` or root-level `README`s | Loose `.md` files inside `src/**` |
| Generated/build output | Its configured output dir (`dist/`, `build/`) | Committed alongside source, or used as a scratch space for unrelated files |

---

## Directory Purity Check

For every directory touched during a task, the Coder (and later the Reviewer) list
the distinct file types present after the change:

```markdown
## Directory Purity Check
| Directory | File types present | Matches repo convention? |
|---|---|---|
| src/features/checkout/ | .tsx, .ts, .test.ts | ✅ matches (co-located tests, no scripts) |
| src/features/checkout/ | .tsx, .ts, .sh, .test.ts | ❌ deploy.sh does not belong under src/features/** |
```

Any ❌ here means the file needs to move to its correct location before the change
is considered complete — not a note for "later cleanup."

---

## Anti-patterns to reject on sight

### ❌ Convenience placement
A `.sh` script dropped into `src/features/checkout/` because that's the working
directory when the agent needed to run a one-off migration script — instead of
`scripts/migrate-checkout-prices.sh`.

### ❌ Ad hoc test location
A new `CheckoutSummary.spec.ts` sitting next to `.tsx` files when every other test
in the repo lives in a parallel `__tests__/` tree — introducing a second convention
because it was easier than checking the existing one.

### ❌ "It compiles, so it's fine"
Justifying a placement because imports resolve and the build passes. Compiling is
not evidence of correct placement — it's evidence the language doesn't enforce
architecture, which is exactly why this rule set has to.

### ✅ What correct placement looks like
Blueprint (Step 2) includes a placement line for every new file:
```markdown
## File Placement Declarations
| New file | Type | Convention cited from Memory Map | Final path |
|---|---|---|---|
| currency.ts | shared utility | "all utils live flat in src/utils/*.ts, camelCase, named exports" | src/utils/currency.ts |
| migrate-prices.sh | one-off script | "all scripts live in scripts/, kebab-case" | scripts/migrate-prices.sh |
```

---

## Adversarial Reviewer enforcement
Add to the Step 3 checklist (see `rentdue/feature/step3_adversarial_reviewer.md` Section C):
- [ ] Every new file's type matches the dominant convention for that type observed
      in the Memory Map — not just "matches something already in this directory."
- [ ] No script/config/fixture file leaked into `src/**` feature directories.
- [ ] No second, competing test-location convention introduced alongside an
      existing one.
- [ ] Directory Purity Check table shows no ❌ rows.

A single ❌ here is a REJECT — return to Step 2 (blueprint) if the placement wasn't
planned at all, or to the Coder if the blueprint specified correct placement but
implementation ignored it.
