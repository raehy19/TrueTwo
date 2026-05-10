# 진진거 — Supabase 데이터 모델 (정식 SoT)

- 작성일: 2026-05-10
- 상태: Draft (MVP 초기)
- 호환 대상: Supabase / Postgres 15+
- 관련 문서:
  - [`../project/product-brief.md`](../project/product-brief.md)
  - [`../project/PRD.md`](../project/PRD.md) §7, §9, §12
  - 모든 spec: [`../specs/`](../specs/)

본 문서는 진진거의 Supabase Postgres 스키마를 단일 SoT로 정의한다. 마이그레이션, 타입 생성, RLS 정책, 트리거, 인덱스 모두 본 문서에 정렬한다. PRD/spec과 충돌이 발생하면 본 문서를 갱신하고 사유를 ADR로 남긴다.

---

## 1. 설계 원칙

1. **권한은 RLS로 강제한다.** 클라이언트는 `anon` 키 + 사용자 JWT만 사용한다. `service_role` 키는 서버 사이드(Next.js Route Handler, Edge Function)에서만 사용한다.
2. **불변 진실은 트리거/RPC로 묶는다.** 일일 1개 등록 한도(F3 R-1), 백로그 한도(F3 R-3), 풀이 1회 한도, 결과 공개 트리거는 클라이언트 신뢰 없이 DB가 강제한다.
3. **시간대는 일관된다.** 모든 타임스탬프는 `timestamptz`로 저장하고 KST 비교는 `(now() AT TIME ZONE 'Asia/Seoul')::date`로 명시한다. `dayLabel`은 `date`로 저장한다.
4. **삭제 대신 soft delete.** 가족 자산(진진거/댓글/공개 게시물)은 `deleted_at`/`status`로 비공개화하고 물리 삭제하지 않는다.
5. **금전·민감 데이터는 별도 스키마.** `llm_usage`(비용)는 `auditing` 스키마에 둔다. RLS로 일반 사용자 조회 차단.
6. **Auth는 Supabase의 `auth.users`를 위임한다.** 우리 도메인의 `app_user`는 `auth.users.id`를 PK 외래키로 1:1 매핑한다.
7. **Supabase 네이밍 컨벤션을 따른다.** snake_case, 단수 vs 복수는 테이블 = 복수, 컬럼 = 단수. ENUM은 `_enum` 접미.

---

## 2. 스키마 분리

| 스키마 | 용도 |
|--------|------|
| `public` | 클라이언트가 RLS 안에서 직접 조회/조작하는 도메인 테이블. |
| `private` | 서버 전용. RLS로 사용자 차단. (예: 익명화 매핑, 가족 코드 충돌 카운트, 신고 큐) |
| `auditing` | LLM 호출 로그, 비용 메트릭. |
| `auth` | Supabase 관리. 직접 만들지 않음. |

> 모든 RLS 정책은 `public` 테이블에 둔다. `private`/`auditing`은 RLS로 모두 차단하고 서버에서만 접근.

---

## 3. ENUM 타입

```sql
create type public.family_role_enum     as enum ('owner', 'member');
create type public.option_kind_enum     as enum ('true', 'false');
create type public.quiz_status_enum     as enum ('open', 'revealed');
create type public.comment_kind_enum    as enum ('user', 'ai');
create type public.comment_category_enum as enum ('reaction', 'question', 'other');
create type public.comment_category_source_enum as enum ('heuristic', 'llm');
create type public.public_category_enum as enum ('legend', 'plausible', 'familylike', 'funny_wrong', 'warm');
create type public.public_post_status_enum as enum ('open', 'removed');
create type public.llm_usage_kind_enum  as enum ('generate', 'reroll', 'comment', 'anonymize', 'character_comment');
create type public.report_reason_enum   as enum ('inappropriate', 'identifying', 'spam', 'other');
```

---

## 4. 핵심 테이블

### 4.1 `app_user`

> Supabase의 `auth.users`를 1:1 위임 받아 도메인 속성을 보관한다.

```sql
create table public.app_user (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index app_user_email_idx on public.app_user(email);
```

**트리거**: 신규 `auth.users` 생성 시 `handle_new_auth_user()`가 `app_user`에 행을 만든다. (§9 참조)

---

### 4.2 `family`

```sql
create table public.family (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 20),
  code                char(6) not null unique
                      check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at          timestamptz not null default now(),
  created_by_user_id  uuid not null references public.app_user(id) on delete restrict
);

create index family_code_idx on public.family(code);
```

규칙:
- `code`는 헷갈리는 문자(`I`, `O`, `0`, `1`) 제외. 정규식으로 강제(F2 spec).
- 가족 정원 8명은 `family_member` insert 트리거에서 강제(§9).

---

### 4.3 `family_member`

```sql
create table public.family_member (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.family(id) on delete cascade,
  user_id     uuid not null references public.app_user(id) on delete cascade,
  role        public.family_role_enum not null default 'member',
  nickname    text check (nickname is null or char_length(nickname) between 1 and 12),
  joined_at   timestamptz not null default now(),

  constraint family_member_unique_per_family unique (family_id, user_id),
  constraint family_member_one_family_per_user unique (user_id) -- B-2 (MVP 1인 1가족)
);

create index family_member_family_id_idx on public.family_member(family_id);
create index family_member_user_id_idx on public.family_member(user_id);
```

> **MVP 잠금**: `family_member_one_family_per_user`로 1인 1가족을 DB가 강제한다. v1.1에서 다중 가족을 도입할 때 이 제약을 제거하고 컴파운드 unique로 교체한다.

---

### 4.4 `quiz`

```sql
create table public.quiz (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.family(id) on delete cascade,
  author_user_id  uuid not null references public.app_user(id) on delete restrict,
  day_label       date not null, -- KST 기준 일자
  is_backlog      boolean not null default false,
  difficulty      smallint not null check (difficulty between 1 and 4),
  status          public.quiz_status_enum not null default 'open',
  created_at      timestamptz not null default now(),
  publish_at      timestamptz not null default now(),
  reveal_at       timestamptz not null,             -- = created_at + interval '24 hour'
  revealed_at     timestamptz,                      -- 실제 공개 시각

  -- 한 사용자가 같은 가족에서 같은 dayLabel로 1개만 등록(F3 R-1)
  constraint quiz_one_per_user_per_day unique (family_id, author_user_id, day_label)
);

create index quiz_family_status_idx on public.quiz(family_id, status);
create index quiz_family_day_label_idx on public.quiz(family_id, day_label);
create index quiz_open_reveal_at_idx on public.quiz(reveal_at) where status = 'open';
```

**계산 컬럼 / 트리거 책임**:
- `reveal_at`은 트리거에서 `publish_at + interval '24 hour'`로 강제(§9).
- `status` 전환은 `mark_quiz_revealed_if_needed(quiz_id)` RPC(§9)에서만 변경한다.

---

### 4.5 `quiz_option`

```sql
create table public.quiz_option (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quiz(id) on delete cascade,
  kind          public.option_kind_enum not null,
  text          text not null check (char_length(text) between 5 and 200),
  source_llm    text,           -- model id (null이면 사용자 직접 입력)
  edited        boolean not null default false,
  position      smallint not null check (position between 1 and 3), -- 출제자 입력 순서, 사용자 노출 시 셔플
  created_at    timestamptz not null default now(),

  constraint quiz_option_position_unique unique (quiz_id, position)
);

create index quiz_option_quiz_id_idx on public.quiz_option(quiz_id);
```

**무결성 트리거**: 한 quiz는 정확히 진짜 2개 + 가짜 1개를 가져야 한다. `quiz_option_after_change_check()` 트리거가 commit 시점에 검증(§9).

**보안 메모 (CRITICAL)**: `kind`/`source_llm`/`edited` 컬럼은 정답을 그대로 노출하므로 클라이언트가 `quiz_option`을 직접 SELECT하면 게임이 무의미해진다. RLS만으로는 컬럼 단위 마스킹이 불가능하므로, 클라이언트 SELECT 권한은 **revoke**하고 뷰 두 개로만 접근하게 한다.
- `public.quiz_option_safe_v` — open 상태에서도 노출 가능한 컬럼만 (`id, quiz_id, position, text`).
- `public.quiz_option_revealed_v` — `quiz.status = 'revealed'`인 진진거의 모든 컬럼.

정의는 §5 참고.

---

### 4.6 `answer`

