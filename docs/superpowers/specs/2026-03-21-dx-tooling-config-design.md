# DX Tooling & Claude Configuration — Design Spec

**Date:** 2026-03-21
**Scope:** Claude Code settings, hooks, skills, ESLint/Prettier, pre-commit hooks, CLAUDE.md enhancements
**Goal:** Eliminate permission friction, formalize Codex-Claude review workflow, enforce code quality at commit time

---

## 1. Project Settings — `.claude/settings.json`

### 1.1 Permissions

**Allow (auto-approved):**

| Category    | Patterns                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| File tools  | `Edit`, `Write`, `Read`, `Glob`, `Grep`, `Task`, `WebFetch`, `WebSearch`                                              |
| Build/test  | `Bash(npm run *)`, `Bash(npm test *)`, `Bash(npx *)`, `Bash(node *)`, `Bash(tsc *)`                                   |
| Filesystem  | `Bash(mkdir *)`, `Bash(ls *)`, `Bash(pwd)`, `Bash(wc *)`                                                              |
| Docker      | `Bash(docker-compose up *)`, `Bash(docker-compose ps)`, `Bash(docker-compose exec *)`                                 |
| Git (read)  | `Bash(git status*)`, `Bash(git diff*)`, `Bash(git log*)`, `Bash(git show*)`, `Bash(git branch*)`, `Bash(git remote*)` |
| Git (stage) | `Bash(git add *)`                                                                                                     |
| Database    | `Bash(psql *)`                                                                                                        |
| HTTP        | `Bash(curl *)`                                                                                                        |
| Process     | `Bash(pkill *)`, `Bash(kill *)`, `Bash(lsof *)`                                                                       |
| MCP tools   | `mcp__plugin_context7_context7__resolve-library-id`, `mcp__plugin_context7_context7__query-docs`                      |

**Deny (always prompt):**

| Category  | Patterns                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Git write | `Bash(git push*)`, `Bash(git commit*)`, `Bash(git rebase*)`, `Bash(git reset*)`, `Bash(git checkout*)`, `Bash(git merge*)`, `Bash(git clean*)`, `Bash(git stash*)` |

### 1.2 Sandbox

```json
{
  "sandbox": {
    "enabled": true,
    "filesystem": {
      "allowWrite": ["./"]
    }
  }
}
```

Network allow for development services and external APIs:

- `192.168.64.1:5432` (Postgres)
- `api.coingecko.com` (data source)
- `open.er-api.com` (data source)
- `api.twitter.com`, `upload.twitter.com` (Twitter posting + metrics)
- `graph.facebook.com`, `graph.instagram.com` (Instagram posting + metrics)
- `api.telegram.org` (Telegram posting)
- `api.linkedin.com` (LinkedIn posting)
- `api.pinterest.com` (Pinterest posting)
- `api.anthropic.com` (Claude LLM)
- `api.openai.com` (OpenAI LLM)

### 1.3 Hooks

**PermissionRequest** — Notify user when Claude is blocked on permission:

```bash
/home/umut/claude-notify.sh 'Claude Code (WSL) needs your attention'
```

**PostToolUse (Edit|Write)** — Type-check after every file change:

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Trade-off note:** This adds ~3-8s per edit. During multi-file refactors this can accumulate. If latency becomes a problem, move this check to the Stop hook instead. Starting with per-edit to catch errors early.

**Stop** — Notify user when Claude finishes and is waiting for input:

```bash
/home/umut/claude-notify.sh 'Claude Code (WSL) task completed'
```

---

## 2. Skills — Codex-Claude Review Workflow

**File write semantics:** All skills must `mkdir -p tmp` before writing. Review output files (`tmp/review_code.md`, `tmp/review_analysis.md`) are **overwritten** each round — the reviewer produces a fresh review. Response files (`tmp/response_code.md`, `tmp/response_analysis.md`) are **appended** — each round adds a new section so the full history is preserved.

### 2.1 `/review-code`

**Purpose:** Review recent commits against a spec doc to find bugs, spec drift, security issues, and test gaps.

**Path:** `.claude/skills/review-code/SKILL.md`

**Parameters:**

- `[COMMIT_COUNT]` — number of commits from HEAD to review
- `[SPEC_DOC]` — path to the spec/analysis doc (e.g., `docs/superpowers/specs/2026-03-21-metrics-collector-design.md`)

**Fixed files:**

