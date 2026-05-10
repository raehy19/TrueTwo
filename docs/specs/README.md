# Specs (F1~F8)

기능별 동작 명세 — `Given/When/Then` (Gherkin) 또는 `The system shall …` (EARS) 형식. PRD §7 기능 맵과 1:1 매칭.

| # | 영역 | 스타일 | 파일 |
|---|---|---|---|
| F1 | 인증 (이메일/비밀번호, 무검증) | Gherkin | [`2026-05-10-auth-google-login.md`](2026-05-10-auth-google-login.md) |
| F2 | 가족 워크스페이스 (생성/참여/6자리 코드) | Gherkin | [`2026-05-10-family-workspace.md`](2026-05-10-family-workspace.md) |
| F3 | 일일 진진거 등록 라이프사이클 (1일 1판 + 백로그) | EARS | [`2026-05-10-daily-quiz-registration.md`](2026-05-10-daily-quiz-registration.md) |
| F4 | AI 가짜 후보 생성 + 사용자 편집 (난이도 4단계) | Gherkin | [`2026-05-10-ai-lie-generation.md`](2026-05-10-ai-lie-generation.md) |
| F5 | 풀이 / 결과 / AI 코멘트 / 진짜 하루 질문 | Gherkin | [`2026-05-10-quiz-answer-results.md`](2026-05-10-quiz-answer-results.md) |
| F6 | 가족 랭킹 5종 + 댓글 | EARS | [`2026-05-10-family-ranking.md`](2026-05-10-family-ranking.md) |
| F7 | 남의 집 진진거 공개 게시판 (AI 익명화 + 업보트) | Gherkin | [`2026-05-10-public-board.md`](2026-05-10-public-board.md) |
| F8 | 가족 대시보드 + 케미 맵 + 캐릭터 코멘트 | EARS | [`2026-05-10-dashboard.md`](2026-05-10-dashboard.md) |

각 spec은 Goal · In/Out scope · 시나리오 또는 요구사항(Acceptance criteria 포함) · Failure modes · Open questions로 구성. 의존 관계는 PRD §7 "기능 간 의존성" 다이어그램 참조.
