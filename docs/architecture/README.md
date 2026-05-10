# Architecture Guide

This directory is for system-structure records after the product brief is defined.

## Active documents
- [data-model.md](data-model.md) — Supabase / Postgres schema (single SoT)

## Tech stack (locked)
- **Frontend**: Next.js (App Router) + TypeScript, Tailwind + shadcn/ui
- **Hosting**: Vercel (Edge + Serverless), preview/production split
- **Backend / DB / Auth**: Supabase (Postgres + Auth + RLS, Edge Functions optional)
- **LLM**: single provider (가짜 생성 / 익명화 / AI 코멘트 / 캐릭터 코멘트)
- See PRD §12 for the rationale and environment variables.

## Stack diagram

```text
[Browser]
   │ HTTPS
   ▼
[Vercel — Next.js App Router]
   ├── Static / RSC pages
   ├── Route Handlers ──► LLM API (server only, secret keys)
   └── @supabase/ssr  ──► Supabase Auth (Google OAuth)
                        └► Postgres (public/private/auditing schemas + RLS)
```

## Docs to add later
- System context (sequence diagrams for the core loop)
- Deployment and operations structure (Vercel preview policy, Supabase env tiers)
- Recovery and observability strategy (LLM cost guardrail dashboards)

## ADR Rules
- Record structurally meaningful decisions in `adr/`.
- Include background, options, final decision, consequences, and rollback impact.
- If product intent is still unclear, send the item to the approval queue before creating an ADR.
