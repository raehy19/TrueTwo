-- =====================================================================
-- DEMO ONLY — relax RLS / grants so the live demo flow works end-to-end.
-- Reverts the tighter parts of 20260510160000_harden_function_search_path_and_grants.sql
-- and opens up base-table access for authenticated users.
-- Re-tighten after the hackathon demo.
-- =====================================================================

-- 1) Restore EXECUTE on helpers used inside RLS policies / SECURITY DEFINER bodies.
grant execute on function public.is_family_member(uuid)        to anon, authenticated;
grant execute on function public.kst_today()                   to anon, authenticated;
grant execute on function public.kst_yesterday()               to anon, authenticated;
grant execute on function public.kst_week_start(date)          to anon, authenticated;
grant execute on function public.current_app_user_id()         to anon, authenticated;

-- 2) Re-grant EXECUTE on RPCs to anon as well (demo: allow even if session
--    cookies aren't fully wired).
grant execute on function public.create_family(text)                                       to anon, authenticated;
grant execute on function public.join_family(char)                                         to anon, authenticated;
grant execute on function public.create_quiz(text,text,text,text,boolean,smallint,boolean) to anon, authenticated;
grant execute on function public.submit_answer(uuid,uuid,text)                             to anon, authenticated;
grant execute on function public.reveal_quiz_now(uuid)                                     to anon, authenticated;
grant execute on function public.solve_public_post(uuid,smallint)                          to anon, authenticated;

-- 3) Disable RLS on all public.* tables for demo + grant full DML to
--    authenticated and anon. private.* / auditing.* schemas stay locked.
do $$
declare
  t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I disable row level security', t.tablename);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t.tablename);
  end loop;
end $$;

-- 4) Make sure sequences are usable too.
grant usage, select on all sequences in schema public to anon, authenticated;