```sql
create table public.answer (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid not null references public.quiz(id) on delete cascade,
  solver_user_id      uuid not null references public.app_user(id) on delete cascade,
  chosen_option_id    uuid not null references public.quiz_option(id) on delete cascade,
  reason_text         text check (reason_text is null or char_length(reason_text) between 1 and 80),
  is_correct          boolean not null,             -- 트리거에서 계산
  created_at          timestamptz not null default now(),

  constraint answer_one_per_user_per_quiz unique (quiz_id, solver_user_id)
);

create index answer_quiz_id_idx on public.answer(quiz_id);
create index answer_solver_user_id_idx on public.answer(solver_user_id);
```

**트리거 책임**:
- 출제자 본인 풀이 금지(F5 S-5): `answer_block_author()` 트리거.
- `is_correct`는 `quiz_option.kind = 'false'`인지로 자동 계산.
- insert 직후 `mark_quiz_revealed_if_needed(quiz_id)` 호출 → 모든 풀이자 풀이 완료 시 자동 reveal(F3 R-8).

---

### 4.7 `comment`

```sql
create table public.comment (
  id                uuid primary key default gen_random_uuid(),
  quiz_id           uuid not null references public.quiz(id) on delete cascade,
  author_user_id    uuid references public.app_user(id) on delete set null, -- AI는 null
  kind              public.comment_kind_enum not null,
  category          public.comment_category_enum,             -- 사용자 댓글에만 의미 있음
  category_source   public.comment_category_source_enum,      -- 'heuristic' | 'llm'
  text              text not null check (char_length(text) between 1 and 200),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint comment_ai_no_author check (
    (kind = 'ai' and author_user_id is null) or (kind = 'user' and author_user_id is not null)
  )
);

create index comment_quiz_id_idx on public.comment(quiz_id);
create index comment_quiz_kind_idx on public.comment(quiz_id, kind);

-- AI 자동 코멘트는 진진거 1건당 1개만 (F5 S-10)
create unique index comment_ai_unique_per_quiz on public.comment(quiz_id) where kind = 'ai';
```

---

### 4.8 `weekly_score`

> 주간 5종 랭킹(F6) 점수를 매번 집계하지 않도록 사전 집계 테이블로 둔다. reveal/comment 이벤트에서 트리거로 갱신.

```sql
create type public.score_category_enum as enum (
  'detective', 'lie_designer', 'pure_hearted', 'reaction_star', 'question_master'
);

create table public.weekly_score (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.family(id) on delete cascade,
  user_id     uuid not null references public.app_user(id) on delete cascade,
  week_start  date not null,                      -- KST 기준 그 주 월요일 (00:00 KST)
  category    public.score_category_enum not null,
  numerator   numeric not null default 0,         -- 정답수, 평균속임률 합 등
  denominator numeric not null default 0,         -- 풀이수, 등록수 등
  count       integer not null default 0,         -- reaction/question용 단순 카운트
  updated_at  timestamptz not null default now(),

  constraint weekly_score_unique unique (family_id, user_id, week_start, category)
);

create index weekly_score_family_week_idx on public.weekly_score(family_id, week_start);
```

> 표시 점수는 카테고리별 산식(F6 정의)에 따라 view 또는 query에서 계산한다. (`detective.score = numerator / nullif(denominator, 0)` 등)

---

### 4.9 `family_chemistry`

> 케미 맵(F8). 출제자×풀이자 조합별 누적치.

```sql
create table public.family_chemistry (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.family(id) on delete cascade,
  author_user_id  uuid not null references public.app_user(id) on delete cascade,
  solver_user_id  uuid not null references public.app_user(id) on delete cascade,
  total_solved    integer not null default 0,
  total_correct   integer not null default 0,
  updated_at      timestamptz not null default now(),

  constraint family_chemistry_unique unique (family_id, author_user_id, solver_user_id),
  constraint family_chemistry_no_self check (author_user_id <> solver_user_id)
);

create index family_chemistry_family_idx on public.family_chemistry(family_id);
```

---

### 4.10 `character_comment_cache`

```sql
create table public.character_comment_cache (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.family(id) on delete cascade,
  user_id     uuid not null references public.app_user(id) on delete cascade,
  day_label   date not null,                      -- KST 일자, 일 1회 갱신
  text        text not null check (char_length(text) between 10 and 200),
  created_at  timestamptz not null default now(),

  constraint character_comment_cache_unique unique (family_id, user_id, day_label)
);

create index character_comment_cache_family_day_idx
  on public.character_comment_cache(family_id, day_label);
```

---

### 4.11 `public_post`

```sql
create table public.public_post (
  id                    uuid primary key default gen_random_uuid(),
  source_quiz_id        uuid not null unique references public.quiz(id) on delete cascade,
  family_id             uuid not null references public.family(id) on delete cascade,
  -- 가족이 다른 가족이라는 사실 외에 어떤 가족인지 노출하지 않기 위한 해시
  author_family_hash    text not null,                  -- sha256(family_id || system_salt)
  category              public.public_category_enum not null,
  status                public.public_post_status_enum not null default 'open',

  -- 익명화된 옵션 3개를 비정규화로 보존 (원본 quiz_option은 가족 안에서만 보임)
  -- 정답 인덱스(0..2)도 함께 저장해 정답 보기 동작에 사용.
  options               jsonb not null,                 -- [{text}, {text}, {text}]
  false_option_index    smallint not null check (false_option_index between 0 and 2),

  upvote_count          integer not null default 0,
  comment_count         integer not null default 0,
  solve_attempt_count   integer not null default 0,
  solve_correct_count   integer not null default 0,

  published_at          timestamptz not null default now(),
  removed_at            timestamptz
);

create index public_post_published_idx on public.public_post(published_at desc);
create index public_post_category_published_idx
  on public.public_post(category, published_at desc) where status = 'open';
create index public_post_upvote_idx
  on public.public_post(upvote_count desc, published_at desc) where status = 'open';
```

**보안 메모 (CRITICAL)**:
- `false_option_index`는 곧 정답이다. 익명 클라이언트가 SELECT 가능하면 게시판 풀이가 무의미해진다.
- `family_id`/`source_quiz_id`는 게시물을 가족·내부 quiz로 역참조 가능하게 만든다(가족 식별 노출).
- 따라서 클라이언트의 `public_post` 직접 SELECT 권한은 **revoke**하고, 안전 뷰 `public.public_post_safe_v`로만 노출한다(§5 참고).
- 풀이 정답 여부는 RPC `public.solve_public_post(p_post_id, p_chosen_index)`(§7)가 서버 측에서 비교하고 결과만 반환한다.

```sql
create table public.public_upvote (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.public_post(id) on delete cascade,
  voter_user_id uuid not null references public.app_user(id) on delete cascade,
  created_at    timestamptz not null default now(),

  constraint public_upvote_unique unique (post_id, voter_user_id)
);

create index public_upvote_post_idx on public.public_upvote(post_id);
```

---

### 4.13 `public_comment`

```sql
create table public.public_comment (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.public_post(id) on delete cascade,
  author_user_id  uuid not null references public.app_user(id) on delete cascade,
  text            text not null check (char_length(text) between 1 and 200),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index public_comment_post_idx on public.public_comment(post_id, created_at);
```

---

### 4.14 `public_solve_attempt`

```sql
create table public.public_solve_attempt (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.public_post(id) on delete cascade,
  solver_user_id  uuid not null references public.app_user(id) on delete cascade,
  chosen_index    smallint not null check (chosen_index between 0 and 2),
  is_correct      boolean not null,
  created_at      timestamptz not null default now(),

  -- 한 사용자는 한 게시물에 1번 시도만 카운트(F7 S-11)
  constraint public_solve_attempt_unique unique (post_id, solver_user_id)
);

create index public_solve_attempt_post_idx on public.public_solve_attempt(post_id);
```

---

### 4.15 `public_report` (신고)

```sql
create table private.public_report (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.public_post(id) on delete cascade,
  reporter_user_id uuid not null references public.app_user(id) on delete set null,
  reason          public.report_reason_enum not null,
  text            text check (text is null or char_length(text) <= 500),
  created_at      timestamptz not null default now()
);

create index public_report_post_idx on private.public_report(post_id);
```

> `private` 스키마는 RLS로 모든 사용자 접근 차단. 운영팀이 `service_role`로만 조회.

---

### 4.16 `auditing.llm_usage`

```sql
create table auditing.llm_usage (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.app_user(id) on delete set null,
  family_id       uuid references public.family(id) on delete set null,
  quiz_id         uuid references public.quiz(id) on delete set null,
  post_id         uuid references public.public_post(id) on delete set null,
  kind            public.llm_usage_kind_enum not null,
  model           text not null,
  prompt_tokens   integer not null,
  output_tokens   integer not null,
  cost_krw        numeric(12, 4) not null,
  created_at      timestamptz not null default now()
);

create index llm_usage_family_day_idx
  on auditing.llm_usage(family_id, created_at);
```

