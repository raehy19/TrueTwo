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

---

### 4.12 `public_upvote`

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

```sql
create or replace function public.gen_family_code()
returns char(6) language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- I, O, 0, 1 제외
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + (random() * (length(alphabet) - 1))::int, 1);
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

  select * into v_family from public.family where code = p_code;
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

### 7.7 `auto_reveal_expired()` — Cron(매분)

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

### 8.1 `handle_new_auth_user`

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
    set display_name = excluded.display_name,
        avatar_url   = excluded.avatar_url,
        updated_at   = now();
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();
```

### 8.2 `family_member_capacity_check` — 가족 정원 8명

```sql
create or replace function public.family_member_capacity_check()
returns trigger language plpgsql as $$
declare v_count int;
begin
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
    update public.public_post set upvote_count = upvote_count - 1 where id = old.post_id;
  end if;
  return null;
end $$;
create trigger public_post_upvote_counter_trg
after insert or delete on public.public_upvote
for each row execute procedure public.public_post_upvote_counter();

-- comment / solve_attempt도 동일 패턴 (생략 가능, 같은 모양으로 작성)
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

### 9.2 정책 모음

```sql
-- app_user: 본인만 조회/갱신 (가족 멤버는 family_member join을 통해 닉네임 등 노출)
create policy "app_user_self_select" on public.app_user
  for select using (id = auth.uid());

create policy "app_user_self_update" on public.app_user
  for update using (id = auth.uid());

-- family: 멤버만 조회. 생성은 RPC create_family 사용.
create policy "family_member_select" on public.family
  for select using (public.is_family_member(id));

-- family_member: 같은 가족 멤버끼리 서로 보기
create policy "family_member_same_family_select" on public.family_member
  for select using (public.is_family_member(family_id));

-- 닉네임 변경 (본인 행만)
create policy "family_member_self_update" on public.family_member
  for update using (user_id = auth.uid());

-- quiz: 같은 가족 멤버만
create policy "quiz_family_select" on public.quiz
  for select using (public.is_family_member(family_id));

-- quiz_option: 진짜/가짜 라벨이 노출되면 풀이가 망가짐. 결과 공개 후에만 kind 보임.
-- 단순 정책: open인 동안 kind/source_llm/edited 마스킹은 application 단에서 처리.
-- DB 차원에서는 select 자체는 가족 멤버에게 허용한다(텍스트 + position).
create policy "quiz_option_family_select" on public.quiz_option
  for select using (
    exists (select 1 from public.quiz q
             where q.id = quiz_option.quiz_id
               and public.is_family_member(q.family_id))
  );

-- 클라이언트가 quiz open 상태에서 kind를 알지 못해야 함.
-- → 클라이언트는 항상 view `quiz_option_safe_v`를 사용하고, 원본 select는 막는 안도 가능.
-- 본 문서는 application 책임으로 잠그는 단순 모델을 채택한다(OQ-DM1 참조).

-- answer: 본인 답안만 select. 가족 멤버는 reveal 후에만 다른 사람 답안 가능.
create policy "answer_self_select" on public.answer
  for select using (solver_user_id = auth.uid());

create policy "answer_family_select_after_reveal" on public.answer
  for select using (
    exists (select 1 from public.quiz q
             where q.id = answer.quiz_id
               and q.status = 'revealed'
               and public.is_family_member(q.family_id))
  );

-- INSERT는 RPC submit_answer 통해서만 — 클라이언트 직접 INSERT 차단
revoke insert on public.answer from anon, authenticated;