- Review output: `tmp/review_code.md`
- Response input (round > 1): `tmp/response_code.md`

**Workflow:**

1. Read `CLAUDE.md`, spec doc, and `tmp/response_code.md` (if exists)
2. Collect last N commits, review each changed file
3. Flag only: Bug, Spec Drift, Security, Test Gap, Architecture violation
4. Do NOT flag: style preferences, missing comments, hypothetical future requirements
5. Write findings to `tmp/review_code.md` using structured template (severity, file:line, commit, category, description, expected, suggested fix)
6. Include summary table (Critical/High/Medium/Low counts)

**Argument parsing:** The SKILL.md must include instructions for Claude to parse positional arguments from the user's slash command. First argument = `COMMIT_COUNT`, second = `SPEC_DOC`. Example: `/review-code 3 docs/superpowers/specs/2026-03-21-metrics-collector-design.md`

**Codex agent:** `.claude/skills/review-code/agents/openai.yaml` — minimal dispatch config:

```yaml
interface:
  display_name: 'Review Code'
  short_description: 'Review recent commits against spec and architecture'
  default_prompt: 'Use $review-code to review the last [COMMIT_COUNT] commits against [SPEC_DOC] and write findings to ./tmp/review_code.md (reading ./tmp/response_code.md if present).'
```

### 2.2 `/apply-review-fixes`

**Purpose:** Apply code review fixes autonomously, iterate until build passes, write structured response.

**Path:** `.claude/skills/apply-review-fixes/SKILL.md`

**Parameters:**

- `[ROUND_NUMBER]` — review round (1, 2, 3...)

**Fixed files:**

- Review input: `tmp/review_code.md`
- Response output: `tmp/response_code.md`

**Argument parsing:** First argument = `ROUND_NUMBER`. Example: `/apply-review-fixes 2`

**Workflow:**

1. Ensure `tmp/` exists (`mkdir -p tmp`)
2. Read `tmp/review_code.md`
3. Categorize each item: Apply / Pushback / Defer
4. Apply all "Apply" fixes
5. Run `npx tsc --noEmit` and `npx vitest run` until both pass
6. Append structured response to `tmp/response_code.md` (status per item + change details or reasoning)
7. Print summary: `X applied, Y pushed back, Z deferred. Build: PASS/FAIL.`

### 2.3 `/respond-to-review`

**Purpose:** Respond to spec/analysis document reviews.

**Path:** `.claude/skills/respond-to-review/SKILL.md`

**Parameters:**

- `[ROUND_NUMBER]`
- `[SPEC_FILE]` — spec document to edit

**Fixed files:**

- Review input: `tmp/review_analysis.md`
- Response output: `tmp/response_analysis.md`

**Argument parsing:** First argument = `ROUND_NUMBER`, second = `SPEC_FILE`. Example: `/respond-to-review 1 docs/superpowers/specs/2026-03-21-metrics-collector-design.md`

**Workflow:**

1. Ensure `tmp/` exists (`mkdir -p tmp`)
2. Read `tmp/review_analysis.md`
3. Categorize: Applied / Pushed back / Deferred / Needs clarification
4. For "Applied" items: make surgical edit to `[SPEC_FILE]`
5. Append response to `tmp/response_analysis.md`
6. Print summary counts

---

## 3. ESLint + Prettier + Pre-commit Hooks

### 3.1 Prettier — `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "avoid"
}
```

### 3.2 ESLint — `eslint.config.js`

Flat config (ESLint 9+) with:

- `@eslint/js` recommended
- `typescript-eslint` recommended
- `eslint-config-prettier` to disable conflicting rules
- Custom rules:
  - `@typescript-eslint/no-unused-vars`: warn (allow `_` prefix)
  - `@typescript-eslint/no-explicit-any`: warn
  - `no-console`: warn (we use pino logger)
- Ignores: `node_modules/`, `dist/`, `assets/`, `tmp/`, `src/web/dashboard/dist/`

### 3.3 Pre-commit Hook — `husky` + `lint-staged`

**Package.json additions:**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["prettier --check", "eslint --max-warnings 0"],
    "*.{json,md,yml}": ["prettier --check"]
  }
}
```

**Behavior:**

- On `git commit`: check formatting and lint on staged files only
- Does NOT auto-fix (user controls commits manually)
- Blocks commit if errors found