> RLS로 사용자 접근 차단. 비용 가드 메트릭 산정용.

---

### 4.17 `private.family_anonymization_map` (옵션, OQ-P1)

> 가족이 자기 가족의 호칭 매핑("쮸니" → "동생")을 사전 입력하면 LLM 익명화 품질이 좋아진다. MVP는 행 0개로 출시 가능.

```sql
create table private.family_anonymization_map (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.family(id) on delete cascade,
  source      text not null,                   -- 원문 호칭 ("쮸니")
  target_role text not null,                   -- 일반화 표현 ("동생")
  created_at  timestamptz not null default now(),

  constraint family_anonymization_map_unique unique (family_id, source)
);
```

---

## 5. 뷰 (Views)

### 5.1 `quiz_with_stats`

> 결과 화면(F5), 대시보드(F8)에서 자주 함께 읽는 통계 컬럼을 단일 뷰로.

```sql
create or replace view public.quiz_with_stats as
select
  q.*,
  (select count(*) from public.answer a where a.quiz_id = q.id) as solver_count,
  (select count(*) from public.answer a where a.quiz_id = q.id and a.is_correct) as correct_count,
  case
    when (select count(*) from public.answer a where a.quiz_id = q.id) = 0 then null
    else 1.0 - (
      (select count(*) filter (where a.is_correct) from public.answer a where a.quiz_id = q.id)::numeric
      / nullif((select count(*) from public.answer a where a.quiz_id = q.id), 0)
    )
  end as fool_rate
from public.quiz q;
```

> 뷰는 RLS 미상속. 항상 `quiz`의 RLS를 거쳐 접근하도록 `security_invoker = true` 옵션을 함께 설정한다(Postgres 15+).
> ```sql
> alter view public.quiz_with_stats set (security_invoker = true);
> ```

### 5.2 `weekly_ranking_v` — 주간 5종 랭킹 표시용

```sql
create or replace view public.weekly_ranking_v as
select
  ws.family_id,
  ws.week_start,
  ws.category,
  ws.user_id,
  case ws.category
    when 'detective'    then case when ws.denominator >= 3 then ws.numerator / ws.denominator else null end
    when 'pure_hearted' then case when ws.denominator >= 3 then 1.0 - (ws.numerator / ws.denominator) else null end
    when 'lie_designer' then case when ws.denominator >= 2 then ws.numerator / ws.denominator else null end
    when 'reaction_star'  then ws.count
    when 'question_master' then ws.count
  end as score
from public.weekly_score ws;
alter view public.weekly_ranking_v set (security_invoker = true);
```

### 5.3 `quiz_option_safe_v` — open/revealed 모두 안전한 옵션 뷰

> 클라이언트가 항상 사용한다. `kind`/`source_llm`/`edited`를 노출하지 않는다.

```sql
create or replace view public.quiz_option_safe_v as
select id, quiz_id, position, text, created_at
from public.quiz_option;
alter view public.quiz_option_safe_v set (security_invoker = true);
```

### 5.4 `quiz_option_revealed_v` — 결과 공개 후 정답 라벨까지 보이는 뷰

> `quiz.status = 'revealed'`인 옵션만 `kind`까지 함께 노출. 결과 화면(F5) 전용.

```sql
create or replace view public.quiz_option_revealed_v as
select o.id, o.quiz_id, o.position, o.text, o.kind, o.source_llm, o.edited, o.created_at
from public.quiz_option o
join public.quiz q on q.id = o.quiz_id
where q.status = 'revealed';
alter view public.quiz_option_revealed_v set (security_invoker = true);
```

### 5.5 `public_post_safe_v` — 게시판 클라이언트 전용

> `false_option_index`/`family_id`/`source_quiz_id` 등 정답·식별 노출 컬럼을 모두 숨긴다. `options`는 jsonb 그대로 노출하되 정답 표시는 들어 있지 않다.

```sql
create or replace view public.public_post_safe_v as
select
  id,
  author_family_hash,
  category,
  status,
  options,
  upvote_count,
  comment_count,
  solve_attempt_count,
  -- 공개 정답률만 노출 (raw 정답 인덱스는 숨김)
  case when solve_attempt_count > 0
       then (solve_correct_count::numeric / solve_attempt_count)
       else null end as solve_accuracy,
  published_at,
  removed_at
from public.public_post
where status = 'open';
alter view public.public_post_safe_v set (security_invoker = true);
```

### 5.6 `family_member_profile_v` — 가족 멤버 + 프로필 조인

> `family_member`와 `app_user`를 조인해 닉네임/표시이름/아바타를 한 번에 가져오는 가족 멤버 목록 뷰.

```sql
create or replace view public.family_member_profile_v as
select
  fm.id              as member_id,
  fm.family_id,
  fm.user_id,
  fm.role,
  fm.nickname,
  fm.joined_at,
  u.display_name,
  u.avatar_url
from public.family_member fm
join public.app_user u on u.id = fm.user_id;
alter view public.family_member_profile_v set (security_invoker = true);
```

---

## 6. 헬퍼 함수

### 6.1 `kst_today() / kst_yesterday()`

```sql
create or replace function public.kst_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

create or replace function public.kst_yesterday()
returns date language sql stable as $$
  select ((now() at time zone 'Asia/Seoul')::date - interval '1 day')::date
$$;

create or replace function public.kst_week_start(d date)
returns date language sql immutable as $$
  -- ISO 월요일 시작
  select (d - ((extract(isodow from d)::int - 1)) * interval '1 day')::date
$$;
```

### 6.2 `gen_family_code()`

> `random()`은 의사난수라 추측 가능성이 있다. `pgcrypto`의 `gen_random_bytes`로 32-진법 인덱스를 뽑아 6자리를 만든다.

```sql
-- 마이그레이션 사전 단계에서 1회 실행
create extension if not exists pgcrypto;

create or replace function public.gen_family_code()
returns char(6)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- I, O, 0, 1 제외 (32 chars)
  result text := '';
  byte int;
  i int;
begin
  for i in 1..6 loop
    -- 0..255에서 32 미만이 될 때까지 reroll → 모듈로 편향 회피
    loop
      byte := get_byte(gen_random_bytes(1), 0);
      exit when byte < 32 * 8; -- 256 / 32 = 8 균등 구간
    end loop;
    result := result || substr(alphabet, 1 + (byte % 32), 1);
  end loop;
  return result;
end $$;
```

### 6.3 `current_app_user_id()`

```sql
create or replace function public.current_app_user_id()
returns uuid language sql stable as $$
  select auth.uid()
$$;
```

### 6.4 `is_family_member(family_id)`

```sql
create or replace function public.is_family_member(p_family_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.family_member
    where family_id = p_family_id
      and user_id = auth.uid()
  );
$$;
```

---

## 7. RPC 함수 (서버 호출 진입점)

> 클라이언트는 직접 INSERT 대신 아래 RPC를 호출한다. 비즈니스 규칙(F3, F5)을 DB가 atomic하게 강제한다.

### 7.1 `create_family(name)`

```sql
create or replace function public.create_family(p_name text)
returns public.family
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_code char(6);
  v_family public.family;
  v_attempts int := 0;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists (select 1 from public.family_member where user_id = v_user_id) then
    raise exception 'ALREADY_IN_FAMILY';
  end if;

  loop
    v_code := public.gen_family_code();
    begin
      insert into public.family(name, code, created_by_user_id)
      values (p_name, v_code, v_user_id)
      returning * into v_family;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 5 then raise exception 'CODE_GENERATION_FAILED'; end if;
    end;
  end loop;

  insert into public.family_member(family_id, user_id, role)
  values (v_family.id, v_user_id, 'owner');

  return v_family;
end $$;
```

### 7.2 `join_family(code)`

```sql
create or replace function public.join_family(p_code char(6))
returns public.family
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_family public.family;
  v_member_count int;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists (select 1 from public.family_member where user_id = v_user_id) then
    raise exception 'ALREADY_IN_FAMILY';
  end if;

  -- 가족 행을 잠가 capacity 검사와 insert를 atomic하게.
  -- 동시에 여러 사용자가 join을 시도해도 8명 초과 race가 발생하지 않는다.
  select * into v_family from public.family where code = p_code for update;
  if v_family.id is null then raise exception 'FAMILY_NOT_FOUND'; end if;

  select count(*) into v_member_count from public.family_member where family_id = v_family.id;
  if v_member_count >= 8 then raise exception 'FAMILY_FULL'; end if;

  insert into public.family_member(family_id, user_id, role)
  values (v_family.id, v_user_id, 'member');

  return v_family;
end $$;
```

