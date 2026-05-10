# Spec: F1 — Google 로그인 / 계정 / 세션

Style: Gherkin

Status:
- Draft

Owner:
- 미정

Related:
- Product brief section: 1차 사용자 / 핵심 시나리오 1
- PRD: [`../project/PRD.md`](../project/PRD.md) §7 F1, §9 B-1
- ADR: 없음
- E2E scenario: [`First Entry And Family Setup`](../qa/e2e-scenarios.md)

## Goal
- 가족 단톡방에서 받은 링크로 진입한 사용자가 30초 안에 구글 로그인까지 마치고 다음 단계(가족 만들기/가입)로 이동한다.

## In scope
- Google OAuth 2.0 (Web client) 기반 로그인.
- 신규/기존 사용자 자동 분기.
- 세션 발급/유지/만료 정책.
- 로그아웃.
- 계정 기본 정보(이메일, 표시 이름, 프로필 이미지) 저장.
- 인증 후 다음 단계(가족 온보딩 vs 홈) 라우팅.

## Out of scope
- 이메일/비밀번호 가입.
- 카카오, 애플, 페이스북 등 추가 OAuth.
- 2FA, 생체 인증.
- 계정 병합·전환·복구.
- 탈퇴(별도 spec, MVP 범위 밖).

## User story
- As a 가족 구성원
- I want 구글 계정으로 즉시 로그인하고 싶다
- so that 가입 절차에 멈춰서 가족 진진거 첫 경험을 미루지 않는다.

## Definitions
- **신규 사용자(New user)**: `googleSub`로 조회한 `User` 레코드가 없는 사용자.
- **기존 사용자(Existing user)**: `googleSub`로 조회한 `User` 레코드가 이미 있는 사용자.
- **온보딩 미완료**: 인증된 `User`가 아직 어떤 `Family`에도 속해 있지 않은 상태.
- **세션 토큰**: 서버가 발급한 HttpOnly Secure 쿠키 기반 세션 식별자.

## Scenarios

```gherkin
Feature: Google 로그인

  Scenario: S-1 신규 사용자가 구글로 가입과 로그인을 동시에 한다
    Given 사용자가 가족 단톡방에서 받은 진진거 링크로 `/`에 진입했다
    And 사용자는 어떤 인증 세션도 가지고 있지 않다
    When 사용자가 "구글로 시작하기" 버튼을 누른다
    And 구글 동의 화면에서 이메일·표시 이름·프로필 이미지 권한을 승인한다
    Then 시스템은 `User` 레코드를 새로 생성한다
    And 시스템은 HttpOnly Secure 세션 쿠키를 발급한다
    And 시스템은 사용자를 `/onboarding`으로 이동시킨다

  Scenario: S-2 기존 사용자가 다시 로그인한다
    Given 사용자가 이전에 한 번 구글 로그인으로 가입한 적이 있다
    And 사용자의 세션 쿠키가 만료되었다
    When 사용자가 "구글로 계속하기" 버튼을 누르고 동의를 완료한다
    Then 시스템은 기존 `User` 레코드를 식별한다
    And 시스템은 새 세션 쿠키를 발급한다
    And 사용자가 가족에 이미 속해 있다면 `/home`으로 이동시킨다
    And 사용자가 어떤 가족에도 속해 있지 않다면 `/onboarding`으로 이동시킨다

  Scenario: S-3 사용자가 구글 동의 화면을 취소한다
    Given 사용자가 구글 동의 화면에 진입했다
    When 사용자가 "취소" 또는 권한 거부를 선택한다
    Then 시스템은 세션을 발급하지 않는다
    And 사용자를 `/login?error=denied`로 되돌린다
    And 화면 상단에 "로그인을 취소했어요. 다시 시도해 주세요." 안내를 노출한다

  Scenario: S-4 OAuth 콜백이 실패한다
    Given 구글에서 콜백이 도착했지만 state 검증에 실패했다
    When 시스템이 콜백을 처리한다
    Then 시스템은 세션을 발급하지 않는다
    And 사용자를 `/login?error=oauth_state`로 되돌린다
    And 화면에 "보안 검증 실패. 새로고침 후 다시 시도해 주세요." 안내를 노출한다

  Scenario: S-5 인증된 사용자가 보호된 라우트에 직접 접근
    Given 사용자가 유효한 세션 쿠키를 가지고 있다
    When 사용자가 `/home`에 접근한다
    Then 시스템은 사용자가 속한 가족 컨텍스트를 로딩해 정상 응답한다

  Scenario: S-6 비인증 사용자가 보호된 라우트에 접근
    Given 사용자가 유효한 세션 쿠키를 가지고 있지 않다
    When 사용자가 `/home`에 접근한다
    Then 시스템은 사용자를 `/login?next=/home`으로 리다이렉트한다

  Scenario: S-7 사용자가 로그아웃한다
    Given 사용자가 `/me` 화면에 있다
    And 사용자는 유효한 세션을 가지고 있다
    When 사용자가 "로그아웃" 버튼을 누른다
    Then 시스템은 세션 쿠키를 무효화한다
    And 사용자를 `/login`으로 이동시킨다

  Scenario: S-8 동일 구글 계정에서 displayName이 바뀌었다
    Given 사용자가 기존 계정으로 다시 로그인한다
    And 구글이 반환한 displayName이 DB에 저장된 값과 다르다
    When 시스템이 인증을 처리한다
    Then 시스템은 `User.displayName`과 `avatarUrl`을 최신 값으로 갱신한다
    And 이메일은 `googleSub`이 같다면 그대로 유지한다

  Scenario: S-9 세션이 만료된 상태에서 보호 API 호출
    Given 클라이언트가 만료된 세션 쿠키로 보호 API를 호출한다
    When 서버가 요청을 받는다
    Then 서버는 401을 응답한다
    And 클라이언트는 사용자를 `/login`으로 리다이렉트한다
```

