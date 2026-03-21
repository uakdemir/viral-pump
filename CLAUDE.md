# ViralEngine — Claude Code Instructions

## Session Bootstrap

1. Read `CLAUDE.md` (this file)
2. Read `docs/architecture/architecture.md` for system overview
3. Read `docs/backlog.md` for planned work
4. Check `docs/superpowers/plans/` for active implementation plans

## Git & Commits

- NEVER run `git commit` — the user manages all commits personally.
- Use `git add` to stage files after completing code tasks.
- After staging, suggest a commit message with a list of staged files.
- Format: `Suggested commit: <message>` with file list.
- This applies only to source code changes. Analysis docs, plans, and tmp files do not need commit suggestions.

## Coding Guidelines

1. Follow existing architecture, folder structure, and conventions.
2. Before writing code, understand the requirements. If something important is unclear, ask.
3. Prefer simple, standard solutions over clever ones. Optimize for maintainability.
4. No `any` types unless explicitly justified.
5. Run `npx tsc --noEmit` after multi-file changes and report errors before considering the task complete.
6. Run `npx vitest run` after implementation changes to verify no regressions.
7. Keep UI changes consistent with existing dashboard design.
8. Do not make assumptions that change architecture or behavior — ask first.
9. Keep changes localized. Refactor nearby code only if it reduces complexity without expanding scope.
10. Validate edge cases for user-facing flows and external integrations.

## Review Workflow

- Use `/review-code [COMMIT_COUNT] [SPEC_DOC]` to audit commits against a spec.
- Use `/apply-review-fixes [ROUND_NUMBER]` to apply Codex review findings.
- Use `/respond-to-review [ROUND_NUMBER] [SPEC_FILE]` to respond to spec reviews.
- Review files: `tmp/review_code.md`, `tmp/response_code.md`, `tmp/review_analysis.md`, `tmp/response_analysis.md`

## Pre-Deploy Checklist

1. `npx tsc --noEmit` — zero TypeScript errors
2. `npx vitest run` — all tests passing
3. Verify schema column names when writing new DB queries (read the Drizzle schema file)
4. No `any` types introduced without justification

## Response Timestamps

After every response, include a timestamp in the user's local timezone by running `date '+%Y-%m-%d %H:%M:%S %Z'` and appending it to the end of the response.

Format: `[timestamp: 2026-03-20 13:15:33 +03]`
