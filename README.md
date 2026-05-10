# 하루진진거 (Haru JinJinGuh)

> **가족은 거짓을 맞히러 들어오지만, 결국 서로의 진짜 하루를 알게 된다.**

매일 한 사람의 진진거 한 판(진짜 2개 + 가짜 1개)으로, 가족이 서로의 진짜 하루를 발견하게 만드는 데일리 가족 게임. 2026 가정의 달 시즌, 인디크루 해커톤 출품작.

---

## 한 줄 정의

| 키 | 값 |
|---|---|
| **서비스** | 하루진진거 |
| **메커닉** | 진진거 — 진짜 2 + 가짜 1을 가족이 맞히는 한 판 |
| **차별점** | AI가 가짜 후보 3안을 만들고, 사람이 마지막에 다듬는다. 결과 후 "진짜 하루 질문" 칩으로 가족 대화로 이어진다. |
| **포지션** | 단톡방을 대체하지 않는다 — 단톡방 위에 얹는 가벼운 데일리 의식. |

---

## 데모로 보기

- 🎯 **발표 덱 (HTML)**: [`presentations/haru-jinjingu-pitch.html`](presentations/haru-jinjingu-pitch.html) — 8슬라이드 피치, 브라우저에서 열기 (↓/space/click 으로 진행)
- 📄 **발표 덱 (PDF)**: [`presentations/haru-jinjingu-pitch.pdf`](presentations/haru-jinjingu-pitch.pdf) — 이메일·Slack·Notion·인쇄용
- 🌳 **DB는 이미 살아 있다** — 시드된 가족 1팀(콩가족 코드 `K7M3PQ`)이 진진거 5건과 댓글 14건, 공개 게시물 1건을 가지고 있음. 아래 4개 데모 계정 중 하나로 로그인.

### 데모 계정 (모두 비밀번호 `password123`)

| 역할 | 이메일 | 시연 포인트 |
|---|---|---|
| 엄마 (가족 owner) | `mom@jinjin.demo` | 오늘치 open 진진거 출제자. 결과·랭킹·케미 맵·"지금 결과 공개" 흐름 확인용. |
| 아빠 | `dad@jinjin.demo` | 본인 진진거 1건이 "남의 집 진진거" 게시판에 공유돼 있음. |
| 동생 | `sis@jinjin.demo` | 본인 진진거 풀이 정답률 3/3. 풀이 시점 시연 추천. |
| 나 | `me@jinjin.demo` | 풀이/댓글 흐름 시연 + 어제치 결과 화면 확인용. |

> 새 가족을 만들고 싶다면 회원가입 후 `/onboarding` → "가족 만들기" 또는 위 코드 `K7M3PQ`로 가입.

---

## 핵심 루프

```
[1] 출제자가 진짜 2개 입력
        ↓
[2] AI가 가족이 헷갈릴 가짜 후보 3안 (난이도 1~4, 리롤 2회)
        ↓
[3] 사람이 마지막 편집 — "사람의 손길이 들어간 가짜"
        ↓
[4] 가족이 셔플된 3개 중 가짜 추리 + 한 줄 이유
        ↓
[5] 결과 공개 + AI 코멘트 + "진짜 하루 질문" 칩 2개
        ↓ (선택)
[6] AI 익명화 → 남의 집 진진거 게시판으로 확산
```

핵심 비즈니스 규칙: 1인 1가족 · 하루 1판 · 어제 미등록 시 오늘 백로그 1판 추가 · 24시간 안에 자동 결과 공개 · 출제자 본인은 풀이 불가.

---

## 기술 스택

```
Frontend   Next.js 15 (App Router) + TypeScript + Tailwind 4
Hosting    Vercel (Edge + Serverless)
Auth/DB    Supabase Postgres + Row Level Security
LLM        Anthropic Claude Haiku 4.5
DB SoT     docs/architecture/data-model.md (14 tables · 7 RPC · 9 trigger)
```