### 3.4 VS Code — `.vscode/settings.json`

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "files.eol": "\n",
  "github.copilot.enable": { "*": false },
  "github.copilot.inlineSuggest.enable": false,
  "editor.inlineSuggest.enabled": false
}
```

### 3.5 NPM Packages

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-config-prettier prettier husky lint-staged
```

### 3.6 Initial Formatting Pass

After creating `.prettierrc`, run once to bring existing files into compliance:

```bash
npx prettier --write 'src/**/*.ts' 'tests/**/*.ts' 'drizzle.config.ts' 'vitest.config.ts'
```

Commit this formatting change separately before enabling the pre-commit hook.

---

## 4. CLAUDE.md Enhancements

### 4.1 Session Bootstrap

```markdown
## Session Bootstrap

1. Read `CLAUDE.md` (this file)
2. Read `docs/architecture/architecture.md` for system overview
3. Read `docs/backlog.md` for planned work
4. Check `docs/superpowers/plans/` for active implementation plans
```

### 4.2 Git & Commits

```markdown
## Git & Commits

- NEVER run `git commit` — the user manages all commits personally.
- Use `git add` to stage files after completing code tasks.
- After staging, suggest a commit message with a list of staged files.
- Format: `Suggested commit: <message>` with file list.
- This applies only to source code changes. Analysis docs, plans, and tmp files do not need commit suggestions.
```

### 4.3 Coding Guidelines

```markdown
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
```

### 4.4 Review Workflow

```markdown
## Review Workflow

- Use `/review-code [COMMIT_COUNT] [SPEC_DOC]` to audit commits against a spec.
- Use `/apply-review-fixes [ROUND_NUMBER]` to apply Codex review findings.
- Use `/respond-to-review [ROUND_NUMBER] [SPEC_FILE]` to respond to spec reviews.
- Review files: `tmp/review_code.md`, `tmp/response_code.md`, `tmp/review_analysis.md`, `tmp/response_analysis.md`
```

### 4.5 Pre-Deploy Checklist

```markdown
## Pre-Deploy Checklist

1. `npx tsc --noEmit` — zero TypeScript errors
2. `npx vitest run` — all tests passing
3. Verify schema column names when writing new DB queries (read the Drizzle schema file)
4. No `any` types introduced without justification
```

### 4.6 Preserved from Current

The existing timestamp rule stays:

```markdown
## Response Timestamps

After every response, include a timestamp by running `date '+%Y-%m-%d %H:%M:%S %Z'`.
Format: `[timestamp: 2026-03-20 13:15:33 +03]`
```

---

## 5. Files Created / Modified

| Action | Path                                            | Purpose                                                                      |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Create | `.claude/settings.json`                         | Permissions, sandbox, hooks (committed to git — shared team config)          |
| Create | `.claude/skills/review-code/SKILL.md`           | Codex code review skill                                                      |
| Create | `.claude/skills/review-code/agents/openai.yaml` | Codex agent dispatch config (display name + default prompt)                  |
| Create | `.claude/skills/apply-review-fixes/SKILL.md`    | Apply review fixes skill                                                     |
| Create | `.claude/skills/respond-to-review/SKILL.md`     | Respond to spec review skill                                                 |
| Create | `.prettierrc`                                   | Prettier config                                                              |
| Create | `eslint.config.js`                              | ESLint flat config                                                           |
| Create | `.vscode/settings.json`                         | VS Code editor settings                                                      |
| Modify | `CLAUDE.md`                                     | Add bootstrap, guidelines, review workflow, checklist                        |
| Modify | `package.json`                                  | Add dev dependencies + lint-staged config                                    |
| Reset  | `.claude/settings.local.json`                   | Clear accumulated one-off permissions (gitignored — personal overrides only) |

---

## 6. What Was NOT Ported

| Item                                      | Reason                                          |
| ----------------------------------------- | ----------------------------------------------- |
| `analyze-milestone` skill                 | Superpowers brainstorming skill covers this     |
| `implement-milestone` skill               | Superpowers executing-plans skill covers this   |
| `review-fix` skill                        | Duplicate of `apply-review-fixes`               |
| `AGENTS.md`                               | Reviewer-first mode not needed for this project |
| `hotspots.md`                             | Small codebase, not needed                      |
| `titansigma-specific-rules.md`            | Project-specific to TitanSigma                  |
| `settings.local.json` one-off permissions | Replaced by proper `settings.json`              |