### 7.3 `create_quiz(...)` — F3 핵심 RPC

```sql
create or replace function public.create_quiz(
  p_true_1 text,
  p_true_2 text,
  p_false text,
  p_false_source_llm text,
  p_false_edited boolean,
  p_difficulty smallint,
  p_is_backlog boolean
)
returns public.quiz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_day_label date;
  v_quiz public.quiz;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select fm.family_id into v_family_id
  from public.family_member fm where fm.user_id = v_user_id;
  if v_family_id is null then raise exception 'NO_FAMILY'; end if;

  -- 백로그 분기
  if p_is_backlog then
    v_day_label := public.kst_yesterday();
    -- 어제치가 이미 있으면 거부 (F3 R-3)
    if exists (
      select 1 from public.quiz
      where family_id = v_family_id
        and author_user_id = v_user_id
        and day_label = v_day_label
    ) then raise exception 'BACKLOG_ALREADY_EXISTS'; end if;
  else
    v_day_label := public.kst_today();
    -- 오늘치가 이미 있으면 거부 (F3 R-1)
    if exists (
      select 1 from public.quiz
      where family_id = v_family_id
        and author_user_id = v_user_id
        and day_label = v_day_label
    ) then raise exception 'TODAY_ALREADY_EXISTS'; end if;
  end if;

  insert into public.quiz(
    family_id, author_user_id, day_label, is_backlog, difficulty,
    publish_at, reveal_at
  ) values (
    v_family_id, v_user_id, v_day_label, coalesce(p_is_backlog, false), p_difficulty,
    v_now, v_now + interval '24 hour'
  ) returning * into v_quiz;

  -- 옵션 3개를 한 번에 삽입 (진짜 2 + 가짜 1)
  insert into public.quiz_option(quiz_id, kind, text, position, source_llm, edited)
  values
    (v_quiz.id, 'true',  p_true_1, 1, null, false),
    (v_quiz.id, 'true',  p_true_2, 2, null, false),
    (v_quiz.id, 'false', p_false,  3, p_false_source_llm, coalesce(p_false_edited, false));

  return v_quiz;
end $$;
```

### 7.4 `submit_answer(quiz_id, chosen_option_id, reason_text)`

```sql
create or replace function public.submit_answer(
  p_quiz_id uuid,
  p_chosen_option_id uuid,
  p_reason_text text
)
returns public.answer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_quiz public.quiz;
  v_option public.quiz_option;
  v_answer public.answer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_quiz from public.quiz where id = p_quiz_id;
  if v_quiz.id is null then raise exception 'QUIZ_NOT_FOUND'; end if;
  if v_quiz.status <> 'open' then raise exception 'QUIZ_NOT_OPEN'; end if;
  if v_quiz.author_user_id = v_user_id then raise exception 'AUTHOR_CANNOT_ANSWER'; end if;
  if not public.is_family_member(v_quiz.family_id) then raise exception 'NOT_FAMILY_MEMBER'; end if;

  select * into v_option from public.quiz_option
   where id = p_chosen_option_id and quiz_id = p_quiz_id;
  if v_option.id is null then raise exception 'OPTION_NOT_IN_QUIZ'; end if;

  insert into public.answer(quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct)
  values (p_quiz_id, v_user_id, p_chosen_option_id, p_reason_text, v_option.kind = 'false')
  returning * into v_answer;

  -- 모든 풀이자 풀이 완료 시 reveal (F3 R-8)
  perform public.mark_quiz_revealed_if_needed(p_quiz_id);

  return v_answer;
end $$;
```

### 7.5 `mark_quiz_revealed_if_needed(quiz_id)`

```sql
create or replace function public.mark_quiz_revealed_if_needed(p_quiz_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quiz public.quiz;
  v_total int;
  v_answered int;
begin
  select * into v_quiz from public.quiz where id = p_quiz_id for update;
  if v_quiz.status <> 'open' then return; end if;

  select count(*) into v_total
    from public.family_member
   where family_id = v_quiz.family_id
     and user_id <> v_quiz.author_user_id;

  select count(*) into v_answered
    from public.answer where quiz_id = p_quiz_id;

  if v_answered >= v_total and v_total > 0 then
    update public.quiz
       set status = 'revealed', revealed_at = now()
     where id = p_quiz_id;
  end if;
end $$;
```

### 7.6 `reveal_quiz_now(quiz_id)` — 출제자 강제 공개

```sql
create or replace function public.reveal_quiz_now(p_quiz_id uuid)
returns public.quiz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_quiz public.quiz;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_quiz from public.quiz where id = p_quiz_id for update;
  if v_quiz.id is null then raise exception 'QUIZ_NOT_FOUND'; end if;
  if v_quiz.author_user_id <> v_user_id then raise exception 'ONLY_AUTHOR_CAN_REVEAL'; end if;
  if v_quiz.status <> 'open' then return v_quiz; end if;

  update public.quiz set status = 'revealed', revealed_at = now() where id = p_quiz_id
    returning * into v_quiz;
  return v_quiz;
end $$;
```

### 7.7 `solve_public_post(post_id, chosen_index)` — 게시판 풀이

> 클라이언트는 정답 인덱스를 직접 알 수 없다. 본 RPC가 서버 측에서 비교 후 결과만 반환한다. 같은 사용자가 같은 게시물에 대해 두 번 이상 시도해도 첫 번째 결과만 카운트된다.

```sql
create or replace function public.solve_public_post(
  p_post_id uuid,
  p_chosen_index smallint
)
returns table(is_correct boolean, false_option_index smallint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.public_post;
  v_correct boolean;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_chosen_index < 0 or p_chosen_index > 2 then raise exception 'INVALID_INDEX'; end if;

  select * into v_post from public.public_post where id = p_post_id;
  if v_post.id is null then raise exception 'POST_NOT_FOUND'; end if;
  if v_post.status <> 'open' then raise exception 'POST_NOT_OPEN'; end if;

  v_correct := (p_chosen_index = v_post.false_option_index);

  -- 첫 시도만 기록(unique 제약). 중복은 무시.
  insert into public.public_solve_attempt(post_id, solver_user_id, chosen_index, is_correct)
  values (p_post_id, v_user_id, p_chosen_index, v_correct)
  on conflict (post_id, solver_user_id) do nothing;

  return query select v_correct, v_post.false_option_index;
end $$;
```

> 본 RPC만 실행 권한을 부여한다: `grant execute on function public.solve_public_post(uuid, smallint) to authenticated;` (anon은 풀이 불가, 로그인 필수).

### 7.8 `auto_reveal_expired()` — Cron(매분)

```sql
create or replace function public.auto_reveal_expired()
returns int
language plpgsql
security definer
as $$
declare v_n int;
begin
  with updated as (
    update public.quiz
       set status = 'revealed', revealed_at = now()
     where status = 'open' and reveal_at <= now()
     returning id
  )
  select count(*) into v_n from updated;
  return v_n;
end $$;
```

> Supabase Scheduled Functions(`pg_cron` 확장) 또는 외부 스케줄러로 `select public.auto_reveal_expired();`를 1분 간격 실행한다.

---

## 8. 트리거

### 8.1 `handle_new_auth_user` / `handle_auth_user_updated`

> 신규 가입 시 `app_user`를 생성하고, 이후 로그인마다 표시 이름/아바타/이메일을 갱신한다. Supabase의 `auth.users`는 OIDC `sub`이 같으면 같은 행이 유지되므로, 외부에서 이메일/표시 이름을 바꿔도 `app_user`로 sync된다.

```sql
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.app_user(id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email        = excluded.email,
        display_name = excluded.display_name,
        avatar_url   = excluded.avatar_url,
        updated_at   = now();
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- 이후 로그인/프로필 업데이트로 auth.users가 변경되면 동기화
create trigger on_auth_user_updated
after update on auth.users
for each row execute procedure public.handle_new_auth_user();
```

### 8.2 `family_member_capacity_check` — 가족 정원 8명

> 동시성 보호를 위해 가족 행을 잠근다. RPC `join_family`도 이미 잠그지만, 다른 경로(예: service_role 직삽입)에서도 보호한다.

```sql
create or replace function public.family_member_capacity_check()
returns trigger language plpgsql as $$
declare v_count int;
begin
  -- 가족 행을 짧게 잠가 동시 insert race를 차단
  perform 1 from public.family where id = new.family_id for update;

  select count(*) into v_count from public.family_member where family_id = new.family_id;
  if v_count >= 8 then raise exception 'FAMILY_FULL'; end if;
  return new;
end $$;

create trigger family_member_capacity_check_trg
before insert on public.family_member
for each row execute procedure public.family_member_capacity_check();
```

