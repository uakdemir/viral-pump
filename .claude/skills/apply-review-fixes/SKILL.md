---
name: apply-review-fixes
description: Apply code review fixes autonomously, iterate until build passes, and write a response file with outcomes. Use when processing code review feedback that requires applying fixes across multiple files with build verification.
---

# Apply Review Fixes

Apply all fixes from a code review file autonomously, iterate until build is clean, and write a response file with outcomes and any pushbacks.

## Arguments

- First argument: `[ROUND_NUMBER]` — review round number (e.g., `1`, `2`, `3`)

## Fixed Files

- Review input: `./tmp/review_code.md`
- Response output (appended each round): `./tmp/response_code.md`

## Workflow

1. Ensure `tmp/` exists: `mkdir -p tmp`
2. Read `./tmp/review_code.md`.
3. For each comment, categorize as one of:
   - **Apply** — valid fix, consistent with architecture and CLAUDE.md
   - **Pushback** — debatable, conflicts with CLAUDE.md rules, or expands scope
   - **Defer** — out of scope, cosmetic-only, or low priority
4. For all **Apply** items: apply fixes to the relevant files.
5. After all fixes are applied, run:
   ```bash
   npx tsc --noEmit
   npx vitest run
   ```
6. If any errors occur: analyze the output, apply corrections, re-run. Do NOT stop until both commands pass with zero errors.
7. APPEND (do not overwrite) to `./tmp/response_code.md` using this format:

```markdown
## Round [ROUND_NUMBER]

### [Issue Title]

**Status:** Applied | Pushed back | Deferred

**[If Applied]**
Change: file:line — what was changed

**[If Pushed back]**
Reason: cite CLAUDE.md rule or architectural principle

**[If Deferred]**
Reason: why / Suggested timing

---
```

8. Print a final summary: `X applied, Y pushed back, Z deferred. Build: PASS/FAIL.`

## Rules

- Do not stop until the build passes cleanly and all comments are addressed
- Respect CLAUDE.md coding guidelines
- If a fix would expand scope significantly, categorize as Defer
- Stage changed files with `git add` after all fixes pass

## Example Usage

```
/apply-review-fixes 1
/apply-review-fixes 2
```
