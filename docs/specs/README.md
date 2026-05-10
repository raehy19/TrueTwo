# Specs

Feature-level specifications written before code.

## Why this directory exists

The product brief defines *what we are building and for whom*. Architecture and
ADRs define *how the system is shaped*. Specs sit between them: they define
*what a specific feature must do*, in a form precise enough to drive
implementation and tests.

A spec answers, for one feature:

- Goal and user value
- Trigger / preconditions
- Expected behavior, success path
- Failure paths and recovery
- Acceptance criteria (testable)
- Out of scope

## When to write a spec

- Before starting implementation of any non-trivial feature
- When the desired behavior is not obvious from the product brief alone
- When multiple agents or contributors need a shared definition of "done"

## Style choice

Two formats are supported. Pick one per feature.

- **EARS** (`docs/templates/spec-ears-template.md`):
  Concise, structured "The system shall …" statements. Best for rule-heavy
  features (validation, authorization, calculation, integration policy).
- **Gherkin** (`docs/templates/spec-gherkin-template.md`):
  `Given / When / Then` scenarios. Best for user flows, UX behavior, and
  features that map cleanly to E2E tests.

Use `/spec-new <title> --style=ears` or `--style=gherkin` to scaffold.

## File naming

`YYYY-MM-DD-<slug>.md`, where the slug is kebab-case.

Specs are evergreen by default. If a spec describes a versioned contract that
must match a released state, follow the versioned-doc rules in
[../DOCUMENTATION_SYSTEM.md](../DOCUMENTATION_SYSTEM.md).

## Lifecycle

1. **Draft** — author fills the template; missing fields stay as `<fill>`.
2. **Ready** — all required fields filled, acceptance criteria testable.
3. **Implementing** — code and tests reference the spec.
4. **Shipped** — feature merged. Move historical specs to `archive/` only when
   superseded by a newer spec.

## Active specs

<!-- Add one bullet per active spec. Remove when archived. -->

- F1 [`2026-05-10-auth-google-login.md`](2026-05-10-auth-google-login.md) — Google OAuth 로그인/세션
- F2 [`2026-05-10-family-workspace.md`](2026-05-10-family-workspace.md) — 가족 생성/참여/6자리 코드
- F3 [`2026-05-10-daily-quiz-registration.md`](2026-05-10-daily-quiz-registration.md) — 일일 진진거 등록 라이프사이클
- F4 [`2026-05-10-ai-lie-generation.md`](2026-05-10-ai-lie-generation.md) — AI 가짜 후보 생성 + 사용자 편집
- F5 [`2026-05-10-quiz-answer-results.md`](2026-05-10-quiz-answer-results.md) — 풀이/결과 공개/AI 자동 코멘트
- F6 [`2026-05-10-family-ranking.md`](2026-05-10-family-ranking.md) — 가족 랭킹 5종 + 댓글
- F7 [`2026-05-10-public-board.md`](2026-05-10-public-board.md) — 남의 집 진진거 공개 게시판
- F8 [`2026-05-10-dashboard.md`](2026-05-10-dashboard.md) — 가족 대시보드 + 케미 맵

## Relationship to other docs

- Diverges from product brief? Update the brief or open an approval queue item.
- Architectural impact? Open an ADR alongside the spec.
- E2E coverage? Link the spec from `docs/qa/e2e-scenarios.md`.