### 8.3 `quiz_option_after_change_check` — 진짜 2 + 가짜 1 무결성

```sql
create or replace function public.quiz_option_after_change_check()
returns trigger language plpgsql as $$
declare
  v_quiz_id uuid := coalesce(new.quiz_id, old.quiz_id);
  v_true_count int;
  v_false_count int;
begin
  select count(*) filter (where kind = 'true'),
         count(*) filter (where kind = 'false')
    into v_true_count, v_false_count
    from public.quiz_option
   where quiz_id = v_quiz_id;

  -- create_quiz는 한 트랜잭션에서 3행을 한 번에 삽입하므로 deferred에서 검증
  if v_true_count <> 2 or v_false_count <> 1 then
    raise exception 'QUIZ_OPTIONS_INVARIANT_VIOLATED';
  end if;
  return null;
end $$;

create constraint trigger quiz_option_invariant
after insert or update or delete on public.quiz_option
deferrable initially deferred
for each row execute procedure public.quiz_option_after_change_check();
```

### 8.4 `weekly_score_on_reveal` — F6 점수 갱신

```sql
create or replace function public.weekly_score_on_reveal()
returns trigger language plpgsql as $$
declare
  v_week date := public.kst_week_start( (new.revealed_at at time zone 'Asia/Seoul')::date );
  v_correct int;
  v_solvers int;
  v_fool_rate numeric;
begin
  if new.status <> 'revealed' or old.status = 'revealed' then return new; end if;

  -- 풀이자별 정답/오답을 detective / pure_hearted에 가산
  insert into public.weekly_score(family_id, user_id, week_start, category, numerator, denominator)
  select new.family_id, a.solver_user_id, v_week, 'detective',
         (case when a.is_correct then 1 else 0 end),
         1
    from public.answer a where a.quiz_id = new.id
  on conflict (family_id, user_id, week_start, category)
  do update set numerator = public.weekly_score.numerator + excluded.numerator,
                denominator = public.weekly_score.denominator + excluded.denominator,
                updated_at = now();

  insert into public.weekly_score(family_id, user_id, week_start, category, numerator, denominator)
  select new.family_id, a.solver_user_id, v_week, 'pure_hearted',
         (case when a.is_correct then 0 else 1 end),
         1
    from public.answer a where a.quiz_id = new.id
  on conflict (family_id, user_id, week_start, category)
  do update set numerator = public.weekly_score.numerator + excluded.numerator,
                denominator = public.weekly_score.denominator + excluded.denominator,
                updated_at = now();

  -- 출제자 lie_designer (이번 진진거의 속임률)
  select count(*), count(*) filter (where is_correct)
    into v_solvers, v_correct
    from public.answer where quiz_id = new.id;
  if v_solvers > 0 then
    v_fool_rate := 1.0 - (v_correct::numeric / v_solvers);
    insert into public.weekly_score(family_id, user_id, week_start, category, numerator, denominator)
    values (new.family_id, new.author_user_id, v_week, 'lie_designer', v_fool_rate, 1)
    on conflict (family_id, user_id, week_start, category)
    do update set numerator = public.weekly_score.numerator + excluded.numerator,
                  denominator = public.weekly_score.denominator + excluded.denominator,
                  updated_at = now();
  end if;

  -- 케미 매트릭스 갱신
  insert into public.family_chemistry(family_id, author_user_id, solver_user_id, total_solved, total_correct)
  select new.family_id, new.author_user_id, a.solver_user_id, 1, (case when a.is_correct then 1 else 0 end)
    from public.answer a where a.quiz_id = new.id
  on conflict (family_id, author_user_id, solver_user_id)
  do update set total_solved = public.family_chemistry.total_solved + excluded.total_solved,
                total_correct = public.family_chemistry.total_correct + excluded.total_correct,
                updated_at = now();

  return new;
end $$;

create trigger weekly_score_on_reveal_trg
after update on public.quiz
for each row when (old.status is distinct from new.status)
execute procedure public.weekly_score_on_reveal();
```

### 8.5 `weekly_score_on_user_comment` — reaction/question 가산

```sql
create or replace function public.weekly_score_on_user_comment()
returns trigger language plpgsql as $$
declare
  v_quiz public.quiz;
  v_week date;
  v_category public.score_category_enum;
begin
  if new.kind <> 'user' or new.author_user_id is null then return new; end if;

  select * into v_quiz from public.quiz where id = new.quiz_id;
  v_week := public.kst_week_start( (now() at time zone 'Asia/Seoul')::date );

  if new.category = 'reaction' then v_category := 'reaction_star';
  elsif new.category = 'question' then v_category := 'question_master';
  else return new; end if;

  insert into public.weekly_score(family_id, user_id, week_start, category, count)
  values (v_quiz.family_id, new.author_user_id, v_week, v_category, 1)
  on conflict (family_id, user_id, week_start, category)
  do update set count = public.weekly_score.count + 1, updated_at = now();

  return new;
end $$;

create trigger weekly_score_on_user_comment_trg
after insert on public.comment
for each row execute procedure public.weekly_score_on_user_comment();
```

### 8.6 `public_post_counters_*` — 카운터 비정규화

```sql
-- upvote
create or replace function public.public_post_upvote_counter()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.public_post set upvote_count = upvote_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.public_post set upvote_count = greatest(upvote_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
create trigger public_post_upvote_counter_trg
after insert or delete on public.public_upvote
for each row execute procedure public.public_post_upvote_counter();

-- comment 카운터
create or replace function public.public_post_comment_counter()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.public_post set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'UPDATE' then
    -- soft-delete: deleted_at가 null → not null로 바뀐 경우만 차감
    if old.deleted_at is null and new.deleted_at is not null then
      update public.public_post set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
    end if;
  end if;
  return null;
end $$;
create trigger public_post_comment_counter_trg
after insert or update on public.public_comment
for each row execute procedure public.public_post_comment_counter();

-- solve_attempt 카운터 (시도 수 + 정답 수)
create or replace function public.public_post_solve_counter()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.public_post
       set solve_attempt_count = solve_attempt_count + 1,
           solve_correct_count = solve_correct_count + (case when new.is_correct then 1 else 0 end)
     where id = new.post_id;
  end if;
  return null;
end $$;
create trigger public_post_solve_counter_trg
after insert on public.public_solve_attempt
for each row execute procedure public.public_post_solve_counter();
```

### 8.7 `comment_user_delete_window` — 5분 삭제 창

```sql
create or replace function public.comment_user_delete_window()
returns trigger language plpgsql as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    if old.kind <> 'user' then raise exception 'CANNOT_DELETE_NON_USER_COMMENT'; end if;
    if old.author_user_id <> auth.uid() then raise exception 'ONLY_AUTHOR_CAN_DELETE'; end if;
    if old.created_at < (now() - interval '5 minute') then raise exception 'DELETE_WINDOW_EXPIRED'; end if;
  end if;
  return new;
end $$;

create trigger comment_user_delete_window_trg
before update on public.comment
for each row execute procedure public.comment_user_delete_window();
```

### 8.8 `set_updated_at` — 공용 갱신 트리거

> `updated_at` 컬럼이 있는 테이블 모두에 같은 트리거를 건다. 애플리케이션이 `updated_at`을 직접 set하지 않아도 항상 최신 값으로 유지된다.

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger app_user_set_updated_at
before update on public.app_user
for each row execute procedure public.set_updated_at();

create trigger weekly_score_set_updated_at
before update on public.weekly_score
for each row execute procedure public.set_updated_at();

create trigger family_chemistry_set_updated_at
before update on public.family_chemistry
for each row execute procedure public.set_updated_at();
```

### 8.9 `weekly_score_on_comment_soft_delete` — 댓글 5분 내 삭제 시 점수 차감

> 8.5에서 reaction/question 댓글 작성 시 점수가 가산된다. 사용자가 5분 안에 삭제하면 가산도 되돌려야 어뷰징 회피 가능.

```sql
create or replace function public.weekly_score_on_comment_soft_delete()
returns trigger language plpgsql as $$
declare
  v_quiz public.quiz;
  v_week date;
  v_category public.score_category_enum;
begin
  if old.deleted_at is null and new.deleted_at is not null
     and old.kind = 'user' and old.author_user_id is not null then

    if old.category = 'reaction' then v_category := 'reaction_star';
    elsif old.category = 'question' then v_category := 'question_master';
    else return new; end if;

    select * into v_quiz from public.quiz where id = old.quiz_id;
    v_week := public.kst_week_start( (old.created_at at time zone 'Asia/Seoul')::date );

    update public.weekly_score
       set count = greatest(count - 1, 0), updated_at = now()
     where family_id = v_quiz.family_id
       and user_id = old.author_user_id
       and week_start = v_week
       and category = v_category;
  end if;
  return new;
