# ADR-0004: 가변 비즈니스 규칙은 RPC + RLS로, 클라이언트 직접 INSERT 금지

Date:
- 2026-05-10

Status:
- Accepted

## Background
- 진진거에는 클라이언트가 신뢰돼서는 안 되는 규칙이 다수 있다. 예:
  - 1인 1가족(B-2).
  - 일일 1개 등록 + 백로그 +1(B-4/B-6).
  - 출제자 본인 풀이 금지(B-9).
  - 결과 공개 트리거(B-8: 전원 풀이 / 출제자 공개 / 24h 경과).
  - 정답 옵션 인덱스가 게시판에서 노출되지 않아야 함.
- Supabase는 RLS 정책으로 행 단위 접근을 강제하고, RPC(`security definer` 함수)로 다단계 트랜잭션과 시간대 의존 로직을 atomic하게 묶을 수 있다.

## Why a decision is needed now
- [`../data-model.md`](../data-model.md) §7~§9에 RPC/RLS가 다수 정의돼 있는데, 어떤 동작이 RPC를 강제하고 어떤 것이 base table SELECT를 허용하는지 일관 규칙이 없으면 곧 표면이 폭발한다(직접 INSERT가 새는 순간 비즈니스 룰 깨짐).

## Options considered
- **A. 모든 변경(INSERT/UPDATE/DELETE)은 RPC. SELECT는 RLS + 안전 뷰** (선택)
- **B. 단순한 INSERT는 클라이언트 직접 + RLS check, 복잡한 것만 RPC**
- **C. PostgREST 자동 endpoint 그대로 사용 + RLS 의존**

## Decision
- **A**.
  - 모든 INSERT/UPDATE/DELETE는 RPC를 통해서만 한다. base table에 대한 INSERT/UPDATE/DELETE 권한은 anon/authenticated에서 `revoke`한다.
  - SELECT는 RLS와 안전 뷰의 조합으로 노출 컬럼을 제한한다.
  - 모든 RPC는 다음 헤더를 만족한다:
    - `security definer`
    - `set search_path = public, pg_temp`
    - 명시적 `auth.uid()` 검사
    - 명시적 `is_family_member(...)` 또는 자원 소유자 검사
    - `revoke all from public` 후 `grant execute to authenticated`
    - 실패 시 명시적 에러 코드(`'AUTH_REQUIRED'`, `'NO_FAMILY'`, `'FAMILY_FULL'` 등)

## Why this option
- 클라이언트 신뢰 표면이 거의 0이다. INSERT 우회 경로가 없다.
- 비즈니스 규칙 변경은 RPC 1곳만 수정하면 된다(예: 백로그 정책 변경).
- 동시성 보호(예: 가족 정원 8, 일일 1개 등록 race)를 RPC 안에서 `for update`로 안전하게 한다.
- 안전 뷰(`quiz_option_safe_v` 등)로 정답 컬럼을 클라이언트에서 영구 격리.

## Consequences
- 좋은 점:
  - 보안과 비즈니스 룰의 SoT가 DB 1곳.
  - PostgREST 자동 endpoint를 사용하지 않아 표면이 작다.
- 트레이드오프:
  - 단순 CRUD에도 RPC 정의가 필요해 boilerplate가 늘어난다.
  - Supabase Auto-generated TypeScript 타입은 base table에 강하므로, RPC return type을 명시적으로 정의해야 한다.

## Risks
- RPC를 빼먹고 base에 INSERT하는 코드가 들어오면 사일런트 실패(권한 오류). PR 단위로 확인 필요.
- `security definer` 함수 안에서 search_path 누락 시 권한 escalation 위험 → 모든 RPC에 `set search_path = public, pg_temp` 강제.

## Rollback or migration notes
- RPC 우선 패턴을 푸는 경로:
  1. base table에 `grant insert on … to authenticated` 부여.
  2. RLS `with check` 정책 추가.
  3. RPC를 wrapper로 유지(중복 호출 가능).
- 단계적 완화 가능. 보안 리스크 vs 개발 속도 트레이드오프 시점에 재평가.

## 적용 대상 (요약)
| 동작 | 진입점 | 비고 |
|------|--------|------|
| 가족 만들기 | `create_family(name)` | family + family_member(owner)를 한 트랜잭션 |
| 가족 가입 | `join_family(code)` | family for update + 정원 검사 |
| 진진거 등록 | `create_quiz(...)` | 한도 검사 + 옵션 3행 일괄 삽입 |
| 풀이 제출 | `submit_answer(quiz_id, option_id, reason)` | 출제자 차단 + reveal 트리거 |
| 결과 강제 공개 | `reveal_quiz_now(quiz_id)` | 출제자만 |
| 게시판 풀이 | `solve_public_post(post_id, idx)` | 정답 인덱스 서버 비교 |
| 자동 reveal | `auto_reveal_expired()` | service_role/cron 전용 |
| 본인 게시물 삭제 | `remove_public_post(post_id)` (v1.0 출시 전 추가, OQ-DM7) | 출제자 + 48h 창 |
