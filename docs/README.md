# 하루진진거 — 문서 인덱스

해커톤 출품용 핵심 문서만 4개 카테고리로 정리했다. 첫 진입은 [`/README.md`](../README.md)에서 시작.

## 1. Product (Korean)

- [`project/product-brief.md`](project/product-brief.md) — 제품 한 줄 정의·1차 사용자·MVP 범위·성공 기준
- [`project/brand-positioning.md`](project/brand-positioning.md) — 브랜드 문장·문제 정의·핵심 가치·톤
- [`project/PRD.md`](project/PRD.md) — 16섹션 PRD (B-1~B-12 비즈니스 규칙, NFR, 릴리스 계획, glossary)
- [`project/2026_0510_1529_concept_alignment_review.md`](project/2026_0510_1529_concept_alignment_review.md) — 콘셉트 정합성 점검

## 2. Specs (Korean, Gherkin/EARS)

각 기능 1개 = 1개 spec. PRD §7 기능 맵과 1:1 대응.

- [`specs/2026-05-10-auth-google-login.md`](specs/2026-05-10-auth-google-login.md) — F1 인증 (이메일/비밀번호, 무검증)
- [`specs/2026-05-10-family-workspace.md`](specs/2026-05-10-family-workspace.md) — F2 가족 워크스페이스 (6자리 코드)
- [`specs/2026-05-10-daily-quiz-registration.md`](specs/2026-05-10-daily-quiz-registration.md) — F3 일일 진진거 등록 라이프사이클
- [`specs/2026-05-10-ai-lie-generation.md`](specs/2026-05-10-ai-lie-generation.md) — F4 AI 가짜 후보 생성 + 사용자 편집
- [`specs/2026-05-10-quiz-answer-results.md`](specs/2026-05-10-quiz-answer-results.md) — F5 풀이 / 결과 / AI 코멘트 / 진짜 하루 질문
- [`specs/2026-05-10-family-ranking.md`](specs/2026-05-10-family-ranking.md) — F6 가족 랭킹 5종 + 댓글
- [`specs/2026-05-10-public-board.md`](specs/2026-05-10-public-board.md) — F7 남의 집 진진거 게시판
- [`specs/2026-05-10-dashboard.md`](specs/2026-05-10-dashboard.md) — F8 가족 대시보드 + 케미 맵

## 3. Architecture (English)

- [`architecture/data-model.md`](architecture/data-model.md) — Supabase 데이터 모델 단일 SoT (테이블 14, ENUM 11, RPC 7, 트리거 9, 안전 뷰 6, RLS 정책, **§15 Production Safety Review** — 12 findings & mitigations)
- [`architecture/adr/2026-05-10-tech-stack.md`](architecture/adr/2026-05-10-tech-stack.md) — ADR-0001 Next.js + Vercel + Supabase + Anthropic
- [`architecture/adr/2026-05-10-one-family-per-user.md`](architecture/adr/2026-05-10-one-family-per-user.md) — ADR-0002 1인 1가족 (v1.1 다중 가족 마이그레이션 경로 포함)
- [`architecture/adr/2026-05-10-kst-time-handling.md`](architecture/adr/2026-05-10-kst-time-handling.md) — ADR-0003 모든 일자/주는 Asia/Seoul
- [`architecture/adr/2026-05-10-rls-rpc-pattern.md`](architecture/adr/2026-05-10-rls-rpc-pattern.md) — ADR-0004 RPC + RLS + 안전 뷰 패턴

## 4. QA (English)

- [`qa/e2e-scenarios.md`](qa/e2e-scenarios.md) — 5개 핵심 사용 여정 (가족 셋업 / 진진거 생성 / 풀이 + 진짜 하루 / 대시보드 / 공개 게시판)

---

## 한 눈에

```
docs/
├── project/        제품 정의 (브리프 / 브랜드 / PRD)
├── specs/          F1~F8 기능 스펙
├── architecture/   DB SoT + ADR
└── qa/             E2E 시나리오
```

기능 → spec → DB SoT → 시나리오까지 흐름이 직선으로 연결돼 있다.