end $$;

create trigger weekly_score_on_comment_soft_delete_trg
after update on public.comment
for each row execute procedure public.weekly_score_on_comment_soft_delete();
```

---

## 9. RLS 정책

> 모든 `public` 테이블에 `enable row level security`를 켠 뒤, 아래 정책을 정의한다. 클라이언트는 RLS 통과 가능한 SELECT만 직접 사용하고, INSERT/UPDATE는 가능한 한 RPC를 통한다.

### 9.1 공통 패턴

```sql
alter table public.app_user             enable row level security;
alter table public.family               enable row level security;
alter table public.family_member        enable row level security;
alter table public.quiz                 enable row level security;
alter table public.quiz_option          enable row level security;
alter table public.answer               enable row level security;
alter table public.comment              enable row level security;
alter table public.weekly_score         enable row level security;
alter table public.family_chemistry     enable row level security;
alter table public.character_comment_cache enable row level security;
alter table public.public_post          enable row level security;
alter table public.public_upvote        enable row level security;
alter table public.public_comment       enable row level security;
alter table public.public_solve_attempt enable row level security;
alter table private.public_report       enable row level security;
alter table private.family_anonymization_map enable row level security;
alter table auditing.llm_usage          enable row level security;
```

### 9.2 정책 모음 (강화판)

```sql
-- =========================
-- app_user
-- 본인 + 같은 가족 멤버까지 표시 정보 노출 (display_name, avatar_url).
-- =========================
create policy "app_user_self_select" on public.app_user
  for select using (id = auth.uid());

create policy "app_user_family_select" on public.app_user
  for select using (
    exists (
      select 1
      from public.family_member me
      join public.family_member peer on peer.family_id = me.family_id
      where me.user_id = auth.uid()
        and peer.user_id = public.app_user.id
    )
  );

create policy "app_user_self_update" on public.app_user
  for update using (id = auth.uid());

-- =========================
-- family / family_member
-- =========================
create policy "family_member_select" on public.family
  for select using (public.is_family_member(id));

create policy "family_member_same_family_select" on public.family_member
  for select using (public.is_family_member(family_id));

create policy "family_member_self_update" on public.family_member
  for update using (user_id = auth.uid());

-- 가족/멤버 INSERT/DELETE는 RPC만 허용
revoke insert, update, delete on public.family from anon, authenticated;
revoke insert, delete on public.family_member from anon, authenticated;

-- =========================
-- quiz / quiz_option
-- 클라이언트는 quiz_option을 직접 select하지 않는다 (정답 라벨 노출 위험).
-- 안전 뷰 quiz_option_safe_v / quiz_option_revealed_v만 사용한다.
-- =========================
create policy "quiz_family_select" on public.quiz
  for select using (public.is_family_member(family_id));

revoke insert, update, delete on public.quiz from anon, authenticated;
revoke insert, update, delete on public.quiz_option from anon, authenticated;
revoke select on public.quiz_option from anon, authenticated;

-- 안전 뷰 select 권한
grant select on public.quiz_option_safe_v to anon, authenticated;
grant select on public.quiz_option_revealed_v to anon, authenticated;

-- security_invoker가 켜진 뷰는 base table의 RLS를 따른다.
-- quiz_option은 select가 revoke됐으므로 RLS만으로는 통과하지 못한다.
-- 따라서 뷰 자체에 자체 정책을 두지 말고, base에 별도 select 정책을 추가한다.
create policy "quiz_option_family_select_via_view" on public.quiz_option
  for select using (
    exists (select 1 from public.quiz q
             where q.id = quiz_option.quiz_id
               and public.is_family_member(q.family_id))
  );
-- 안전한 호출은 위 두 뷰를 거쳐야 하므로,
-- "kind를 직접 노출하지 않는 surface"는 뷰 컬럼 선택으로 강제된다.

-- =========================
-- answer
-- INSERT는 RPC submit_answer로만. SELECT는 본인 + revealed 후 가족.
-- =========================
revoke insert, update, delete on public.answer from anon, authenticated;

create policy "answer_self_select" on public.answer
  for select using (solver_user_id = auth.uid());

create policy "answer_family_select_after_reveal" on public.answer
  for select using (
    exists (select 1 from public.quiz q
             where q.id = answer.quiz_id
               and q.status = 'revealed'
               and public.is_family_member(q.family_id))
  );

-- =========================
-- comment
-- AI 코멘트 + 사용자 댓글. 둘 다 quiz가 revealed 상태일 때만 가족이 본다.
-- 사용자 INSERT는 RLS check + 5분 삭제 트리거.
-- =========================
create policy "comment_family_select_after_reveal" on public.comment
  for select using (
    exists (select 1 from public.quiz q
             where q.id = comment.quiz_id
               and q.status = 'revealed'
               and public.is_family_member(q.family_id))
  );

create policy "comment_self_insert_user" on public.comment
  for insert with check (
    kind = 'user'
    and author_user_id = auth.uid()
    and exists (select 1 from public.quiz q
                 where q.id = quiz_id
                   and q.status = 'revealed'
                   and public.is_family_member(q.family_id))
  );

create policy "comment_self_update" on public.comment
  for update using (author_user_id = auth.uid());

-- AI kind 직접 INSERT는 service_role만 (서버 사이드 LLM 호출 후 기록)
-- (별도 정책 없음 → revoke로 차단)

-- =========================
-- weekly_score / family_chemistry / character_comment_cache
-- =========================
create policy "weekly_score_family_select" on public.weekly_score
  for select using (public.is_family_member(family_id));

create policy "family_chemistry_family_select" on public.family_chemistry
  for select using (public.is_family_member(family_id));

create policy "character_comment_cache_family_select" on public.character_comment_cache
  for select using (public.is_family_member(family_id));

-- 점수/케미/캐릭터 직접 INSERT/UPDATE/DELETE 모두 차단 (트리거/서버만 변경)
revoke insert, update, delete on public.weekly_score from anon, authenticated;
revoke insert, update, delete on public.family_chemistry from anon, authenticated;
revoke insert, update, delete on public.character_comment_cache from anon, authenticated;

-- =========================
-- public_post
-- 클라이언트는 base table을 직접 SELECT 할 수 없다 (정답 인덱스/family_id 노출).
-- 안전 뷰 public_post_safe_v로만 노출한다.
-- 풀이는 RPC solve_public_post로만.
-- =========================
revoke insert, update, delete on public.public_post from anon, authenticated;
revoke select on public.public_post from anon, authenticated;
grant select on public.public_post_safe_v to anon, authenticated;

-- 본인 게시물 삭제(soft) RPC 제공 (별도 RPC 또는 update 정책)
-- 단순화: status='removed'로 set하는 RPC `remove_public_post` 도입을 권장(§13).

-- =========================
-- public_upvote / public_comment / public_solve_attempt
-- =========================
create policy "public_upvote_self_insert" on public.public_upvote
  for insert with check (voter_user_id = auth.uid());
create policy "public_upvote_self_delete" on public.public_upvote
  for delete using (voter_user_id = auth.uid());
create policy "public_upvote_self_select" on public.public_upvote
  for select using (voter_user_id = auth.uid());

-- 공개 댓글: 누구나 read, 로그인 사용자만 write
create policy "public_comment_select_anyone" on public.public_comment
  for select using (deleted_at is null);
create policy "public_comment_self_insert" on public.public_comment
  for insert with check (author_user_id = auth.uid());
create policy "public_comment_self_update" on public.public_comment
  for update using (author_user_id = auth.uid());

-- 풀이 시도: insert는 RPC로만 허용 (서버에서 정답 비교 + 기록)
revoke insert, update, delete on public.public_solve_attempt from anon, authenticated;

create policy "public_solve_attempt_self_select" on public.public_solve_attempt
  for select using (solver_user_id = auth.uid());

-- =========================
-- private / auditing 스키마
-- 모든 사용자 차단. service_role만 접근 가능.
-- =========================
create policy "deny_all_public_report" on private.public_report
  for all using (false) with check (false);
create policy "deny_all_anon_map" on private.family_anonymization_map
  for all using (false) with check (false);
create policy "deny_all_llm_usage" on auditing.llm_usage
  for all using (false) with check (false);
```

### 9.3 안전 잠금 (스키마 권한 + 함수 grant)

```sql
-- 스키마 USAGE 자체를 차단해 unknown table noise도 막는다
revoke all on schema private  from anon, authenticated;
revoke all on schema auditing from anon, authenticated;

