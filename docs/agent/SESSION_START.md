# Session Start

The single page an assistant should read first. Keep this document under ~150 lines.
This page summarizes the **current** operating state. Do not put policies here —
policies belong in `AGENTS.md` and `WORKFLOW.md`.

Last refreshed:
- 2026-05-10 (UTC+09:00)

## What this repository is

Documentation-first 진진거 project. No application code exists yet. The goal is
to lock the product direction, MVP scope, and operating discipline before
implementation begins.

## Read order on session start

1. This file.
2. `AGENTS.md` — canonical rules.
3. `docs/agent/WORKFLOW.md` — operating loop.
4. `docs/agent/INDEX.md` — situational lookup.
5. Only the task-specific doc you actually need.

If a doc here disagrees with `AGENTS.md`, `AGENTS.md` wins.

## Current phase

Phase 0 — product definition draft. No app code. Architecture and platform
choices are drafted but still need approval-queue resolution before bootstrap.

## Active focus

- 진진거 product brief, PRD, brand positioning, feature specs, and E2E scenario
  baselines exist in `docs/project/`, `docs/specs/`, and `docs/qa/`.
- The strongest product framing is: "가족은 거짓을 맞히러 들어오지만,
  결국 서로의 진짜 하루를 알게 된다."
- Approval items for problem statement, MVP scope, and platform remain open until
  the team explicitly resolves and routes them.
- Verification automation (lefthook, markdownlint, lychee, gitleaks) is configured
  but not necessarily installed locally yet. CI runs them on every PR.

## What is safe to do without approval

- Update operating docs in `docs/operations/` and `docs/agent/`.
- Refresh this file when situation changes.
- Add new learnings under `docs/learnings/` for repo-wide micro-conventions.
- Scaffold a spec under `docs/specs/` from the templates.
- Replace placeholders such as `<project-name>` and `<YYYY-MM-DD>` with real values.

## What requires approval before execution

- Choosing the product problem statement, primary user, MVP scope, or platform.
- Initializing a tech stack, framework, or deployment target.
- Adding or removing top-level directories outside the documented document map.
- Any change captured under "Approval Rules" in `AGENTS.md`.

## Critical unknowns

- Formal approval of the drafted problem statement and primary user
- Formal approval of MVP in-scope/out-of-scope boundaries
- Formal approval of platform and bootstrap strategy
- License decision

## Pointers for the most common follow-ups

- Approval queue: `docs/operations/approval-queue.md`
- Active priorities: `docs/operations/todo-plan.md`
- Live recovery log: `docs/operations/current-state.md`
- Product brief draft: `docs/project/product-brief.md`
- Brand positioning: `docs/project/brand-positioning.md`
- Concept alignment review: `docs/project/2026_0510_1529_concept_alignment_review.md`
- PRD: `docs/project/PRD.md`
- E2E baseline: `docs/qa/e2e-scenarios.md`
- Spec scaffolding: `docs/specs/README.md`
- Lightweight conventions: `docs/learnings/README.md`
- Secrets and MCP token policy: `docs/agent/SECRETS_POLICY.md`
- Browser/localhost lanes: `docs/agent/LOCAL_BROWSER_PROFILES_AND_PORTS.md`
- Applying this harness to a different existing repo: `docs/agent/APPLY_HARNESS.md`

## How to refresh this file

This file is meant to stay short and current. Refresh it when any of these change:

- Active focus or current phase
- What is safe vs. requires approval
- The set of critical unknowns
- The most relevant follow-up pointers

Use the `/session-start` command to refresh from current operating docs, or edit
this file directly. Always update the `Last refreshed` line on top.
