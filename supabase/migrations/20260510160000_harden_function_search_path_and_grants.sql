-- =====================================================================
-- 진진거 — Phase 1 hardening pass triggered by Supabase advisor
-- - Fixes function_search_path_mutable warnings (lint 0011)
-- - Fixes anon_security_definer_function_executable (lint 0028)
-- - Tightens authenticated EXECUTE for internal helpers (lint 0029 partial)
--
-- Remaining accepted advisor items after this migration:
--   - rls_enabled_no_policy on public.public_post  → INTENTIONAL (data-model F-02)
--   - 6 authenticated_security_definer_function_executable on RPCs
--     (create_family / join_family / create_quiz / submit_answer /
--      reveal_quiz_now / solve_public_post)
--     → INTENTIONAL by ADR-0004 (RPC-only write surface).
--   - auth_leaked_password_protection → Auth Settings UI toggle.
-- =====================================================================

-- 1) Pin search_path on every public function the linter flagged.
alter function public.kst_today()                                           set search_path = public, pg_temp;
alter function public.kst_yesterday()                                       set search_path = public, pg_temp;
alter function public.kst_week_start(date)                                  set search_path = public, pg_temp;
alter function public.current_app_user_id()                                 set search_path = public, pg_temp;
alter function public.family_member_capacity_check()                        set search_path = public, pg_temp;
alter function public.quiz_option_after_change_check()                      set search_path = public, pg_temp;
alter function public.weekly_score_on_reveal()                              set search_path = public, pg_temp;
alter function public.weekly_score_on_user_comment()                        set search_path = public, pg_temp;
alter function public.weekly_score_on_comment_soft_delete()                 set search_path = public, pg_temp;
alter function public.public_post_upvote_counter()                          set search_path = public, pg_temp;
alter function public.public_post_comment_counter()                         set search_path = public, pg_temp;
alter function public.public_post_solve_counter()                           set search_path = public, pg_temp;
alter function public.set_updated_at()                                      set search_path = public, pg_temp;

-- 2) RPCs require auth.uid(); revoke EXECUTE from anon (still anon-callable
--    via PostgREST without this).
revoke execute on function public.create_family(text)                                       from anon;
revoke execute on function public.join_family(char)                                         from anon;
revoke execute on function public.create_quiz(text,text,text,text,boolean,smallint,boolean) from anon;
revoke execute on function public.submit_answer(uuid,uuid,text)                             from anon;
revoke execute on function public.reveal_quiz_now(uuid)                                     from anon;
revoke execute on function public.solve_public_post(uuid,smallint)                          from anon;

-- 3) Internal helpers / triggers should not be reachable from PostgREST.
revoke execute on function public.gen_family_code()                                         from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user()                                    from public, anon, authenticated;
revoke execute on function public.mark_quiz_revealed_if_needed(uuid)                        from public, anon, authenticated;
revoke execute on function public.comment_user_delete_window()                              from public, anon, authenticated;
revoke execute on function public.auto_reveal_expired()                                     from public, anon, authenticated;
-- service_role grant on auto_reveal_expired remains from the init migration.

-- 4) Helpers used inside policies / SECURITY DEFINER bodies don't need to be
--    EXECUTEable from the API surface either.
revoke execute on function public.is_family_member(uuid)                                    from public, anon, authenticated;
revoke execute on function public.kst_today()                                               from public, anon, authenticated;
revoke execute on function public.kst_yesterday()                                           from public, anon, authenticated;
revoke execute on function public.kst_week_start(date)                                      from public, anon, authenticated;
revoke execute on function public.current_app_user_id()                                     from public, anon, authenticated;
