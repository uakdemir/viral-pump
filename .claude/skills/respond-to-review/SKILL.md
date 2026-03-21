---
name: respond-to-review
description: Respond to a spec/analysis document review by categorizing each comment, applying accepted edits to source documents, and writing a structured response. Use when processing review feedback on spec/design documents.
---

# Respond to Review

Respond to a spec/analysis document review. For each accepted item, apply the surgical edit to the source document AND write a response entry.

## Arguments

- First argument: `[ROUND_NUMBER]` — review round number (e.g., `1`, `2`, `3`)
- Second argument: `[SPEC_FILE]` — spec document to edit (e.g., `docs/superpowers/specs/2026-03-21-metrics-collector-design.md`)

## Fixed Files

- Review input: `./tmp/review_analysis.md`
- Response output (appended each round): `./tmp/response_analysis.md`

## Workflow

1. Ensure `tmp/` exists: `mkdir -p tmp`
2. Read `./tmp/review_analysis.md`.
3. For each comment, categorize as one of:
   - **Applied** — valid fix, make the edit
   - **Pushed back** — conflicts with CLAUDE.md rules or is debatable
   - **Deferred** — out of scope, belongs in a later sub-project
   - **Needs clarification** — cannot categorize without more information
4. **If Applied:** Make the surgical edit to `[SPEC_FILE]` as described by the review item. Keep changes minimal.
5. APPEND (do not overwrite) to `./tmp/response_analysis.md` under this header:

```markdown
## Round [ROUND_NUMBER]

### [ID] — [Comment title or short quote]

**Status:** Applied | Pushed back | Deferred | Needs clarification

**[If Applied]**
Change: what was changed and where — file:section or file:line

**[If Pushed back]**
Reason: cite CLAUDE.md rule, architectural principle, or spec section.

**[If Deferred]**
Reason: why this belongs in a later sub-project or is low priority
Suggested timing: sub-project or trigger

**[If Needs clarification]**
Question: what needs to be answered before this can be categorized

---
```

6. Print a summary: `Applied: X | Pushed back: Y | Deferred: Z | Needs clarification: W`

## Rules

- Do not accept scope expansions without flagging them as deferred
- Keep edits surgical — do not rewrite large sections for minor fixes
- Do not accept grammar/punctuation-only changes unless they change meaning

## Example Usage

```
/respond-to-review 1 docs/superpowers/specs/2026-03-21-metrics-collector-design.md
```
