# Learnings

Lightweight, repo-wide conventions and "things we agreed on" that do not deserve
a full ADR but are worth keeping in one place.

## What belongs here

- "We always do X in this repo" rules
- Naming, structure, or workflow micro-decisions
- Lessons learned from a small incident or surprise
- Patterns that proved correct after we tried alternatives

## What does NOT belong here

- Architecture, schema, contract, auth, or scope decisions → use an ADR.
- Open questions → use the approval queue.
- Per-feature behavior → use a spec under `docs/specs/`.
- Session state, status, or todos → use `docs/operations/`.

## How to add a learning

- One-liners: append a bullet under the right section below.
- Anything longer than a sentence: copy `../templates/learning-template.md`
  to `docs/learnings/YYYY-MM-DD-<slug>.md` and link it from the right section.
- Use `/learning-add "<rule>"` to do this automatically.

## Conventions

### Documentation
- The canonical agent entry is `AGENTS.md`. Other entry files are 1–3 line pointers. — 2026-05-03
- Agent-facing docs are English; product-facing docs may be Korean. — 2026-05-03
- Versioned contract docs are immutable; copy to a new file instead of editing. — 2026-05-03

### Process
- Resolved approval items must be promoted to ADR or routed to a learning before being archived. — 2026-05-03
- Specs come before implementation for any non-trivial feature. — 2026-05-03

### Tooling
- Conventional Commits are enforced by `lefthook` `commit-msg` hook. — 2026-05-03
- `gitleaks` runs on every commit; placeholder tokens in operations docs block commits. — 2026-05-03

## Long-form learnings

<!-- Link individual files added via /learning-add or manually. -->

_None yet._

## Project conventions (진진거 Phase 1 spec lock-in, 2026-05-10)

### Documentation
- 진진거 product / spec / brand docs are written in Korean; agent / ops / architecture docs stay in English. PRD section structure stays English-numbered for cross-linking. — 2026-05-10
- The single source of truth for DB schema is `docs/architecture/data-model.md`. PRD Appendix A keeps a conceptual diagram only; conflicting details defer to data-model.md. — 2026-05-10

### Architecture
- All `INSERT`/`UPDATE`/`DELETE` against `public.*` go through `security definer` RPCs with `set search_path = public, pg_temp`, explicit `auth.uid()` and `is_family_member` checks, and `revoke all from public` + `grant execute to authenticated` (ADR-0004). — 2026-05-10
- Anon and authenticated clients never `select` a base table that contains an answer-key column (`quiz_option.kind`, `public_post.false_option_index`, `public_post.family_id`). They use safe views (`quiz_option_safe_v`, `public_post_safe_v`). Game-integrity views always set `security_invoker = true`. — 2026-05-10
- All "today" / "yesterday" / "week start" comparisons use `Asia/Seoul` self-evidently via `public.kst_today()` / `public.kst_yesterday()` / `public.kst_week_start(d)` (ADR-0003). Clients never compute day labels independently; they always read server-issued labels. — 2026-05-10
- LLM cost is logged on every call to `auditing.llm_usage` with `(kind, model, prompt_tokens, output_tokens, cost_krw)`. Failed calls are not logged but must be retryable without consuming the user-visible counter. — 2026-05-10

### Process
- Production-safety findings live in `docs/architecture/data-model.md` §15. Every new feature must extend that table when it adds a privileged write path or anonymized read surface. — 2026-05-10
- Open questions in spec / PRD frontmatter are tagged `OQ-*`. Items that block implementation must move to `docs/operations/approval-queue.md`; items that are accepted mitigations stay in spec. — 2026-05-10
- `git commit` body never adds `Co-Authored-By` trailers (global rule). Conventional Commits with Korean body are accepted. — 2026-05-10
