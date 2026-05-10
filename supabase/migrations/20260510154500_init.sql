-- =====================================================================
-- 진진거 (JinJinGuh) — initial schema migration
-- Source of truth: docs/architecture/data-model.md (read alongside this file)
-- Order follows data-model.md §11. Hardening (§9.2 / §9.3 / §15) is applied
-- in the same transaction so the schema is never partially exposed.
-- =====================================================================

set check_function_bodies = off;

-- =====================================================================
-- 1. Extensions and schemas
-- =====================================================================
create extension if not exists pgcrypto;

create schema if not exists private;
create schema if not exists auditing;

-- =====================================================================
-- 2. ENUM types
-- =====================================================================
do $$ begin
  create type public.family_role_enum             as enum ('owner', 'member');
  create type public.option_kind_enum             as enum ('true', 'false');
  create type public.quiz_status_enum             as enum ('open', 'revealed');
  create type public.comment_kind_enum            as enum ('user', 'ai');
  create type public.comment_category_enum        as enum ('reaction', 'question', 'other');
  create type public.comment_category_source_enum as enum ('heuristic', 'llm');
  create type public.public_category_enum         as enum ('legend', 'plausible', 'familylike', 'funny_wrong', 'warm');
  create type public.public_post_status_enum      as enum ('open', 'removed');
  create type public.llm_usage_kind_enum          as enum ('generate', 'reroll', 'comment', 'anonymize', 'character_comment');
  create type public.report_reason_enum           as enum ('inappropriate', 'identifying', 'spam', 'other');
  create type public.score_category_enum          as enum ('detective', 'lie_designer', 'pure_hearted', 'reaction_star', 'question_master');
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 3. Helper functions (timezone, code generation, current user, family check)
-- =====================================================================
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
  select (d - ((extract(isodow from d)::int - 1)) * interval '1 day')::date
$$;

create or replace function public.gen_family_code()
returns char(6)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars, no I/O/0/1
  result text := '';
  byte int;
  i int;
begin
  for i in 1..6 loop
    loop
      byte := get_byte(gen_random_bytes(1), 0);
      exit when byte < 256; -- always true; placeholder for future bias rejection
    end loop;
    result := result || substr(alphabet, 1 + (byte % 32), 1);
  end loop;
  return result;
end $$;

create or replace function public.current_app_user_id()
returns uuid language sql stable as $$
  select auth.uid()
$$;

create or replace function public.is_family_member(p_family_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.family_member
    where family_id = p_family_id
      and user_id = auth.uid()
  );
$$;

-- =====================================================================
-- 4. Tables (public)
-- =====================================================================

-- 4.1 app_user — bridges to auth.users
create table public.app_user (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index app_user_email_idx on public.app_user(email);

-- 4.2 family
create table public.family (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 20),
  code                char(6) not null unique
                      check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at          timestamptz not null default now(),
  created_by_user_id  uuid not null references public.app_user(id) on delete restrict
);
create index family_code_idx on public.family(code);

-- 4.3 family_member
create table public.family_member (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.family(id) on delete cascade,
  user_id     uuid not null references public.app_user(id) on delete cascade,
  role        public.family_role_enum not null default 'member',
  nickname    text check (nickname is null or char_length(nickname) between 1 and 12),
  joined_at   timestamptz not null default now(),

  constraint family_member_unique_per_family    unique (family_id, user_id),
  constraint family_member_one_family_per_user  unique (user_id)
);
create index family_member_family_id_idx on public.family_member(family_id);
create index family_member_user_id_idx   on public.family_member(user_id);

-- 4.4 quiz
create table public.quiz (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.family(id) on delete cascade,
  author_user_id  uuid not null references public.app_user(id) on delete restrict,
  day_label       date not null,
  is_backlog      boolean not null default false,
  difficulty      smallint not null check (difficulty between 1 and 4),
  status          public.quiz_status_enum not null default 'open',
  created_at      timestamptz not null default now(),
  publish_at      timestamptz not null default now(),
  reveal_at       timestamptz not null,
  revealed_at     timestamptz,

  constraint quiz_one_per_user_per_day unique (family_id, author_user_id, day_label)
);
create index quiz_family_status_idx        on public.quiz(family_id, status);
create index quiz_family_day_label_idx     on public.quiz(family_id, day_label);
create index quiz_open_reveal_at_idx       on public.quiz(reveal_at) where status = 'open';

