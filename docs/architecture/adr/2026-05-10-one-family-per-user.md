# ADR-0002: MVP 1인 1가족 제약과 v1.1 다중 가족 마이그레이션 경로

Date:
- 2026-05-10

Status:
- Accepted (MVP)

## Background
- 진진거의 핵심 가치는 "우리 가족"이다. 단 하나의 가족 워크스페이스 안에서 진진거를 등록·풀이·랭킹하는 것이 1차 루프다.
- MVP 단계에서 한 사용자가 여러 가족(처가/시댁, 친구 그룹, 룸메이트 등)에 동시 가입 가능하면 다음이 무너진다:
  - 등록 한도(B-4: 하루 1개)의 의미.
  - 가족 케미 맵 / 캐릭터 코멘트의 톤.
  - "내 진진거"의 소유 관계.
  - UX 진입 동선("우리 가족"이라는 단수 표현).

## Why a decision is needed now
- [`../data-model.md`](../data-model.md)에서 `family_member.user_id`에 unique 제약을 둘지 여부가 RLS 정책·RPC·뷰의 모양을 결정한다.
- v1.1에서 다중 가족을 풀 때 마이그레이션 경로를 미리 잡아두지 않으면 데이터 호환성이 깨진다.

## Options considered
- **A. MVP에서 DB 제약으로 1인 1가족 강제, v1.1에서 풀고 active family 컨텍스트 도입** (선택)
- **B. MVP부터 다중 가족 허용, 기본 가족 토글 UX 제공**
- **C. MVP에서 DB는 다중 허용, 애플리케이션이 단일 가족만 노출**

## Decision
- **A**. `family_member.user_id`에 `UNIQUE` 제약을 두어 1인 1가족을 DB가 강제한다. v1.1에서는 본 ADR이 정의한 4단계 마이그레이션을 통해 다중 가족을 활성화한다.

## Why this option
- DB 제약이 있으면 RLS·RPC가 "활성 가족 = 사용자의 유일 가족"으로 단순해진다(예: `select fm.family_id from family_member where user_id = auth.uid()`).
- 클라이언트 상태(active family) 추적 불필요 → 5분 안에 첫 진진거 도달이라는 PRD 성공 기준에 도움.
- v1.1에서 풀 때 필요한 변경이 잘 정의돼 있어 lock-in이 작다.

## Consequences
- 좋은 점:
  - RPC 코드 단순. RLS 표현식 짧음.
  - "우리 가족"이라는 단수형 UX 카피와 일치.
- 트레이드오프:
  - 두 가족(처가·시댁 등)에 동시 참여하고 싶은 사용자 요구를 v1.1까지 거절.
  - "다른 가족으로 옮기기"는 탈퇴 후 재가입(MVP 정책).

## Risks
- 사용자가 본인이 만든 가족을 떠나고 싶을 때 owner 탈퇴 동선이 미정의(잔여 리스크 AR-04).
- v1.1에서 다중 가족을 풀 때 누락 마이그레이션이 발생하면 데이터 반정상.

## Rollback or migration notes (v1.1 다중 가족 전환)

### 사전 점검
- 활성 가족 컨텍스트(active family)를 어디에 저장할지 결정. 후보:
  - 클라이언트 쿠키 + 서버에서 신뢰 검증.
  - JWT custom claim(`active_family_id`) — Supabase Auth hooks 필요.
  - URL 경로(`/f/<familyId>/...`).
- 본 ADR은 **URL 경로 + 마지막 활성 family를 user_pref에 저장**을 권장한다.

### 마이그레이션 4단계 (v1.1 진입 시)
1. **DB 제약 완화**:
   ```sql
   alter table public.family_member drop constraint family_member_one_family_per_user;
   -- 그래도 (family_id, user_id) UNIQUE는 유지된다.
   ```
2. **RPC 시그니처 확장**: `create_quiz`, `submit_answer` 등 family를 사용자 단일 family로 추정하던 RPC가 명시 `p_family_id` 인자를 받도록 시그니처를 추가하고, 기존 시그니처는 deprecation으로 1버전 유지.
3. **RLS 단일 family 가정 표현 제거**:
   ```sql
   -- 기존: select fm.family_id from public.family_member where user_id = auth.uid()
   -- 신규: 인자로 받은 family_id에 대해 is_family_member(family_id) 체크
   ```
4. **클라이언트**:
   - `/f/<familyId>` 라우트 도입.
   - 가족 전환 UX(`/me/families`).
   - `app_user`에 `last_active_family_id` 컬럼 추가(deep link 진입 시 fallback).

### 데이터 호환성
- 1단계 후 기존 사용자는 모두 단일 family에 머물러 있어 동작이 변하지 않는다. 사용자가 두 번째 가족 가입을 시작하는 시점부터 새 동작이 적용된다.
- 분석 대시보드(F8)는 가족 단위로 이미 분리돼 있어 가족 전환 후에도 정상 표시.
- 케미 맵/캐릭터 코멘트는 가족 단위 캐시이므로 전환에 영향 없음.

### 실패 시 롤백
- `alter table … add constraint` 로 unique 재부여. 단, 이미 다중 가족에 속한 사용자가 있으면 불가능 → v1.1 출시 후에는 사실상 비가역.