-- 새로 생성될 모든 객체의 기본 권한도 차단
alter default privileges in schema private
  revoke all on tables    from anon, authenticated;
alter default privileges in schema private
  revoke all on functions from anon, authenticated;
alter default privileges in schema auditing
  revoke all on tables    from anon, authenticated;
alter default privileges in schema auditing
  revoke all on functions from anon, authenticated;

-- RPC EXECUTE grants
revoke all on function public.create_family(text)            from public;
revoke all on function public.join_family(char)              from public;
revoke all on function public.create_quiz(text,text,text,text,boolean,smallint,boolean) from public;
revoke all on function public.submit_answer(uuid,uuid,text)  from public;
revoke all on function public.reveal_quiz_now(uuid)          from public;
revoke all on function public.solve_public_post(uuid,smallint) from public;
revoke all on function public.auto_reveal_expired()          from public;

grant execute on function public.create_family(text)            to authenticated;
grant execute on function public.join_family(char)              to authenticated;
grant execute on function public.create_quiz(text,text,text,text,boolean,smallint,boolean) to authenticated;
grant execute on function public.submit_answer(uuid,uuid,text)  to authenticated;
grant execute on function public.reveal_quiz_now(uuid)          to authenticated;
grant execute on function public.solve_public_post(uuid,smallint) to authenticated;
-- auto_reveal_expired는 service_role 또는 cron만
grant execute on function public.auto_reveal_expired()          to service_role;

-- 헬퍼 함수는 stable이고 권한 없이도 안전하지만 search_path 보호는 항상.
```

> **요약**: anon/authenticated 클라이언트는 (a) RLS-필터된 SELECT가 정의된 일부 테이블, (b) 안전 뷰들, (c) `grant execute` 받은 RPC만 사용한다. 그 외 모든 경로는 차단된다.

---

## 10. 인덱스 / 성능 정리

| 테이블 | 인덱스 | 의도 |
|--------|--------|------|
| `family` | `family_code_idx (code)` | 가족 코드 단일 조회. |
| `family_member` | `(family_id)`, `(user_id)`, `unique (user_id)` | 멤버 목록, 1인 1가족. |
| `quiz` | `(family_id, status)`, `(family_id, day_label)`, partial `(reveal_at) where status='open'` | 홈/대시보드 + 자동 reveal 스캔. |
| `quiz_option` | `(quiz_id)` + unique `(quiz_id, position)` | 결과 화면. |
| `answer` | `(quiz_id)`, `(solver_user_id)`, unique `(quiz_id, solver_user_id)` | 풀이 진행률, 본인 답안. |
| `comment` | `(quiz_id)`, `(quiz_id, kind)`, partial unique `(quiz_id) where kind='ai'` | AI 1건 강제, 결과 화면 정렬. |
| `weekly_score` | `(family_id, week_start)`, unique `(family_id, user_id, week_start, category)` | 주간 캐러셀. |
| `family_chemistry` | `(family_id)`, unique `(family_id, author_user_id, solver_user_id)` | 케미 맵. |
| `public_post` | `(published_at desc)`, `(category, published_at desc) where status='open'`, `(upvote_count desc, published_at desc) where status='open'` | 게시판 정렬. |
| `public_upvote` | `(post_id)`, unique `(post_id, voter_user_id)` | 업보트 idempotent. |

---

## 11. 마이그레이션 순서

1. `create extension if not exists pgcrypto;` (§6.2 의존)
2. 스키마 생성: `create schema if not exists private; create schema if not exists auditing;`
3. ENUM 생성 (§3).
4. 헬퍼 함수 생성 (§6).
5. 테이블 생성 (`public` → `private` → `auditing`).
6. 트리거 함수 + 트리거 (§8).
7. 뷰 (§5) — base table보다 뒤에, RLS 켜기 전에.
8. RPC 함수 (§7).
9. **RLS 정책 (§9.2)** + **revoke / grant 잠금 (§9.3)**. 두 단계는 같은 트랜잭션에 묶는다.
10. (옵션) `pg_cron` — `auto_reveal_expired` 1분 간격, 캐릭터 코멘트 새벽 1회.
11. seed 데이터 없음(공개 게시판 추천을 위해 필요하면 별도 seed migration).

> Supabase에서는 `supabase/migrations/<timestamp>_init.sql` 한 파일로 작성하는 것을 권장한다. 위 순서를 그대로 한 파일 안에서 따른다. 한 파일 안에 작성하면 `supabase db reset`/`db push`도 결정적이다.

---

## 12. Supabase 환경 변수 (Vercel)

| 키 | 위치 | 용도 |
|----|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel Project (모든 환경) | 클라이언트 + 서버 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel Project | 클라이언트(브라우저) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel Project (Sensitive) | 서버 전용. RPC 외 LLM 호출 결과 기록, 신고 처리 등에서 사용 |
| `LLM_API_KEY` | Vercel Project (Sensitive) | LLM provider |
| `LLM_MODEL` | Vercel Project | 모델 식별자 |
| `APP_BASE_URL` | Vercel Project | OAuth redirect URL 구성 |
| `FAMILY_HASH_SALT` | Vercel Project (Sensitive) | `public_post.author_family_hash` 산출용 secret |

> Supabase Auth 콘솔에서 Google provider를 켜고 redirect URL을 `${APP_BASE_URL}/auth/callback`로 설정한다.

---

## 13. Open Questions (DM)

- OQ-DM1 ~~ ~~  **RESOLVED**: `quiz_option_safe_v`/`quiz_option_revealed_v` 뷰 + base SELECT revoke로 정답 컬럼 노출을 차단했다(§5.3, §5.4, §9.2). 클라이언트는 base table을 직접 SELECT하지 않는다.
- OQ-DM2: `family_member.unique (user_id)` 제약을 v1.1에 풀 때 마이그레이션 데이터 호환성. ADR-0002 참조.
- OQ-DM3 **PARTIAL**: `weekly_score` upsert는 ON CONFLICT 행 잠금으로 보호되며, `mark_quiz_revealed_if_needed`가 quiz 행에 FOR UPDATE를 잡아 reveal 자체가 직렬화된다. 동일 reveal에 대한 동시 trigger 호출 시나리오는 발생하지 않는다.
- OQ-DM4: `public_post`의 `options jsonb` vs 정규화 테이블(`public_post_option`) 분리. 본 문서는 jsonb 채택. full-text search/필터가 늘면 분리.
- OQ-DM5 **RESOLVED**: AI 코멘트는 SELECT 정책이 `quiz.status = 'revealed'`를 함께 검사하도록 강화돼(§9.2 `comment_family_select_after_reveal`) 가족 외 노출이 방지된다. 비용 모니터링 후 `comment.family_id` 비정규화는 v1.1 검토.
- OQ-DM6: `pg_cron` 사용 가능 여부. Supabase Free/Pro 플랜에 따라 다르며, 미지원 시 Vercel Cron이 `service_role`로 `auto_reveal_expired` RPC를 호출.
- OQ-DM7 (신규): 본인 공개 게시물 삭제 RPC `remove_public_post(post_id)`를 §7에 추가할 것(현재는 base UPDATE를 revoke했으므로 RPC 도입 전까지 사용자 삭제 불가). v1.0 출시 전 반드시 추가.
- OQ-DM8 (신규): AI 호출 비용 가드(B-11)를 DB 레벨로 강제할지(가족당 일일 LLM 호출 카운트 테이블 + 트리거). MVP는 애플리케이션 레벨로 충분, v1.1에서 DB 강제 검토.

---

## 14. 배포 / 운영 체크리스트 (Vercel + Supabase)

### Supabase 프로젝트 측
- [ ] 프로젝트 region을 KST 사용자에 가까운 곳(Singapore/Tokyo)으로 생성.
- [ ] Auth → Providers → **Google**만 활성화. Email/Password 비활성화.
- [ ] Auth → URL Configuration: Site URL = `${APP_BASE_URL}`, Redirect URLs에 `${APP_BASE_URL}/auth/callback` 등록(프리뷰 와일드카드 포함: `https://*.vercel.app/auth/callback`).
- [ ] SMTP 사용 안 함(MVP 이메일 발송 없음).
- [ ] DB → Extensions: `pgcrypto` 활성화. `pg_cron` 활성화 가능하면 켜기.
- [ ] Database → Backups: PITR 또는 일 단위 스냅샷 활성화.
- [ ] `supabase/migrations/<ts>_init.sql`을 §11 순서대로 작성 후 `supabase db push`.
- [ ] 마이그레이션 후 RLS가 모든 public 테이블에서 `enabled`인지 확인. (Settings → API → "Tables you have not enabled RLS for" 경고가 비어 있어야 함).
- [ ] `auditing.llm_usage`와 `private.*`가 sql 편집기에서 `select`로 보이지 않는지 anon 키 기준 수동 확인.