-- 4.5 quiz_option
create table public.quiz_option (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quiz(id) on delete cascade,
  kind          public.option_kind_enum not null,
  text          text not null check (char_length(text) between 5 and 200),
  source_llm    text,
  edited        boolean not null default false,
  position      smallint not null check (position between 1 and 3),
  created_at    timestamptz not null default now(),

  constraint quiz_option_position_unique unique (quiz_id, position)
);
create index quiz_option_quiz_id_idx on public.quiz_option(quiz_id);

-- 4.6 answer
create table public.answer (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid not null references public.quiz(id) on delete cascade,
  solver_user_id      uuid not null references public.app_user(id) on delete cascade,
  chosen_option_id    uuid not null references public.quiz_option(id) on delete cascade,
  reason_text         text check (reason_text is null or char_length(reason_text) between 1 and 80),
  is_correct          boolean not null,
  created_at          timestamptz not null default now(),

  constraint answer_one_per_user_per_quiz unique (quiz_id, solver_user_id)
);
create index answer_quiz_id_idx        on public.answer(quiz_id);
create index answer_solver_user_id_idx on public.answer(solver_user_id);

-- 4.7 comment
create table public.comment (
  id                uuid primary key default gen_random_uuid(),
  quiz_id           uuid not null references public.quiz(id) on delete cascade,
  author_user_id    uuid references public.app_user(id) on delete set null,
  kind              public.comment_kind_enum not null,
  category          public.comment_category_enum,
  category_source   public.comment_category_source_enum,
  text              text not null check (char_length(text) between 1 and 200),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint comment_ai_no_author check (
    (kind = 'ai' and author_user_id is null) or (kind = 'user' and author_user_id is not null)
  )
);
create index comment_quiz_id_idx   on public.comment(quiz_id);
create index comment_quiz_kind_idx on public.comment(quiz_id, kind);
create unique index comment_ai_unique_per_quiz on public.comment(quiz_id) where kind = 'ai';

-- 4.8 weekly_score
create table public.weekly_score (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.family(id) on delete cascade,
  user_id     uuid not null references public.app_user(id) on delete cascade,
  week_start  date not null,
  category    public.score_category_enum not null,
  numerator   numeric not null default 0,
  denominator numeric not null default 0,
  count       integer not null default 0,
  updated_at  timestamptz not null default now(),

  constraint weekly_score_unique unique (family_id, user_id, week_start, category)
);
create index weekly_score_family_week_idx on public.weekly_score(family_id, week_start);

-- 4.9 family_chemistry
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

-- 4.10 character_comment_cache
create table public.character_comment_cache (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.family(id) on delete cascade,
  user_id     uuid not null references public.app_user(id) on delete cascade,
  day_label   date not null,
  text        text not null check (char_length(text) between 10 and 200),
  created_at  timestamptz not null default now(),

  constraint character_comment_cache_unique unique (family_id, user_id, day_label)
);
create index character_comment_cache_family_day_idx
  on public.character_comment_cache(family_id, day_label);