## Acceptance criteria
- 모든 시나리오는 자동 또는 수동 E2E 테스트로 검증 가능해야 한다.
  - S-1, S-2, S-7 → Playwright/Cypress E2E.
  - S-3, S-4 → OAuth provider 모킹 테스트.
  - S-5, S-6, S-9 → API 통합 테스트.
  - S-8 → 단위 테스트(콜백 핸들러).
- 세션 쿠키는 `HttpOnly`, `Secure`, `SameSite=Lax` 속성을 만족해야 한다.
- 세션 유효 기간은 30일, 슬라이딩 갱신을 적용한다(접근 시 만료 1주 이내면 갱신).
- 구글에서 받은 OIDC `sub`을 식별자로 사용한다. 이메일 변경에도 동일 사용자로 간주한다.

## Failure modes and recovery
- **OAuth provider 일시 장애**: `/login`에서 "잠시 후 다시 시도해 주세요" + 재시도 버튼. 백오프 없음(사용자 트리거).
- **DB 쓰기 실패**: 세션을 발급하지 않고 500 페이지로 이동, 운영 로그에 사용자 식별자 없이 에러 컨텍스트 기록.
- **세션 변조 시도**: 서명 검증 실패 시 즉시 401 + 쿠키 삭제.

## Privacy & data
- 수집: 구글 OIDC `sub`, `email`, `name`, `picture`만.
- 비수집: 전화번호, 생년월일, 주소.
- 저장 위치: 자체 DB. 외부 LLM에는 사용자 식별 정보 전송 금지(가짜 생성/익명화 시 사용자 텍스트만 전송).

## Open questions
- OQ-A1: "구글 외" 로그인 추가 시점. 현재 PRD §11에서 MVP 범위 밖으로 잠정 결정.
- OQ-A2: 세션 만료 시점에서 자동 silent refresh를 둘지, 항상 OAuth flow 재진입을 요구할지.
- OQ-A3: 가족 onboarding 이전 단계에서 사용자를 삭제하는 "30분 휴면 폐기" 정책의 필요성.
