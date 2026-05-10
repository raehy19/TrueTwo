# Spec: F1 — 인증 (이메일/비밀번호, 무검증) / 계정 / 세션

Style: Gherkin

Status:
- Draft (해커톤 단순화 패치 — Google OAuth는 v1.1 후보)

Owner:
- 미정

Related:
- Product brief section: 1차 사용자 / 핵심 시나리오 1
- PRD: [`../project/PRD.md`](../project/PRD.md) §7 F1, §9 B-1
- ADR: [`../architecture/adr/2026-05-10-tech-stack.md`](../architecture/adr/2026-05-10-tech-stack.md) (스택), 인증 방식 변경 사유는 본 spec 하단 §변경 이력 참고
- E2E scenario: [`First Entry And Family Setup`](../qa/e2e-scenarios.md)

## Goal
- 가족 단톡방에서 받은 링크로 진입한 사용자가 30초 안에 이메일+비밀번호로 가입/로그인을 마치고 다음 단계(가족 만들기/가입)로 이동한다. 해커톤 데모 일정상 OAuth 통합과 이메일 발송 인프라를 제거하고 가장 단순한 인증으로 시작한다.

## In scope
- Supabase Auth Email + Password provider (이메일 인증 메일 비발송).
- 신규 가입 / 기존 로그인 자동 분기 (한 화면에 토글).
- 비밀번호 최소 길이 강제.
- 로그아웃.
- 세션 발급/유지/만료 정책.
- 인증 후 다음 단계(가족 온보딩 vs 홈) 라우팅.
- 가입 후 즉시 로그인 상태(이메일 confirmation 대기 없음).

## Out of scope
- 이메일 본인 인증 메일 발송 / 확인 링크.
- 비밀번호 찾기 / 재설정(MVP는 직접 재가입).
- Google / 카카오 / 애플 OAuth.
- 2FA, 생체 인증.
- 계정 병합·전환·복구.
- 회원 탈퇴(별도 spec, MVP 범위 밖).
- CAPTCHA(Supabase 기본 protection만 사용).

## User story
- As a 가족 구성원
- I want 이메일과 비밀번호 한 번 입력으로 즉시 가입/로그인하고 싶다
- so that 가족 진진거 첫 경험을 확인 메일을 기다리느라 미루지 않는다.

## Definitions
- **신규 사용자(New user)**: 입력한 이메일에 대응하는 `auth.users` 행이 없는 사용자.
- **기존 사용자(Existing user)**: 입력한 이메일에 대응하는 `auth.users` 행이 이미 있는 사용자.
- **온보딩 미완료**: 인증된 `User`가 아직 어떤 `Family`에도 속해 있지 않은 상태.
- **세션**: Supabase Auth가 발급하는 access/refresh 토큰 쌍을 `@supabase/ssr` 표준 cookie에 저장한 상태(HttpOnly, Secure, SameSite=Lax).

## Scenarios

```gherkin
Feature: 이메일/비밀번호 인증

  Scenario: S-1 신규 사용자가 가입한다
    Given 사용자가 가족 단톡방에서 받은 진진거 링크로 `/`에 진입했다
    And 사용자는 어떤 인증 세션도 가지고 있지 않다
    When 사용자가 `/login`에서 "가입" 토글로 전환한다
    And 이메일 "minsu@example.com"과 비밀번호 8자 이상을 입력한다
    And "가입" 버튼을 누른다
    Then 시스템은 Supabase Auth `signUp`을 호출한다
    And 이메일 확인 절차 없이 즉시 세션이 발급된다
    And 시스템은 `app_user` 행을 자동 생성한다(트리거)
    And 시스템은 사용자를 `/onboarding`으로 이동시킨다

  Scenario: S-2 기존 사용자가 로그인한다
    Given 사용자가 이전에 가입한 적이 있다
    When 사용자가 `/login`에서 "로그인" 토글에서 이메일+비밀번호를 입력한다
    Then 시스템은 Supabase Auth `signInWithPassword`를 호출한다
    And 인증에 성공하면 새 세션 쿠키가 발급된다
    And 사용자가 가족에 이미 속해 있다면 `/home`으로 이동시킨다
    And 사용자가 어떤 가족에도 속해 있지 않다면 `/onboarding`으로 이동시킨다

  Scenario: S-3 비밀번호 최소 길이 미달
    Given 사용자가 가입 화면에 있다
    When 사용자가 비밀번호 7자 이하를 입력한다
    Then "가입" 버튼은 비활성 상태이다
    And 입력란 아래 "비밀번호는 8자 이상이어야 해요"가 표시된다

  Scenario: S-4 이메일 형식이 잘못됐다
    Given 사용자가 인증 화면에 있다
    When 사용자가 "minsu@" 같은 잘못된 이메일을 입력한다
    Then 버튼은 비활성 상태이다
    And "이메일 형식이 올바르지 않아요"가 표시된다

  Scenario: S-5 이미 가입된 이메일로 가입 시도
    Given 사용자가 가입 토글에서 이미 등록된 이메일을 입력한다
    When 사용자가 "가입"을 누른다
    Then 시스템은 Supabase로부터 사용자 존재 오류를 받는다
    And 화면에 "이미 가입된 이메일이에요. 로그인해 주세요"를 표시한다
    And 토글을 자동으로 "로그인" 쪽으로 전환한다(이메일은 유지)

  Scenario: S-6 비밀번호 불일치 로그인 시도
    Given 사용자가 등록된 이메일을 입력하고 잘못된 비밀번호를 입력한다
    When "로그인"을 누른다
    Then Supabase가 invalid credentials 응답을 반환한다
    And "이메일 또는 비밀번호가 올바르지 않아요"가 표시된다(어느 쪽이 틀렸는지 노출하지 않음)

  Scenario: S-7 인증된 사용자가 보호된 라우트에 직접 접근
    Given 사용자가 유효한 세션을 가지고 있다
    When 사용자가 `/home`에 접근한다
    Then 시스템은 사용자가 속한 가족 컨텍스트를 로딩해 정상 응답한다

  Scenario: S-8 비인증 사용자가 보호된 라우트에 접근
    Given 사용자가 유효한 세션을 가지고 있지 않다
    When 사용자가 `/home`에 접근한다
    Then 시스템은 사용자를 `/login?next=/home`으로 리다이렉트한다

  Scenario: S-9 사용자가 로그아웃한다
    Given 사용자가 `/me` 화면에 있다
    And 사용자는 유효한 세션을 가지고 있다
    When 사용자가 "로그아웃" 버튼을 누른다
    Then 시스템은 Supabase Auth `signOut`을 호출하고 세션 쿠키를 삭제한다
    And 사용자를 `/login`으로 이동시킨다

  Scenario: S-10 세션이 만료된 상태에서 보호 API 호출
    Given 클라이언트가 만료된 세션 쿠키로 보호 API를 호출한다
    When 서버가 요청을 받는다
    Then `@supabase/ssr` 미들웨어가 refresh token으로 자동 갱신을 시도한다
    And 갱신 실패 시 401을 반환한다
    And 클라이언트는 사용자를 `/login`으로 리다이렉트한다

  Scenario: S-11 가입 직후 displayName 자동 채움
    Given 사용자가 가입할 때 표시 이름을 별도로 입력하지 않았다
    When 시스템이 `app_user` 행을 만든다(트리거 handle_new_auth_user)
    Then `display_name`은 이메일의 로컬 파트(@ 앞부분, 예: "minsu")로 자동 채워진다
    And 사용자는 `/me`에서 표시 이름을 직접 변경할 수 있다(MVP 비활성, OQ-A4)
```

