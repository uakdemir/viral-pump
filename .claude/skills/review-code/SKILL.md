---
name: review-code
description: Review recent repository commits against a spec document and project architecture constraints to find implementation defects and drift. Use when asked to audit the last N commits for bugs, spec drift, security issues, and missing tests.
---

# Review Code

Audit the latest commits with a code-review mindset, using the spec doc as the implementation contract and `CLAUDE.md` as hard architecture constraints.

## Arguments

- First argument: `[COMMIT_COUNT]` — number of commits from HEAD to review (e.g., `3`)
- Second argument: `[SPEC_DOC]` — path to the spec/analysis doc (e.g., `docs/superpowers/specs/2026-03-21-metrics-collector-design.md`)

## Fixed Files

- Review output (overwritten each round): `./tmp/review_code.md`
- Response input (round > 1): `./tmp/response_code.md`

## Workflow

1. Ensure `tmp/` exists: `mkdir -p tmp`
2. Resolve inputs: `[COMMIT_COUNT]` and `[SPEC_DOC]` from user arguments.
3. Read context:
   - `CLAUDE.md` (hard constraints)
   - `[SPEC_DOC]` (spec contract)
4. If `./tmp/response_code.md` exists:
   - Read it first.
   - Do not re-raise pushed-back or deferred items unless new concrete evidence exists in the reviewed commits.
5. Collect target commits:
   - Use the last `[COMMIT_COUNT]` commits from `HEAD`.
   - Review each commit's changed files and patch.
6. For each commit, identify only:
   - `Bug`: logic errors, unhandled edge cases, missing boundary error handling, race conditions, data integrity issues
   - `Spec Drift`: divergences from `[SPEC_DOC]`
   - `Security`: OWASP Top 10, injection risks, auth bypass, exposed secrets
   - `Test Gap`: risky logic paths without meaningful test coverage
   - `Architecture`: conflicts with `CLAUDE.md` rules or project conventions
7. Do not flag:
   - Style preferences not backed by a linter rule
   - Refactoring opportunities that expand scope
   - Missing comments or docstrings
   - Hypothetical future requirements
8. Cite evidence with precise file:line and commit hash.
9. Write output to `./tmp/review_code.md` using the exact template below.

## Output Template (Use Exactly)

---

## [Issue Title]

**Severity:** Critical | High | Medium | Low
**File:** path/to/file.ts:[line_number]
**Commit:** [short hash]
**Category:** Bug | Spec Drift | Security | Test Gap | Architecture

**Description:**
[Clear explanation of the problem]

**Expected (per [SPEC_DOC] or CLAUDE.md):**
[What should happen]

**Suggested fix:**
[Concrete suggestion — be specific enough to act on without ambiguity]

---

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | X     |
| High     | Y     |
| Medium   | Z     |
| Low      | W     |

## Example Usage

```
/review-code 3 docs/superpowers/specs/2026-03-21-metrics-collector-design.md
```
