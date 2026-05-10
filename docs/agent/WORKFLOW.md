# Shared Agent Workflow

Canonical workflow for AI assistants in this repository.

## Scope
- This repository starts as a single-project docs-first template.
- Do not introduce extra workflow layers, plugin frameworks, or agent scaffolding unless the user explicitly asks.
- If the repository later grows into a multi-repo or monorepo setup, update [../DOCUMENTATION_SYSTEM.md](../DOCUMENTATION_SYSTEM.md) before spreading ownership rules across folders.

## Read Path
1. Open the assistant entry file at the repo root (`AGENTS.md` is canonical).
2. Read [SESSION_START.md](SESSION_START.md) for the current operating snapshot.
3. Read this file.
4. Read [INDEX.md](INDEX.md).
5. Load only the repo/task doc you need.
6. Read [../DOCUMENTATION_SYSTEM.md](../DOCUMENTATION_SYSTEM.md) before changing document ownership, archive policy, or versioning behavior.
7. For browser or localhost work, read [LOCAL_BROWSER_PROFILES_AND_PORTS.md](LOCAL_BROWSER_PROFILES_AND_PORTS.md).
8. Before touching tokens, keys, or `.env` values, read [SECRETS_POLICY.md](SECRETS_POLICY.md).

## Core Rules
- No false claims. Only report a command, test, browser check, or QA step as passed if you actually ran it.
- Keep diffs small. Change the minimum set of files needed for the task.
- Do not assume assistant-specific files were auto-loaded by another tool.
- Versioned docs are immutable. Copy to a new version instead of editing in place.
- New non-standard docs should use `YYYY_MMDD_HHMM_description.md` unless the repo has a stronger local convention.
- Agent instruction files and workflow docs stay in English. Product-planning docs may stay in Korean.
- Keep the number of active skills and workflow layers minimal.

## Workflow

### Planning
- Inspect the current docs and files before proposing changes.
- Prefer the smallest workable approach over process-heavy rewrites.
- Ask the user only when a decision has real product, architecture, workflow, or irreversible trade-offs.
- If docs conflict, record the conflict in `docs/operations/approval-queue.md`.

### Coding
- Update docs when code, workflow, assumptions, or status actually changed.
- Do not create app code while the repo is still in documentation-first phase unless the user explicitly asks to move into implementation.
- If the repo adopts versioned contract docs later, keep the newest snapshot, archive the previous one, and update references that point to the latest version.

### Testing
- Run checks only for the surface you touched.
- If no meaningful code exists yet, do not invent or imply validation results.
- If an environment prerequisite blocks a check, state the exact command and blocker.
- Do not claim browser, smoke, or QA verification unless you actually performed it.

### Browser Tooling
- Prefer `chrome-devtools` MCP tooling first for browser inspection, UI debugging, screenshots, console/network checks, and manual flow validation.
- Do not start with Playwright unless the user explicitly asks for it, deterministic regression coverage is required, or MCP browser tools cannot complete the task reliably.
- If the project needs assigned localhost ports, profiles, or lanes, document them in [LOCAL_BROWSER_PROFILES_AND_PORTS.md](LOCAL_BROWSER_PROFILES_AND_PORTS.md) before depending on them.

### Completion
- Default output: summarize what changed, what you verified, and what remains.
- Done means the relevant checks were run or the blocker was stated clearly, and any invalidated docs were updated.
- Update `docs/operations/current-state.md` at the end of a real work session.
- Refresh `docs/agent/SESSION_START.md` if the active situation, current phase, or critical unknowns changed.
- Create a formal status report in `docs/status/` only when the user asks for one or the work is a milestone or handoff.
