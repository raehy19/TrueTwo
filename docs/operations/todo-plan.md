# Prioritized TODO Plan

## P0. Spec lock-in
- Resolve approval items 6 (LLM provider), 7 (`remove_public_post` RPC), 9 (family code expiration) before bootstrap.
- Confirm `pg_cron` vs Vercel Cron path (approval item 10).
- Confirm license posture (approval item 5) — keep private until first beta.
- Lock the v1.0 punch list of OQs across PRD/spec/data-model that must close before code lands.

## P1. Bootstrap implementation
- Initialize the Next.js (App Router) + TypeScript app per ADR-0001.
- Add Tailwind + shadcn/ui base config and Korean web font.
- Create Vercel project, configure environment variables (PRD §12 / data-model §12) for Production + Preview separately.
- Create Supabase project, enable Google OAuth provider, add `pgcrypto` (and `pg_cron` if available).
- Author `supabase/migrations/<ts>_init.sql` following data-model §11 order, including all hardening (§9, §15) in the same transaction.
- Verify RLS by running anon-key probes against `quiz_option`, `public_post`, `auditing.llm_usage`, `private.*` per data-model §15.3.

## P2. Core loop implementation (F1–F5 happy path)
- F1 Google OAuth login screen + Supabase SSR cookie setup (`@supabase/ssr`).
- F2 Family create / join wizard, deeplink `?code=` autofill.
- F3 `/quiz/new` 3-step wizard; create_quiz RPC integration; backlog toggle UX.
- F4 LLM Route Handler with anon-safe error response, prompt outline from F4 spec.
- F5 Play screen with shuffle, submit_answer RPC, result screen with AI comment + 진짜 하루 질문 chips.
- Manual smoke through E2E-1 → E2E-3 on a single family.

## P3. Retention surfaces (F6–F8)
- F6 Weekly ranking carousel (uses `weekly_ranking_v` view).
- F8 Family dashboard with chemistry map + character comments (SWR cache for daily refresh).
- F7 Public board safe view + `solve_public_post` integration + upvote toggle + anonymization wizard.
- Add Vercel Cron route for `auto_reveal_expired` if `pg_cron` is unavailable.

## P4. Quality gates and observability
- Add type checking + lint to CI.
- Add at least one Playwright E2E covering E2E-1.
- Add pgTAP tests for RLS probes (data-model §15.3) in CI.
- Add basic LLM cost dashboard (read from `auditing.llm_usage`) — Vercel Edge log or external dashboard.
- Verify `lefthook` + `gitleaks` + `lychee` + `markdownlint` are installed for every contributor.

## P5. Polish and launch readiness
- Switch `release-please-config.json` `release-type` from `simple` to `node`.
- Add `commitlint` (npm) and replace the regex `commit-msg` hook.
- Production OAuth consent screen verification with Google.
- Domain + Supabase redirect URL hardening.
- Public-facing privacy + ToS copy confirmation.
- 5-family closed beta with explicit kill-switch RPC for runaway LLM cost.

## P6. Later quality improvements
- Decide whether to split out a dedicated risk register.
- Review possible automation for doc-maintenance flows (auto `/checkpoint`, auto `SESSION_START` refresh).
- v1.1 multi-family migration (ADR-0002 §"Rollback or migration notes").
- v1.1 DB-level LLM call rate limit (data-model §13 OQ-DM8).
- v1.1 public board moderation automation.

## Done in the spec lock-in pass (2026-05-10)
- Drafted brand positioning, product brief, PRD (16 sections), F1–F8 specs.
- Authored Supabase data model SoT with RPCs, RLS, triggers, views.
- Production safety review: 12 findings logged, all CRITICAL/HIGH fixed inline.
  - Fixed quiz_option/public_post column exposure.
  - Fixed family capacity race.
  - Added safe views, RPC `solve_public_post`, comprehensive grants.
- ADR-0001..0004 (tech stack, 1-family-per-user, KST handling, RPC + RLS pattern).
- E2E baseline aligned with F1–F8 specs.
- Approval items 1–4 routed; items 6–10 newly opened from PRD/spec OQs.

## Done in the harness pass (2026-05-03)
- AGENTS.md canonicalization + thin pointers.
- Verification automation (lefthook / markdownlint / lychee / gitleaks / Actions).
- SESSION_START snapshot.
- Slash commands.
- Specs directory + templates.
- Approval-queue lifecycle.
- Conventional Commits + release-please.
- Quick-start (`degit`) guidance.
- Learnings directory.
- Secrets policy + MCP matrix.

## Current Notes
- Tech stack and major architecture decisions are now ADR-locked. Implementation can begin once P0 items 6, 7, 9 are resolved.
- Until those resolve, do not start `supabase/migrations/`. Once resolved, follow data-model §11 and §15 strictly.
- Korean PRD + spec stays the SoT for product decisions; English ops/agent docs stay the SoT for workflow decisions.
