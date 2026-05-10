# ADR-0003: 모든 일자/한도 계산은 Asia/Seoul 자정 기준

Date:
- 2026-05-10

Status:
- Accepted

## Background
- 진진거의 등록 한도(B-4 하루 1개), 백로그 가능 여부(B-6 어제 미등록 시 오늘 +1), 주간 랭킹 리셋(F6 R-4 월요일 00:00), AI 캐릭터 코멘트 일 1회 갱신(F8 R-8) 등은 모두 "어느 날(day)" 기준으로 동작한다.
- 사용자는 100% 한국 거주자(한국어, KST 단톡방 컨텍스트). UTC나 사용자 로컬 타임존을 기준으로 하면 자정 직전 등록의 dayLabel이 사용자 직관과 어긋난다.

## Why a decision is needed now
- [`../data-model.md`](../data-model.md)의 `quiz.day_label` 산정, 트리거의 `kst_week_start`, character_comment_cache의 `day_label` 모두 본 결정에 의존한다.
- 클라이언트가 자기 로컬 타임존으로 dayLabel을 계산하면 모바일 사용자가 해외에 있을 때 가족 단위 데이터가 일관성을 잃는다.

## Options considered
- **A. 모든 dayLabel/주 시작/한도 카운트를 Asia/Seoul 자정 기준** (선택)
- **B. 사용자 로컬 타임존 기준**
- **C. UTC 기준**
- **D. 가족 단위 사용자 지정 타임존**

## Decision
- **A**. 본 서비스의 모든 일자·주 단위 계산은 `Asia/Seoul` 자정을 경계로 한다. 시각 자체는 `timestamptz`로 저장하되 비교는 `(now() at time zone 'Asia/Seoul')::date`로 결정한다.

## Why this option
- 사용자 직관과 일치. "오늘 잠들기 전에 등록"이 한국 자정 기준으로 일관.
- 가족 멤버 한 명이 해외에 있어도 가족 데이터(케미 맵, 주간 리셋)가 일관.
- 서버·DB·클라이언트가 같은 결정 함수(`public.kst_today()`/`public.kst_yesterday()`/`public.kst_week_start(d)`)를 사용해 결정적이다.
- `pg_cron`/Vercel Cron이 KST 기준으로 `auto_reveal_expired`/캐릭터 코멘트 갱신을 트리거할 수 있다.

## Consequences
- 좋은 점:
  - 비즈니스 룰 표현이 단순. 트리거에 단일 타임존만 등장.
  - 일자 경계 케이스(F3 R-16/R-17)가 한 곳에서 검증된다.
- 트레이드오프:
  - 미국·유럽 가족이 사용한다면 한국 자정에 강제로 묶인다(MVP 비목표).
  - Daylight Saving Time 변경에 노출되지만 KST는 DST가 없다. 안전.

## Risks
- 클라이언트가 자체로 dayLabel을 계산해 서버와 어긋나는 경우 → 모든 클라이언트 라벨은 서버에서 받아온 값만 표시한다(클라이언트 단독 계산 금지).
- 시간대 변경(예: KST가 UTC+10으로 바뀌는 가상의 사건)이 발생하면 본 ADR을 재방문해야 한다(현실적 리스크 ~0).

## Rollback or migration notes
- 다른 타임존으로 전환 시:
  1. `kst_today()` 등 헬퍼를 `service_today(p_user_id)` 류로 교체.
  2. `quiz.day_label`을 timestamptz로 보강.
  3. `weekly_score.week_start` 재계산 배치.
  4. 사용자 설정(또는 가족 설정) 타임존 컬럼 추가.
- v1.1에서 글로벌 출시 검토 시 다중 타임존이 ADR-0004로 분리된다.