## Acceptance criteria
- 모든 시나리오는 자동 또는 수동 E2E 테스트로 검증 가능해야 한다.
  - S-1, S-2, S-9 → Playwright/Cypress E2E.
  - S-3~S-6 → 폼 검증 단위 테스트 + 통합 테스트.
  - S-7, S-8, S-10 → 미들웨어/서버 사이드 통합 테스트.
  - S-11 → DB 트리거 단위 테스트.
- 세션 쿠키는 `@supabase/ssr` 기본값을 따른다. `HttpOnly`, `Secure`, `SameSite=Lax`.
- Supabase Auth 콘솔에서 **"Confirm email" 옵션은 비활성**(이메일 발송 없음)이어야 한다(데이터 모델 §14 배포 체크리스트 참고).
- 비밀번호 정책: 최소 8자(클라이언트 검증 + Supabase Auth Settings로도 강제).
- 가입/로그인 RPC 호출은 Supabase Auth 표준이며, 우리 도메인 RPC는 `app_user` 트리거 외에 추가하지 않는다.

## Failure modes and recovery
- **Supabase 일시 장애**: `/login`에서 "잠시 후 다시 시도해 주세요" + 재시도 버튼.
- **DB 트리거 실패(handle_new_auth_user)**: `auth.users`는 생성됐지만 `app_user`가 없는 상태. 다음 로그인 시 트리거(`on_auth_user_updated`)가 self-heal.
- **세션 변조 시도**: Supabase Auth가 자체 검증 후 401.

## Privacy & data
- 수집: 이메일 + 비밀번호(Supabase 측 해시 저장).
- 비수집: 전화번호, 생년월일, 주소, 본인 인증 정보, 카카오/구글 sub.
- 저장 위치: `auth.users`(Supabase), `public.app_user`(우리 도메인).
- 외부 LLM에는 사용자 식별 정보 전송 금지(가짜 생성/익명화 시 사용자 텍스트만 전송).

## Open questions
- OQ-A1: 비밀번호 재설정 동선이 없으므로 사용자가 비밀번호를 잊으면 사실상 새 가입(다른 이메일)을 해야 한다. 베타 진입 전 단순 재설정 또는 magic link로 보강 필요.
- OQ-A2: 이메일 본인 인증을 안 하면 동일 이메일 위장 가입 가능. 해커톤 데모 수용 리스크. 베타 직전에 magic link로 교체 검토.
- OQ-A3: Supabase Auth의 rate limit / brute-force 보호 설정 검수.
- OQ-A4: `/me`에서 표시 이름 자체 수정 동선(F2와 별개로 본 spec에 추가할지).
- OQ-A5: Google OAuth로 후일 전환 시 기존 이메일/비밀번호 사용자와 OAuth 사용자의 계정 병합 정책.

## 변경 이력
- 2026-05-10: 초안 — Google OAuth로 작성.
- 2026-05-10: **이메일/비밀번호(무검증)으로 전환**. 사유: 해커톤 일정 압축. Google OAuth 동의 화면 검수·redirect URL 등록 시간이 부족. v1.1에서 Google OAuth 추가 예정(OQ-A5와 함께).