-- comment: 가족 멤버 select / insert. 본인 행만 update(삭제 트리거가 5분 룰 강제).
create policy "comment_family_select" on public.comment
  for select using (
    exists (select 1 from public.quiz q
             where q.id = comment.quiz_id
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

-- weekly_score / family_chemistry / character_comment_cache: 같은 가족만 조회
create policy "weekly_score_family_select" on public.weekly_score
  for select using (public.is_family_member(family_id));

create policy "family_chemistry_family_select" on public.family_chemistry
  for select using (public.is_family_member(family_id));

create policy "character_comment_cache_family_select" on public.character_comment_cache
  for select using (public.is_family_member(family_id));

-- public_post: 누구나 select 가능, status = 'open' 만
create policy "public_post_open_select" on public.public_post
  for select using (status = 'open');

-- public_upvote / public_comment / public_solve_attempt: 로그인 필수
create policy "public_upvote_self_insert" on public.public_upvote
  for insert with check (voter_user_id = auth.uid());
create policy "public_upvote_self_delete" on public.public_upvote
  for delete using (voter_user_id = auth.uid());
create policy "public_upvote_self_select" on public.public_upvote
  for select using (voter_user_id = auth.uid());

create policy "public_comment_select_anyone" on public.public_comment
  for select using (deleted_at is null);
create policy "public_comment_self_insert" on public.public_comment
  for insert with check (author_user_id = auth.uid());

create policy "public_solve_attempt_self_insert" on public.public_solve_attempt
  for insert with check (solver_user_id = auth.uid());
create policy "public_solve_attempt_self_select" on public.public_solve_attempt
  for select using (solver_user_id = auth.uid());

-- private 스키마: 모두 차단(서버 service_role만 사용)
create policy "deny_all" on private.public_report for all using (false);
create policy "deny_all_anon_map" on private.family_anonymization_map for all using (false);

-- auditing: 사용자 조회 차단
create policy "deny_all_llm_usage" on auditing.llm_usage for all using (false);
```

### 9.3 안전 잠금
- `revoke all on schema private from anon, authenticated;`
- `revoke all on schema auditing from anon, authenticated;`
- `revoke insert, update, delete on public.quiz from anon, authenticated;` (RPC create_quiz/reveal_quiz_now만 허용)
- `revoke insert, update, delete on public.quiz_option from anon, authenticated;` (RPC create_quiz로만 작성)

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

1. ENUM 생성 (§3).
2. 헬퍼 함수 생성 (§6).
3. 테이블 생성 (`public` → `private` → `auditing`).
4. 트리거 함수 + 트리거 (§8).
5. 뷰 (§5).
6. RPC 함수 (§7).
7. RLS enable + 정책 (§9).
8. revoke 잠금 (§9.3).
9. (옵션) `pg_cron` 설정 — `auto_reveal_expired` 1분 간격, 캐릭터 코멘트 새벽 1회.

> Supabase에서는 `supabase/migrations/` 디렉토리에 단일 SQL 파일로 작성하는 것을 권장한다. 위 순서를 그대로 한 파일 안에서 따른다.

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

- OQ-DM1: `quiz_option`에서 open 상태 동안 `kind`/`source_llm`/`edited` 컬럼을 클라이언트가 보지 못하게 만들 것인지(별도 view + revoke select on column 또는 RLS column-level masking — Postgres RLS는 행 단위만 지원, 컬럼 마스킹은 view로 구현). 본 문서 채택안: `quiz_option_safe_v` 뷰를 만들어 클라이언트는 그것만 select. 위 §4.5는 단순 모델, 실제 보안은 view에서 강제.
- OQ-DM2: `family_member.unique (user_id)` 제약을 v1.1에 풀 때 마이그레이션 데이터 호환성.
- OQ-DM3: `weekly_score`의 `numerator/denominator` 누적 방식이 동시 reveal에서 race가 일어날 수 있음. 트리거 안에서 `for update`를 명시할지 검토.
- OQ-DM4: `public_post`의 `options jsonb` vs 정규화 테이블(`public_post_option`) 분리. 본 문서는 jsonb를 채택해 게시판 read 비용을 줄였지만, full-text search/필터가 늘면 분리.
- OQ-DM5: AI 코멘트(`comment kind='ai'`)는 user_id가 null인데 RLS 정책에서 노출 권한이 가족 멤버 전용임을 확실히 보장하려면 `quiz` join이 필요. 정책 §9.2에 반영됨 — 성능 영향이 크면 `comment.family_id` 비정규화 컬럼 추가 검토.
- OQ-DM6: `pg_cron` 사용 가능 여부. Supabase Free/Pro 플랜에 따라 다르며, 미지원 시 Vercel Cron 또는 외부 워커가 `auto_reveal_expired` RPC를 호출하도록 변경.

---

## 14. ER 요약

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