-- 4.11 public_post
create table public.public_post (
  id                    uuid primary key default gen_random_uuid(),
  source_quiz_id        uuid not null unique references public.quiz(id) on delete cascade,
  family_id             uuid not null references public.family(id) on delete cascade,
  author_family_hash    text not null,
  category              public.public_category_enum not null,
  status                public.public_post_status_enum not null default 'open',
  options               jsonb not null,
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

-- 4.12 public_upvote
create table public.public_upvote (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.public_post(id) on delete cascade,
  voter_user_id uuid not null references public.app_user(id) on delete cascade,
  created_at    timestamptz not null default now(),

  constraint public_upvote_unique unique (post_id, voter_user_id)
);
create index public_upvote_post_idx on public.public_upvote(post_id);

-- 4.13 public_comment
create table public.public_comment (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.public_post(id) on delete cascade,
  author_user_id  uuid not null references public.app_user(id) on delete cascade,
  text            text not null check (char_length(text) between 1 and 200),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index public_comment_post_idx on public.public_comment(post_id, created_at);

-- 4.14 public_solve_attempt
create table public.public_solve_attempt (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.public_post(id) on delete cascade,
  solver_user_id  uuid not null references public.app_user(id) on delete cascade,
  chosen_index    smallint not null check (chosen_index between 0 and 2),
  is_correct      boolean not null,
  created_at      timestamptz not null default now(),

  constraint public_solve_attempt_unique unique (post_id, solver_user_id)
);
create index public_solve_attempt_post_idx on public.public_solve_attempt(post_id);

-- =====================================================================
-- 4. Tables (private + auditing)
-- =====================================================================
create table private.public_report (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.public_post(id) on delete cascade,
  reporter_user_id  uuid references public.app_user(id) on delete set null,
  reason            public.report_reason_enum not null,
  text              text check (text is null or char_length(text) <= 500),
  created_at        timestamptz not null default now()
);
create index public_report_post_idx on private.public_report(post_id);

create table private.family_anonymization_map (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.family(id) on delete cascade,
  source      text not null,
  target_role text not null,
  created_at  timestamptz not null default now(),

  constraint family_anonymization_map_unique unique (family_id, source)
);

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
create index llm_usage_family_day_idx on auditing.llm_usage(family_id, created_at);

-- =====================================================================
-- 5. Triggers
-- =====================================================================

-- 5.1 handle_new_auth_user (insert + update on auth.users)
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.app_user(id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email        = excluded.email,
        display_name = excluded.display_name,
        avatar_url   = excluded.avatar_url,
        updated_at   = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update on auth.users
for each row execute procedure public.handle_new_auth_user();

-- 5.2 family_member_capacity_check (with FOR UPDATE on family row)
create or replace function public.family_member_capacity_check()
returns trigger language plpgsql as $$
declare v_count int;
begin
  perform 1 from public.family where id = new.family_id for update;
  select count(*) into v_count from public.family_member where family_id = new.family_id;
  if v_count >= 8 then raise exception 'FAMILY_FULL'; end if;
  return new;
end $$;

create trigger family_member_capacity_check_trg
before insert on public.family_member
for each row execute procedure public.family_member_capacity_check();

-- 5.3 quiz_option_after_change_check (deferred, true=2 + false=1)
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

  if v_true_count <> 2 or v_false_count <> 1 then
    raise exception 'QUIZ_OPTIONS_INVARIANT_VIOLATED';
  end if;
  return null;
end $$;

create constraint trigger quiz_option_invariant
after insert or update or delete on public.quiz_option
deferrable initially deferred
for each row execute procedure public.quiz_option_after_change_check();

-- 5.4 weekly_score_on_reveal
create or replace function public.weekly_score_on_reveal()
returns trigger language plpgsql as $$
declare
  v_week date := public.kst_week_start( (new.revealed_at at time zone 'Asia/Seoul')::date );
  v_correct int;
  v_solvers int;
  v_fool_rate numeric;
begin
  if new.status <> 'revealed' or old.status = 'revealed' then return new; end if;

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

-- 5.5 weekly_score_on_user_comment (reaction/question count)
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

-- 5.6 public_post counters
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

create or replace function public.public_post_comment_counter()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.public_post set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.public_post set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
    end if;
  end if;
  return null;
end $$;
create trigger public_post_comment_counter_trg
after insert or update on public.public_comment
for each row execute procedure public.public_post_comment_counter();

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

-- 5.7 comment_user_delete_window (5-min self-delete)
create or replace function public.comment_user_delete_window()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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

-- 5.8 set_updated_at — generic
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

-- 5.9 weekly_score_on_comment_soft_delete — decrement reaction/question
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

-- =====================================================================
-- 6. Views (security_invoker so RLS is honored)
-- =====================================================================

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
alter view public.quiz_with_stats set (security_invoker = true);

create or replace view public.weekly_ranking_v as
select
  ws.family_id,
  ws.week_start,
  ws.category,
  ws.user_id,
  case ws.category
    when 'detective'        then case when ws.denominator >= 3 then ws.numerator / ws.denominator else null end
    when 'pure_hearted'     then case when ws.denominator >= 3 then 1.0 - (ws.numerator / ws.denominator) else null end
    when 'lie_designer'     then case when ws.denominator >= 2 then ws.numerator / ws.denominator else null end
    when 'reaction_star'    then ws.count
    when 'question_master'  then ws.count
  end as score
from public.weekly_score ws;
alter view public.weekly_ranking_v set (security_invoker = true);

create or replace view public.quiz_option_safe_v as
select id, quiz_id, position, text, created_at
from public.quiz_option;
alter view public.quiz_option_safe_v set (security_invoker = true);

create or replace view public.quiz_option_revealed_v as
select o.id, o.quiz_id, o.position, o.text, o.kind, o.source_llm, o.edited, o.created_at
from public.quiz_option o
join public.quiz q on q.id = o.quiz_id
where q.status = 'revealed';
alter view public.quiz_option_revealed_v set (security_invoker = true);

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
  case when solve_attempt_count > 0
       then (solve_correct_count::numeric / solve_attempt_count)
       else null end as solve_accuracy,
  published_at,
  removed_at
from public.public_post
where status = 'open';
alter view public.public_post_safe_v set (security_invoker = true);

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

-- =====================================================================
-- 7. RPC functions
-- =====================================================================

create or replace function public.create_family(p_name text)
returns public.family
language plpgsql security definer set search_path = public, pg_temp
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

create or replace function public.join_family(p_code char(6))
returns public.family
language plpgsql security definer set search_path = public, pg_temp
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

  select * into v_family from public.family where code = p_code for update;
  if v_family.id is null then raise exception 'FAMILY_NOT_FOUND'; end if;

  select count(*) into v_member_count from public.family_member where family_id = v_family.id;
  if v_member_count >= 8 then raise exception 'FAMILY_FULL'; end if;

  insert into public.family_member(family_id, user_id, role)
  values (v_family.id, v_user_id, 'member');

  return v_family;
end $$;

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
language plpgsql security definer set search_path = public, pg_temp
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

  if p_is_backlog then
    v_day_label := public.kst_yesterday();
    if exists (
      select 1 from public.quiz
      where family_id = v_family_id
        and author_user_id = v_user_id
        and day_label = v_day_label
    ) then raise exception 'BACKLOG_ALREADY_EXISTS'; end if;
  else
    v_day_label := public.kst_today();
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

  insert into public.quiz_option(quiz_id, kind, text, position, source_llm, edited)
  values
    (v_quiz.id, 'true',  p_true_1, 1, null, false),
    (v_quiz.id, 'true',  p_true_2, 2, null, false),
    (v_quiz.id, 'false', p_false,  3, p_false_source_llm, coalesce(p_false_edited, false));

  return v_quiz;
end $$;

create or replace function public.mark_quiz_revealed_if_needed(p_quiz_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
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

create or replace function public.submit_answer(
  p_quiz_id uuid,
  p_chosen_option_id uuid,
  p_reason_text text
)
returns public.answer
language plpgsql security definer set search_path = public, pg_temp
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

  perform public.mark_quiz_revealed_if_needed(p_quiz_id);

  return v_answer;
end $$;

create or replace function public.reveal_quiz_now(p_quiz_id uuid)
returns public.quiz
language plpgsql security definer set search_path = public, pg_temp
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

create or replace function public.solve_public_post(
  p_post_id uuid,
  p_chosen_index smallint
)
returns table(is_correct boolean, false_option_index smallint)
language plpgsql security definer set search_path = public, pg_temp
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

  insert into public.public_solve_attempt(post_id, solver_user_id, chosen_index, is_correct)
  values (p_post_id, v_user_id, p_chosen_index, v_correct)
  on conflict (post_id, solver_user_id) do nothing;

  return query select v_correct, v_post.false_option_index;
end $$;

create or replace function public.auto_reveal_expired()
returns int
language plpgsql security definer set search_path = public, pg_temp
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

-- =====================================================================
-- 8. Enable RLS
-- =====================================================================
alter table public.app_user                 enable row level security;
alter table public.family                   enable row level security;
alter table public.family_member            enable row level security;
alter table public.quiz                     enable row level security;
alter table public.quiz_option              enable row level security;
alter table public.answer                   enable row level security;
alter table public.comment                  enable row level security;
alter table public.weekly_score             enable row level security;
alter table public.family_chemistry         enable row level security;
alter table public.character_comment_cache  enable row level security;
alter table public.public_post              enable row level security;
alter table public.public_upvote            enable row level security;
alter table public.public_comment           enable row level security;
alter table public.public_solve_attempt     enable row level security;
alter table private.public_report           enable row level security;
alter table private.family_anonymization_map enable row level security;
alter table auditing.llm_usage              enable row level security;

-- =====================================================================
-- 9. Policies
-- =====================================================================

-- app_user
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

-- family / family_member
create policy "family_member_select" on public.family
  for select using (public.is_family_member(id));

create policy "family_member_same_family_select" on public.family_member
  for select using (public.is_family_member(family_id));

create policy "family_member_self_update" on public.family_member
  for update using (user_id = auth.uid());

-- quiz
create policy "quiz_family_select" on public.quiz
  for select using (public.is_family_member(family_id));

-- quiz_option base SELECT policy (kept so views can read via security_invoker)
create policy "quiz_option_family_select_via_view" on public.quiz_option
  for select using (
    exists (select 1 from public.quiz q
             where q.id = quiz_option.quiz_id
               and public.is_family_member(q.family_id))
  );

-- answer
create policy "answer_self_select" on public.answer
  for select using (solver_user_id = auth.uid());

create policy "answer_family_select_after_reveal" on public.answer
  for select using (
    exists (select 1 from public.quiz q
             where q.id = answer.quiz_id
               and q.status = 'revealed'
               and public.is_family_member(q.family_id))
  );

-- comment
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

-- weekly_score / family_chemistry / character_comment_cache
create policy "weekly_score_family_select" on public.weekly_score
  for select using (public.is_family_member(family_id));

create policy "family_chemistry_family_select" on public.family_chemistry
  for select using (public.is_family_member(family_id));

create policy "character_comment_cache_family_select" on public.character_comment_cache
  for select using (public.is_family_member(family_id));

-- public_post: base SELECT revoked below; safe view exposes the rest
-- (no SELECT policy on public.public_post for anon/authenticated)

-- public_upvote
create policy "public_upvote_self_insert" on public.public_upvote
  for insert with check (voter_user_id = auth.uid());
create policy "public_upvote_self_delete" on public.public_upvote
  for delete using (voter_user_id = auth.uid());
create policy "public_upvote_self_select" on public.public_upvote
  for select using (voter_user_id = auth.uid());

-- public_comment: anyone (including anon) can read; only logged-in can write
create policy "public_comment_select_anyone" on public.public_comment
  for select using (deleted_at is null);
create policy "public_comment_self_insert" on public.public_comment
  for insert with check (author_user_id = auth.uid());
create policy "public_comment_self_update" on public.public_comment
  for update using (author_user_id = auth.uid());

-- public_solve_attempt: insert is via RPC only
create policy "public_solve_attempt_self_select" on public.public_solve_attempt
  for select using (solver_user_id = auth.uid());

-- private + auditing: deny all
create policy "deny_all_public_report" on private.public_report
  for all using (false) with check (false);
create policy "deny_all_anon_map" on private.family_anonymization_map
  for all using (false) with check (false);
create policy "deny_all_llm_usage" on auditing.llm_usage
  for all using (false) with check (false);

-- =====================================================================
-- 10. Lockdown — schema usage and table grants
-- =====================================================================
revoke all on schema private  from anon, authenticated;
revoke all on schema auditing from anon, authenticated;

alter default privileges in schema private
  revoke all on tables    from anon, authenticated;
alter default privileges in schema private
  revoke all on functions from anon, authenticated;
alter default privileges in schema auditing
  revoke all on tables    from anon, authenticated;
alter default privileges in schema auditing
  revoke all on functions from anon, authenticated;

-- public table writes through RPC only
revoke insert, update, delete on public.family               from anon, authenticated;
revoke insert,         delete on public.family_member        from anon, authenticated;
revoke insert, update, delete on public.quiz                 from anon, authenticated;
revoke insert, update, delete on public.quiz_option          from anon, authenticated;
revoke insert, update, delete on public.answer               from anon, authenticated;
revoke insert, update, delete on public.weekly_score         from anon, authenticated;
revoke insert, update, delete on public.family_chemistry     from anon, authenticated;
revoke insert, update, delete on public.character_comment_cache from anon, authenticated;
revoke insert, update, delete on public.public_post          from anon, authenticated;
revoke insert, update, delete on public.public_solve_attempt from anon, authenticated;

-- quiz_option SELECT also revoked — clients use the safe views
revoke select on public.quiz_option  from anon, authenticated;
revoke select on public.public_post  from anon, authenticated;

-- expose safe views
grant select on public.quiz_option_safe_v       to anon, authenticated;
grant select on public.quiz_option_revealed_v   to anon, authenticated;
grant select on public.public_post_safe_v       to anon, authenticated;
grant select on public.family_member_profile_v  to anon, authenticated;
grant select on public.weekly_ranking_v         to anon, authenticated;
grant select on public.quiz_with_stats          to anon, authenticated;

-- RPC EXECUTE grants
revoke all on function public.create_family(text)            from public;
revoke all on function public.join_family(char)              from public;
revoke all on function public.create_quiz(text,text,text,text,boolean,smallint,boolean) from public;
revoke all on function public.submit_answer(uuid,uuid,text)  from public;
revoke all on function public.reveal_quiz_now(uuid)          from public;
revoke all on function public.solve_public_post(uuid,smallint) from public;
revoke all on function public.auto_reveal_expired()          from public;
revoke all on function public.mark_quiz_revealed_if_needed(uuid) from public;

grant execute on function public.create_family(text)            to authenticated;
grant execute on function public.join_family(char)              to authenticated;
grant execute on function public.create_quiz(text,text,text,text,boolean,smallint,boolean) to authenticated;
grant execute on function public.submit_answer(uuid,uuid,text)  to authenticated;
grant execute on function public.reveal_quiz_now(uuid)          to authenticated;
grant execute on function public.solve_public_post(uuid,smallint) to authenticated;
grant execute on function public.auto_reveal_expired()          to service_role;
-- mark_quiz_revealed_if_needed is internal: invoked by submit_answer (definer)
-- so no client grant needed.

-- =====================================================================
-- Done.
-- =====================================================================
