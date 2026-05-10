# Current State / Session Recovery

Last updated:
- 2026-05-10

## Current Phase
- Phase 1. MVP spec locked. No application code yet. Ready to bootstrap Next.js + Supabase per ADR-0001 once P0 approval items resolve.

## Repository Status
- Git-initialized on `master` (default branch may be renamed to `main` if/when ADR-0004 §"Rollback" applies).
- No application code exists yet.
- Product direction, MVP scope, platform, and bootstrap strategy are all decided and routed via approval queue → ADR-0001..0004.
- 진진거 brand, problem, F1–F8 specs, Supabase data model SoT, production safety review, and 5 E2E scenarios are all in place.
- Verification automation (lefthook + markdownlint + lychee + gitleaks + GitHub Actions) configured but not necessarily installed locally yet.
- `AGENTS.md` is the canonical entry; `CLAUDE.md` and `.cursor/rules/00-entry.mdc` are thin pointers.

## Completed in the spec lock-in pass (2026-05-10)
- `docs/project/product-brief.md` — locked product direction, MVP scope, success criteria.
- `docs/project/brand-positioning.md` — brand statement, problem definition, AI role, tone.
- `docs/project/PRD.md` — 16-section master PRD with B-1..B-12 business rules, NFR, OQs, release plan, glossary.
- `docs/project/2026_0510_1529_concept_alignment_review.md` — concept review against the supplied criteria.
- `docs/specs/2026-05-10-*.md` — F1..F8 feature specs (Gherkin / EARS).
- `docs/architecture/data-model.md` — Supabase schema SoT including:
  - 14 domain tables across `public` / `private` / `auditing` schemas.
  - 9 ENUM types.
  - 7+ RPC functions (create_family, join_family, create_quiz, submit_answer, mark_quiz_revealed_if_needed, reveal_quiz_now, solve_public_post, auto_reveal_expired).
  - Triggers for capacity, option invariants, weekly score, chemistry, comment soft-delete score adjustment, counters, set_updated_at.
  - Safe views (quiz_option_safe_v / quiz_option_revealed_v / public_post_safe_v / family_member_profile_v) to mask answer columns and family identity.
  - Full RLS policy + revoke/grant lockdown.
  - Production safety review (§15) with 12 findings catalogued, all CRITICAL/HIGH fixed inline.
  - Vercel + Supabase deployment checklist (§14).
- `docs/architecture/adr/2026-05-10-*` — ADR-0001 tech stack, ADR-0002 1-family-per-user, ADR-0003 KST timezone, ADR-0004 RPC + RLS pattern.
- `docs/qa/e2e-scenarios.md` — 5 critical journeys aligned with F1–F8.
- `docs/operations/approval-queue.md` — items 1–4 resolved and routed to ADR/specs; items 5–10 active.
- `docs/operations/todo-plan.md` — re-prioritized for bootstrap path (P0 spec lock-in → P1 bootstrap → P2 core loop → P3 retention → P4 QA → P5 launch).
- `docs/agent/SESSION_START.md` — refreshed to spec-locked phase.

## Confirmed Operating Principles
- Documentation comes before implementation; spec is locked before any `supabase/migrations/` is written.
- All change-side ops go through RPC + RLS; clients never `INSERT/UPDATE/DELETE` base tables (ADR-0004).
- All day/week/limit logic is Asia/Seoul self-evidently (ADR-0003).
- One sub-decision per ADR; OQs that need user input live in the approval queue.
- Korean for product/spec docs, English for agent/ops docs.

## Critical Unknowns (still open)
- LLM provider selection (approval queue #6).
- `remove_public_post` RPC scope (approval queue #7).
- Family code expiration policy (approval queue #9).
- Cron strategy: pg_cron vs Vercel Cron (approval queue #10).
- License (approval queue #5).
- Auth user delete and family owner-leaves flows (PRD §13 OQs, AR-04).

## Read These First Next Time
- [AGENTS.md](../../AGENTS.md)
- [docs/agent/SESSION_START.md](../agent/SESSION_START.md)
- [docs/operations/todo-plan.md](todo-plan.md)
- [docs/operations/approval-queue.md](approval-queue.md)
- [docs/project/product-brief.md](../project/product-brief.md)
- [docs/project/brand-positioning.md](../project/brand-positioning.md)
- [docs/project/PRD.md](../project/PRD.md)
- [docs/architecture/data-model.md](../architecture/data-model.md) (single SoT for DB)
- [docs/architecture/adr/](../architecture/adr/) (ADR-0001..0004)
- [docs/qa/e2e-scenarios.md](../qa/e2e-scenarios.md)

## Next Safe Actions
- Resolve approval items 5–10 with the user.
- Once #6 (LLM provider) and #7 (remove_public_post RPC) are resolved, draft the actual `supabase/migrations/<ts>_init.sql` directly from data-model §11.
- Once stack is live, follow `docs/architecture/data-model.md` §15.3 RLS verification probes and §14 deployment checklist before opening to a beta family.
- Implementation start order: F1 → F2 → F3 → F4 → F5 → F6 → F8 → F7.

## Notes
- This file is the living recovery log. Update at the end of each real work session.
- If a major decision changes, refresh this file AND the relevant ADR / approval queue entry — never let three sources drift.
- Use `docs/status/` only for milestone, handoff, or explicitly requested status reporting.
