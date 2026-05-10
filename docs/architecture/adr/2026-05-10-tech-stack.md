# ADR-0001: 기술 스택 — Next.js + Vercel + Supabase + LLM 단일 공급사

Date:
- 2026-05-10

Status:
- Accepted

## Background
- 진진거는 가정의 달 시즌 출시를 노리는 데일리 가족 게임이며 5시간 해커톤 데모 → 비공개 베타 → 공개 베타로 이어지는 압축된 일정이다.
- 메커닉상 (a) 단톡방에서 받은 링크로 즉시 진입하는 모바일 우선 웹, (b) AI 가짜 생성/익명화/코멘트의 실시간 LLM 호출, (c) 가족 단위 권한이 핵심 비즈니스 룰인 데이터, (d) 공개 게시판 풀이의 익명 read 트래픽이 함께 필요하다.
- 팀 규모가 작고, 인프라 운영을 줄이고 시간 대부분을 제품 UX와 LLM 프롬프트 튜닝에 쓰고 싶다.

## Why a decision is needed now
- 본 결정 없이는 [`../data-model.md`](../data-model.md)·[`../README.md`](../README.md)·[PRD §12](../../project/PRD.md)·각 spec의 환경 변수와 인증 방식이 모두 미정 상태로 멈춘다.
- 마이그레이션 작성, OAuth 콜백 URL, 비용 가드 메트릭 위치 등 후속 결정이 본 결정을 직접 참조한다.

## Options considered
- **A. Next.js + Vercel + Supabase + LLM 1개 공급사** (선택)
- **B. Next.js + Vercel + Firebase(Auth + Firestore) + LLM**
- **C. Remix + Cloudflare Workers/D1 + LLM**
- **D. Bare Postgres + Express + 자체 OAuth + 자체 호스팅 (예: Fly.io)**

## Decision
- **A**를 채택한다. 구체적으로:
  - Next.js (App Router) + TypeScript, Tailwind + shadcn/ui.
  - Vercel을 호스팅. 미리보기 / 프로덕션 분리.
  - Supabase: Postgres + Auth(Google OAuth) + RLS + Edge Functions 옵션 + Storage(미사용).
  - LLM은 단일 공급사 1개로 시작. 모델 ID는 `LLM_MODEL` 환경 변수.

## Why this option
- **속도**: Auth, DB, RLS, 마이그레이션 도구가 한 콘솔에 묶여 5시간 데모에 필요한 부수적 의사결정을 0으로 만든다.
- **보안 모델**: PRD §9 비즈니스 규칙 대부분을 RLS + RPC로 DB가 강제 가능. 클라이언트 신뢰 표면이 작다([`../data-model.md`](../data-model.md) §15 참고).
- **현지 RTT**: Supabase Singapore/Tokyo region + Vercel Asia region으로 한국 사용자 RTT 확보.
- **비용**: MVP 트래픽 규모에서 두 서비스 모두 무료/저비용 구간에 머문다. LLM 비용이 가장 큰 변수.
- **에코시스템**: `@supabase/ssr`로 Next.js App Router에서 SSR/RSC 인증 cookie 처리가 표준화돼 있다.

## Consequences
- 좋은 점:
  - 하나의 SoT(Postgres + RLS)에 비즈니스 룰을 압축.
  - 마이그레이션을 단일 SQL로 결정적 재현(`supabase db reset`).
  - Vercel preview URL이 OAuth redirect로 동작 가능(와일드카드 등록).
- 트레이드오프:
  - LLM 단일 공급사 의존. 장애 시 백업 공급사 fallback이 없다(MVP 수용 리스크).
  - Vercel function cold start.
  - Supabase의 PITR / pg_cron / Edge Function 가용 범위가 플랜에 의존.

## Risks
- LLM 호출 비용 폭증: 가드는 PRD §9 B-11 + `auditing.llm_usage` 모니터링.
- Vercel function 30초 timeout(Hobby): LLM 응답이 길어지면 streaming + Edge Function으로 처리.
- Supabase region이 변경되면 마이그레이션 재실행이 필요(RTT 영향).

## Rollback or migration notes
- 다른 호스트로 옮길 때 Next.js 자체는 표준이라 큰 비용 없음(다만 Vercel Cron 사용 시 외부 cron으로 교체).
- Supabase에서 다른 Postgres로 옮길 때 `supabase/migrations` SQL은 그대로 재사용 가능. Auth는 외부 OAuth provider 직접 통합으로 교체.
- LLM 공급사 변경은 Route Handler 1개 교체로 끝나도록 inference layer를 단일 함수에 격리한다.