### Vercel 프로젝트 측
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 모든 환경(Development/Preview/Production)에 동일하게.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `LLM_API_KEY`, `FAMILY_HASH_SALT`는 **Sensitive**로 표시. Production만, Preview에는 별도 staging 키 사용 권장.
- [ ] `APP_BASE_URL`을 환경별로(`http://localhost:3000`, `https://<branch>.vercel.app`, `https://<domain>`) 분기.
- [ ] `LLM_MODEL` 기본값 잠금.
- [ ] OAuth Redirect URL은 Production 도메인 확정 후 Supabase에 추가.
- [ ] Vercel Cron(`vercel.json`)에 `auto_reveal_expired`를 호출하는 Route Handler 등록 (1분 간격). `pg_cron`을 사용한다면 생략.
- [ ] Vercel Region을 Supabase region과 동일하게 설정해 RTT 단축.

### 도메인 및 인증
- [ ] Production 도메인을 Vercel에 연결, Google OAuth 동의 화면 검수 신청.
- [ ] `robots.txt`로 게시판은 인덱싱 허용, 가족 안 화면은 차단.

---

## 15. Production Safety Review

본 절은 본 SoT가 정의된 시점(2026-05-10)의 보안·동시성·운영 리스크 인벤토리이다. 새 기능을 추가할 때마다 본 표를 함께 갱신한다.

### 15.1 발견 / 처치 매트릭스

| ID | 영역 | 발견 | 영향도 | 처치 | 위치 |
|----|------|------|--------|------|------|
| F-01 | Game integrity | `quiz_option.kind` 가족 멤버에게 평문 노출 → 풀이 무력화 | CRITICAL | base SELECT revoke + `quiz_option_safe_v`/`quiz_option_revealed_v` 뷰 도입 | §4.5, §5.3, §5.4, §9.2 |
| F-02 | Game integrity / Privacy | `public_post.false_option_index`/`family_id`/`source_quiz_id` 익명 SELECT 노출 → 정답 가림 무력화 + 가족 식별 가능 | CRITICAL | base SELECT revoke + `public_post_safe_v`로만 노출, 풀이는 `solve_public_post` RPC | §4.11, §5.5, §7.7, §9.2 |
| F-03 | Concurrency | `family_member` 정원 8명 검사가 count-then-insert race로 9 이상 가능 | HIGH | `join_family` RPC와 `family_member_capacity_check` 트리거 모두 `family` 행에 FOR UPDATE | §7.2, §8.2 |
| F-04 | Auth sync | `app_user.email` 등이 구글에서 변경돼도 동기화 안 됨 | MEDIUM | `auth.users` UPDATE 트리거에 동일 함수 연결 + email까지 갱신 | §8.1 |
| F-05 | Authorization | 가족 멤버가 서로의 `app_user` 프로필을 못 봄 (RLS가 self만 허용) | MEDIUM | `app_user_family_select` 정책 추가 + `family_member_profile_v` 뷰 | §5.6, §9.2 |
| F-06 | Authorization | `comment_family_select`에 `revealed` 조건 누락 → AI 코멘트 사전 생성 시 노출 가능 | MEDIUM | 정책에 `q.status='revealed'` 조건 추가 | §9.2 |
| F-07 | Anti-abuse | 사용자가 reaction/question 댓글로 점수 가산 후 5분 내 삭제 시 점수 비차감 | MEDIUM | `weekly_score_on_comment_soft_delete` 트리거 추가 | §8.9 |
| F-08 | Crypto | `gen_family_code`가 `random()` 의사난수 사용 | MEDIUM | `pgcrypto.gen_random_bytes`로 교체 + reroll로 모듈로 편향 회피 | §6.2 |
| F-09 | Operability | `updated_at`이 컬럼만 있고 자동 갱신 트리거 없음 → 애플리케이션 의존 | LOW | `set_updated_at` 공용 트리거 도입 | §8.8 |
| F-10 | Counter integrity | 카운터 비정규화에서 음수 도달 가능 | LOW | `greatest(x-1, 0)` 가드 + comment soft-delete 갱신 | §8.6 |
| F-11 | API surface | RPC EXECUTE 권한이 `public` (역할)에 열려 있음 | MEDIUM | 모든 RPC `revoke from public` 후 `grant to authenticated`로 명시 | §9.3 |
| F-12 | Schema isolation | 신규 객체가 만들어지면 anon에 자동 접근 가능할 수 있음 | LOW | `alter default privileges`로 기본 거부 | §9.3 |

### 15.2 잔여(Accepted) 리스크

| ID | 리스크 | 사유 | 보완 |
|----|--------|------|------|
| AR-01 | LLM 호출 한도(B-11)가 애플리케이션 레벨에서만 강제 | MVP 단순화. DB 강제는 v1.1. | `auditing.llm_usage`로 매 호출 비용 기록 + 알림 임계치(예: 가족당 일 100원) 외부 모니터로. |
| AR-02 | 가족 코드 brute-force | 32^6 ≈ 10억 조합 + 인증 필요 + rate limit | F2 OQ-F1과 함께 가족 코드 만료 정책을 v1.1 검토. |
| AR-03 | 게시판 신고 처리가 수동 | 모더레이션 v1.1 | 임계치 도달 시 자동 비공개 트리거를 v1.1에 도입. |
| AR-04 | 가족 owner 탈퇴 미정의 | 1인 1가족 + owner 권한 없음(MVP)이라 폐쇄 동선이 모호 | 가족 마지막 멤버 탈퇴 시 가족 자동 archive하는 RPC를 v1.1. |
| AR-05 | 1인 1가족 제약 풀이 시 마이그레이션 | ADR-0002에서 다룸 | v1.1 진입 시 `family_member.user_id` unique 제거 + 모든 `select fm.family_id ... where user_id = uid` 패턴을 active family 컨텍스트로 교체. |

### 15.3 검증 방법

- **자동 RLS 회귀 테스트**: 로컬 `supabase test db` 또는 `pgTAP`로 다음을 검증.
  - anon 키로 base `quiz_option`/`public_post` SELECT가 0행 또는 권한 오류여야 한다.
  - 다른 가족 사용자 JWT로 가족 자원 SELECT가 0행이어야 한다.
  - 출제자 JWT로 `submit_answer` RPC 호출 시 `AUTHOR_CANNOT_ANSWER` 에러.
  - 이미 가족에 속한 사용자가 `join_family` 호출 시 `ALREADY_IN_FAMILY` 에러.
- **수동 verification**: `select * from auditing.llm_usage` / `select * from private.public_report` 가 anon에서 권한 오류여야 한다.
- **동시성**: `psql` 두 세션에서 같은 가족 코드로 `select join_family(...)`를 10명이 동시에 호출 → 8명만 성공, 9~10번째는 `FAMILY_FULL`.
- **카운터 일관성**: upvote 토글 100회 후 `upvote_count`와 실제 행 수 일치.
- **시간대**: KST 23:59:59 등록 + 00:00:01 commit 케이스에서 dayLabel·백로그 동작 확인.

### 15.4 주의: secret 관리

- `SUPABASE_SERVICE_ROLE_KEY`는 절대 클라이언트 번들에 노출 금지. `NEXT_PUBLIC_*` 접두사 금지.
- `FAMILY_HASH_SALT`가 유출되면 가족 식별 해시가 무력화된다. salt는 1회 정해 두고 변경 시 모든 `author_family_hash` 재계산이 필요(서비스 가동 중에는 변경 금지).
- `LLM_API_KEY`는 LLM 호출이 일어나는 Route Handler / Edge Function에서만 import.
- `.env.local`은 git ignore. `.env.example`은 키 이름만 기록.

---

## 16. ER 요약

```text
auth.users 1───1 app_user
                  │
                  │ N (family_member)
                  ▼
                family ◄── created_by
                  │ 1
                  ├─N family_member ──N─ app_user
                  │
                  ├─N quiz (author = app_user)
                  │     │
                  │     ├─N quiz_option (true 2 + false 1)
                  │     ├─N answer (solver = app_user, FK chosen_option)
                  │     ├─N comment (kind=user|ai)
                  │     └─0..1 public_post
                  │                 ├─N public_upvote
                  │                 ├─N public_comment
                  │                 └─N public_solve_attempt
                  │
                  ├─N weekly_score (per user/category/week)
                  ├─N family_chemistry (author×solver)
                  └─N character_comment_cache (per user/day)
```