DB 변경은 모두 `security definer` RPC를 통해서만 일어나고, 클라이언트는 base table에 직접 INSERT/UPDATE/DELETE할 수 없습니다 (RLS + revoke 잠금). 정답 컬럼(`quiz_option.kind`, `public_post.false_option_index`)은 안전 뷰로만 노출됩니다. 자세한 보안 검토는 [`docs/architecture/data-model.md`](docs/architecture/data-model.md) §15 Production Safety Review.

---

## 로컬에서 실행

```bash
# 1) 의존성
pnpm install

# 2) 환경 변수
cp .env.example .env.local
# - NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# - SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard → Project Settings → API)
# - ANTHROPIC_API_KEY (https://console.anthropic.com)
# - FAMILY_HASH_SALT (openssl rand -base64 32)

# 3) Supabase에 스키마 + seed 적용
# - 새 Supabase 프로젝트라면 다음을 순서대로 실행 (SQL Editor 또는 supabase db push):
#     supabase/migrations/20260510154500_init.sql
#     supabase/migrations/20260510160000_harden_function_search_path_and_grants.sql
#     supabase/seed.sql
# - 위 키들이 가리키는 dev 프로젝트는 이미 적용돼 있음.

# 4) 개발 서버
pnpm dev   # http://localhost:3000
```

---

## 디렉토리

```
src/                        Next.js 앱
  app/(auth)/login          이메일/비밀번호 가입·로그인 (이메일 인증 없음)
  app/onboarding            가족 만들기 / 가입 (6자리 코드)
  app/(app)/home            홈 — 오늘 진진거 / 풀어야 할 진진거
  app/(app)/quiz            등록 위저드, 풀이, 결과
  app/(app)/family          가족 대시보드 (랭킹·케미 맵)
  app/(app)/board           남의 집 진진거 게시판
  app/api/ai                LLM Route Handler (Anthropic)
  components/{ui,app-shell} 공통 UI
  lib/supabase              @supabase/ssr 클라이언트 (browser/server/middleware)
  lib/{anthropic,kst,...}   LLM 호출 / KST 일자 헬퍼

supabase/
  migrations/*.sql          스키마(init) + 보안 강화(harden) — apply_migration 적용 완료
  seed.sql                  콩가족 4명 + 진진거 5건 + 댓글 14건 + 공개 게시물 1건

docs/
  project/                  product brief · brand positioning · PRD
  specs/                    F1~F8 기능 스펙 (Gherkin / EARS)
  architecture/             data-model SoT + ADR-0001..0004
  qa/e2e-scenarios.md       5개 핵심 사용 여정

presentations/
  haru-jinjingu-pitch.html  발표 덱 (HTML, 애니메이션 포함)
  haru-jinjingu-pitch.pdf   동일 내용 PDF 익스포트
```

---

## 핵심 문서 빠른 링크

| 무엇 | 어디 |
|---|---|
| 한 줄 정의·MVP 범위 | [`docs/project/product-brief.md`](docs/project/product-brief.md) |
| 브랜드 문장·문제 정의·톤 | [`docs/project/brand-positioning.md`](docs/project/brand-positioning.md) |
| PRD (16섹션, B-1~B-12 비즈니스 규칙) | [`docs/project/PRD.md`](docs/project/PRD.md) |
| F1~F8 기능 스펙 | [`docs/specs/`](docs/specs/) |
| Supabase 데이터 모델 SoT (RLS·RPC·트리거·안전 뷰·프로덕션 안전 리뷰) | [`docs/architecture/data-model.md`](docs/architecture/data-model.md) |
| ADR (스택/1인1가족/KST/RPC+RLS) | [`docs/architecture/adr/`](docs/architecture/adr/) |
| 5개 핵심 E2E 시나리오 | [`docs/qa/e2e-scenarios.md`](docs/qa/e2e-scenarios.md) |

---

## 라이선스

MVP/해커톤 출품 — 별도 라이선스 미정. 외부 공유 전 권한 확인.
