-- =====================================================================
-- 진진거 demo seed — DEV ONLY
-- - 4 demo users (mom/dad/sis/me @jinjin.demo) all with password "password123"
-- - 1 family "콩가족" code K7M3PQ
-- - 5 quizzes spanning past 4 days (4 revealed + 1 open today)
-- - Answers, AI comments, user comments, 1 public post w/ upvotes
-- - Triggers (weekly_score, family_chemistry, counters) populate naturally
--
-- Idempotent: deletes any existing %@jinjin.demo users first which cascades
-- through the full graph. Run repeatedly to refresh.
-- =====================================================================

-- 1. Wipe previous demo data (cascade)
delete from auth.users where email like '%@jinjin.demo';

-- 2. Insert 4 demo auth.users.
--    handle_new_auth_user trigger auto-creates rows in public.app_user.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
(
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111'::uuid,
  'authenticated', 'authenticated',
  'mom@jinjin.demo',
  extensions.crypt('password123', extensions.gen_salt('bf', 10)),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"엄마 영선"}'::jsonb,
  now() - interval '10 days', now(),
  '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222'::uuid,
  'authenticated', 'authenticated',
  'dad@jinjin.demo',
  extensions.crypt('password123', extensions.gen_salt('bf', 10)),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"아빠 동훈"}'::jsonb,
  now() - interval '10 days', now(),
  '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-3333-3333-333333333333'::uuid,
  'authenticated', 'authenticated',
  'sis@jinjin.demo',
  extensions.crypt('password123', extensions.gen_salt('bf', 10)),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"동생 지윤"}'::jsonb,
  now() - interval '9 days', now(),
  '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444'::uuid,
  'authenticated', 'authenticated',
  'me@jinjin.demo',
  extensions.crypt('password123', extensions.gen_salt('bf', 10)),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"민수"}'::jsonb,
  now() - interval '9 days', now(),
  '', '', '', ''
);

-- 3. Family + members
insert into public.family (id, name, code, created_by_user_id, created_at)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  '콩가족', 'K7M3PQ',
  '11111111-1111-1111-1111-111111111111',
  now() - interval '9 days'
);

insert into public.family_member (family_id, user_id, role, nickname, joined_at) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner',  '엄마',  now() - interval '9 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', '아빠',  now() - interval '9 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member', '동생',  now() - interval '8 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'member', '나',    now() - interval '8 days');

-- 4. Quizzes (5 total: 4 revealed past days + 1 open today)
--    Inserted as status='open' first, then options, answers, comments,
--    then status flipped to 'revealed' to fire weekly_score / chemistry triggers.
--    quiz IDs use 'q' prefix in hex, easy to read in dashboards.

set constraints public.quiz_option_invariant deferred;

-- Quiz 1: 엄마 출제, 4 days ago, revealed
insert into public.quiz (id, family_id, author_user_id, day_label, is_backlog, difficulty,
                         status, created_at, publish_at, reveal_at, revealed_at)
values (
  'b1111111-0001-0001-0001-000000000001'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  (public.kst_today() - 4),
  false, 2, 'open',
  now() - interval '4 days',
  now() - interval '4 days',
  now() - interval '3 days',
  null
);
insert into public.quiz_option (quiz_id, kind, text, position, source_llm, edited) values
('b1111111-0001-0001-0001-000000000001','true', '새로 산 텀블러를 회사에 두고 와서 종일 종이컵으로 마셨어', 1, null, false),
('b1111111-0001-0001-0001-000000000001','true', '오후 미팅 중에 잠깐 졸음 운전할 뻔해서 졸음 쉼터에 들어갔어', 2, null, false),
('b1111111-0001-0001-0001-000000000001','false','동네 도서관에서 회원증을 새로 만들었는데 이름을 잘못 적었어', 3, 'demo:lie-gen-1', true);

-- Quiz 2: 아빠 출제, 3 days ago, revealed
insert into public.quiz (id, family_id, author_user_id, day_label, is_backlog, difficulty,
                         status, created_at, publish_at, reveal_at, revealed_at)
values (
  'b2222222-0002-0002-0002-000000000002'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  (public.kst_today() - 3),
  false, 3, 'open',
  now() - interval '3 days',
  now() - interval '3 days',
  now() - interval '2 days',
  null
);
insert into public.quiz_option (quiz_id, kind, text, position, source_llm, edited) values
('b2222222-0002-0002-0002-000000000002','true', '리모컨을 30분 찾다가 결국 냉장고 야채칸에서 발견했어', 1, null, false),
('b2222222-0002-0002-0002-000000000002','true', '아침에 신발 짝짝이로 신고 나갔다가 엘리베이터에서 알아채고 다시 올라옴', 2, null, false),
('b2222222-0002-0002-0002-000000000002','false','동네 친구한테 빌려준 5만원을 3년 만에 우연히 돌려받았어', 3, 'demo:lie-gen-2', false);

-- Quiz 3: 동생 출제, 2 days ago, revealed
insert into public.quiz (id, family_id, author_user_id, day_label, is_backlog, difficulty,
                         status, created_at, publish_at, reveal_at, revealed_at)
values (
  'b3333333-0003-0003-0003-000000000003'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '33333333-3333-3333-3333-333333333333',
  (public.kst_today() - 2),
  false, 4, 'open',
  now() - interval '2 days',
  now() - interval '2 days',
  now() - interval '1 day',
  null
);
insert into public.quiz_option (quiz_id, kind, text, position, source_llm, edited) values
('b3333333-0003-0003-0003-000000000003','true', '오늘 본 수학 시험을 망해서 끝나고 매점에서 빵 두 개 먹었어', 1, null, false),
('b3333333-0003-0003-0003-000000000003','true', '새로 친해진 친구가 같이 PC방 가자고 했는데 처음이라 좀 긴장됐어', 2, null, false),
('b3333333-0003-0003-0003-000000000003','false','자율학습 째고 영화관 가서 혼자 영화 봤는데 진짜 재밌었어', 3, 'demo:lie-gen-3', true);

-- Quiz 4: 나 출제, 1 day ago, revealed
insert into public.quiz (id, family_id, author_user_id, day_label, is_backlog, difficulty,
                         status, created_at, publish_at, reveal_at, revealed_at)
values (
  'b4444444-0004-0004-0004-000000000004'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '44444444-4444-4444-4444-444444444444',
  (public.kst_today() - 1),
  false, 3, 'open',
  now() - interval '1 day',
  now() - interval '1 day',
  now(),
  null
);
insert into public.quiz_option (quiz_id, kind, text, position, source_llm, edited) values
('b4444444-0004-0004-0004-000000000004','true', '회의에서 시연한 데모가 잘 풀려서 팀장님한테 칭찬을 받았어', 1, null, false),
('b4444444-0004-0004-0004-000000000004','true', '점심을 못 먹고 오후 내내 커피만 4잔 마셨어', 2, null, false),
('b4444444-0004-0004-0004-000000000004','false','퇴근길에 초등학교 친구를 우연히 만나서 30분 동안 수다 떨었어', 3, 'demo:lie-gen-4', true);

-- Quiz 5: 엄마 출제, 오늘, OPEN (no answers yet)
insert into public.quiz (id, family_id, author_user_id, day_label, is_backlog, difficulty,
                         status, created_at, publish_at, reveal_at, revealed_at)
values (
  'b5555555-0005-0005-0005-000000000005'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  public.kst_today(),
  false, 2, 'open',
  now() - interval '2 hour',
  now() - interval '2 hour',
  now() + interval '22 hour',
  null
);
insert into public.quiz_option (quiz_id, kind, text, position, source_llm, edited) values
('b5555555-0005-0005-0005-000000000005','true', '아침에 두부김치 처음 만들어봤는데 의외로 가족 다 먹을 만하더라', 1, null, false),
('b5555555-0005-0005-0005-000000000005','true', '오늘 정기 검진에서 콜레스테롤 정상 나왔어. 다행이야', 2, null, false),
('b5555555-0005-0005-0005-000000000005','false','단톡방에서 이모티콘 잘못 눌러서 회사 부장님한테 하트 이모지 보냈어', 3, 'demo:lie-gen-5', true);

set constraints public.quiz_option_invariant immediate;

-- 5. Answers for the 4 revealed quizzes
--    Quiz 1 (mom author): dad/sis correct (false at pos 3), me wrong (true2)
--    Quiz 2 (dad author): mom/sis/me all correct → fool_rate = 0 (everyone caught it)
--    Quiz 3 (sis author): mom/dad wrong, me correct → sis fooled 2/3
--    Quiz 4 (me author):  mom/sis correct, dad wrong → me fooled 1/3

-- Quiz 1 answers
insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b1111111-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', o.id,
       '엄마는 도서관 잘 안 가던데 너무 디테일해서 오히려 의심',
       true, now() - interval '3 days 2 hours'
from public.quiz_option o where o.quiz_id = 'b1111111-0001-0001-0001-000000000001' and o.position = 3;

insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b1111111-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', o.id,
       '이름 잘못 적었다는 디테일이 너무 만들어낸 느낌이야',
       true, now() - interval '3 days 1 hour'
from public.quiz_option o where o.quiz_id = 'b1111111-0001-0001-0001-000000000001' and o.position = 3;

insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b1111111-0001-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', o.id,
       '엄마가 운전 중 졸 일이 없는데 이건 지어낸 듯',
       false, now() - interval '3 days'
from public.quiz_option o where o.quiz_id = 'b1111111-0001-0001-0001-000000000001' and o.position = 2;

-- Quiz 2 answers (everyone caught it)
insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b2222222-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', o.id,
       '5만원 돌려받았으면 자랑부터 했을 텐데, 너무 깔끔해',
       true, now() - interval '2 days 3 hours'
from public.quiz_option o where o.quiz_id = 'b2222222-0002-0002-0002-000000000002' and o.position = 3;

insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b2222222-0002-0002-0002-000000000002', '33333333-3333-3333-3333-333333333333', o.id,
       '아빠 친구들 다 안 만난 지 오래됐잖아',
       true, now() - interval '2 days 2 hours'
from public.quiz_option o where o.quiz_id = 'b2222222-0002-0002-0002-000000000002' and o.position = 3;

insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b2222222-0002-0002-0002-000000000002', '44444444-4444-4444-4444-444444444444', o.id,
       '리모컨/신발 사건은 너무 아빠스러움, 5만원이 가짜',
       true, now() - interval '2 days 1 hour'
from public.quiz_option o where o.quiz_id = 'b2222222-0002-0002-0002-000000000002' and o.position = 3;

-- Quiz 3 answers (sis fools 2 of 3)
insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b3333333-0003-0003-0003-000000000003', '11111111-1111-1111-1111-111111111111', o.id,
       '시험 망해서 빵 먹었다는 게 너무 자세해서 오히려 의심',
       false, now() - interval '1 day 5 hours'
from public.quiz_option o where o.quiz_id = 'b3333333-0003-0003-0003-000000000003' and o.position = 1;

insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b3333333-0003-0003-0003-000000000003', '22222222-2222-2222-2222-222222222222', o.id,
       '얘 PC방 안 가본 적 없을 텐데 처음이라는 게 이상해',
       false, now() - interval '1 day 4 hours'
from public.quiz_option o where o.quiz_id = 'b3333333-0003-0003-0003-000000000003' and o.position = 2;

insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b3333333-0003-0003-0003-000000000003', '44444444-4444-4444-4444-444444444444', o.id,
       '얘 자율학습 째면 형이 먼저 알아. 영화 째는 건 거짓말',
       true, now() - interval '1 day 3 hours'
from public.quiz_option o where o.quiz_id = 'b3333333-0003-0003-0003-000000000003' and o.position = 3;

-- Quiz 4 answers
insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b4444444-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111', o.id,
       '점심 거른 거 어제 통화에서 들었어. 칭찬도 진짜고. 친구는 가짜',
       true, now() - interval '5 hours'
from public.quiz_option o where o.quiz_id = 'b4444444-0004-0004-0004-000000000004' and o.position = 3;

insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b4444444-0004-0004-0004-000000000004', '22222222-2222-2222-2222-222222222222', o.id,
       '커피 4잔은 너무 과장. 점심 거른 게 가짜 같아',
       false, now() - interval '4 hours'
from public.quiz_option o where o.quiz_id = 'b4444444-0004-0004-0004-000000000004' and o.position = 2;

insert into public.answer (quiz_id, solver_user_id, chosen_option_id, reason_text, is_correct, created_at)
select 'b4444444-0004-0004-0004-000000000004', '33333333-3333-3333-3333-333333333333', o.id,
       '오빠 초등 친구 한 번도 본 적 없는데 30분 수다? 가짜야',
       true, now() - interval '3 hours'
from public.quiz_option o where o.quiz_id = 'b4444444-0004-0004-0004-000000000004' and o.position = 3;

-- 6. Reveal 4 quizzes (status flip → triggers weekly_score + family_chemistry).
--    Each UPDATE sets revealed_at; trigger reads new.revealed_at.
update public.quiz set status='revealed', revealed_at=now() - interval '3 days'
 where id='b1111111-0001-0001-0001-000000000001';
update public.quiz set status='revealed', revealed_at=now() - interval '2 days'
 where id='b2222222-0002-0002-0002-000000000002';
update public.quiz set status='revealed', revealed_at=now() - interval '1 day'
 where id='b3333333-0003-0003-0003-000000000003';
update public.quiz set status='revealed', revealed_at=now() - interval '2 hours'
 where id='b4444444-0004-0004-0004-000000000004';

-- 7. AI auto comments + 진짜 하루 질문 chips embedded as a single comment per quiz
insert into public.comment (quiz_id, author_user_id, kind, category, text, created_at) values
('b1111111-0001-0001-0001-000000000001', null, 'ai', null,
 '엄마의 하루 중 가짜는 도서관 카드였어요. 가족 3명 중 2명이 맞혔습니다. 졸음운전 얘기는 무겁지만, 다행히 쉼터에 들렀다는 점이 따뜻합니다. 오늘은 "텀블러 새로 산 거 마음에 들어요?", "졸음운전 쉼터에서 뭐 하셨어요?" 같은 질문으로 이어가 보세요.',
 now() - interval '3 days' + interval '5 minutes'),
('b2222222-0002-0002-0002-000000000002', null, 'ai', null,
 '아빠의 가짜는 5만원 회수. 가족이 모두 정확히 맞혔어요(속임률 0%). 리모컨/신발 사건이 너무 아빠다워서 가짜를 쉽게 찾았다고 봅니다. "리모컨이 왜 거기 있었어?", "신발 짝짝이 알아챈 순간 기분 어땠어?" 같은 후속 질문이 즐겁습니다.',
 now() - interval '2 days' + interval '5 minutes'),
('b3333333-0003-0003-0003-000000000003', null, 'ai', null,
 '동생의 가짜는 영화 째기. 가족 중 두 명이 속았네요. 시험 망한 일과 새 친구 PC방은 진짜였어요. "오늘 빵은 뭐 골랐어?", "새 친구 어떤 사람이야?" 같이 이어가면 동생이 더 풀어놓을 거예요.',
 now() - interval '1 day' + interval '5 minutes'),
('b4444444-0004-0004-0004-000000000004', null, 'ai', null,
 '나의 가짜는 초등 친구 우연 만남. 가족 3명 중 2명이 맞혔어요. 점심 거르고 커피 4잔은 진짜라 엄마가 걱정합니다. "어떤 발표였길래 칭찬받았어?", "점심 못 먹은 이유가 뭐였어?" 같은 질문이 어울립니다.',
 now() - interval '2 hours' + interval '5 minutes');

-- 8. Family user comments (mix of reaction / question / other)
--    These trigger weekly_score for reaction_star / question_master.
insert into public.comment (quiz_id, author_user_id, kind, category, category_source, text, created_at) values
('b1111111-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'user', 'reaction', 'heuristic',
 'ㅋㅋㅋ 도서관 진짜인 줄 알았네', now() - interval '3 days' + interval '10 minutes'),
('b1111111-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', 'user', 'question', 'heuristic',
 '근데 텀블러 어디 두고 왔어?', now() - interval '3 days' + interval '15 minutes'),
('b2222222-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'user', 'reaction', 'heuristic',
 '헐 냉장고 야채칸 ㅋㅋㅋ 너무 아빠야', now() - interval '2 days' + interval '20 minutes'),
('b2222222-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'user', 'question', 'heuristic',
 '리모컨이 왜 거기 있었어?', now() - interval '2 days' + interval '25 minutes'),
('b2222222-0002-0002-0002-000000000002', '44444444-4444-4444-4444-444444444444', 'user', 'reaction', 'heuristic',
 'ㅋㅋㅋㅋ 진짜 너무 아빠다움', now() - interval '2 days' + interval '30 minutes'),
('b3333333-0003-0003-0003-000000000003', '11111111-1111-1111-1111-111111111111', 'user', 'question', 'heuristic',
 '시험 빵은 뭐 먹었어?', now() - interval '1 day' + interval '20 minutes'),
('b3333333-0003-0003-0003-000000000003', '22222222-2222-2222-2222-222222222222', 'user', 'question', 'heuristic',
 '새 친구는 어떤 친구야?', now() - interval '1 day' + interval '25 minutes'),
('b4444444-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111', 'user', 'question', 'heuristic',
 '점심 못 먹은 이유가 뭐였어?', now() - interval '2 hours' + interval '10 minutes'),
('b4444444-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111', 'user', 'reaction', 'heuristic',
 '커피 4잔은 진짜 너무했다 ㅠㅠ', now() - interval '2 hours' + interval '12 minutes'),
('b4444444-0004-0004-0004-000000000004', '33333333-3333-3333-3333-333333333333', 'user', 'reaction', 'heuristic',
 '오빠 발표 잘했대 대박 ㅋㅋ', now() - interval '2 hours' + interval '15 minutes');

-- 9. Character comment cache (one per member per today)
insert into public.character_comment_cache (family_id, user_id, day_label, text) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', public.kst_today(),
 '엄마는 디테일을 잘 잡아내는 가족 탐정 타입이에요. 가짜 옵션의 어색한 디테일을 가장 빨리 알아챕니다.'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', public.kst_today(),
 '아빠는 가족을 너무 잘 믿는 따뜻한 타입이에요. 그만큼 가족이 만든 가짜에 자주 속아요.'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', public.kst_today(),
 '동생은 본인은 잘 속이지만 다른 사람의 거짓에는 상대적으로 약한 균형형이에요.'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', public.kst_today(),
 '나는 출제도 풀이도 평균 이상으로 안정적이에요. 후속 질문을 가장 잘 던지는 타입입니다.');

-- 10. Public post — quiz 2 (아빠 리모컨 사건) anonymized + sample upvotes/comments
insert into public.public_post (
  id, source_quiz_id, family_id, author_family_hash, category, status,
  options, false_option_index, published_at
) values (
  'cccccccc-0001-0001-0001-000000000001'::uuid,
  'b2222222-0002-0002-0002-000000000002',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  encode(extensions.digest(('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' || 'demo-salt')::bytea, 'sha256'), 'hex'),
  'legend', 'open',
  jsonb_build_array(
    jsonb_build_object('text','아빠가 리모컨을 30분 찾다가 결국 냉장고 야채칸에서 발견했어'),
    jsonb_build_object('text','아빠가 신발 짝짝이로 출근했다가 엘리베이터에서 알아채고 다시 올라옴'),
    jsonb_build_object('text','아빠가 동네 친구한테 빌려준 5만원을 3년 만에 우연히 돌려받았어')
  ),
  2,
  now() - interval '1 day 12 hours'
);

-- Public upvotes (자기 가족 + 다른 가족 흉내. self-upvote는 demo로 OK)
insert into public.public_upvote (post_id, voter_user_id) values
('cccccccc-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111'),
('cccccccc-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333'),
('cccccccc-0001-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444');

-- Public comments
insert into public.public_comment (post_id, author_user_id, text, created_at) values
('cccccccc-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 '냉장고 야채칸 너무 공감 ㅋㅋㅋㅋ', now() - interval '1 day'),
('cccccccc-0001-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 '5만원 회수가 정답이었네 ㅋㅋ 너무 깔끔해서 오히려 의심됐을 듯', now() - interval '20 hours');

-- Public solve attempts (다른 가족 시뮬레이션 — 같은 가족 user로 흉내)
insert into public.public_solve_attempt (post_id, solver_user_id, chosen_index, is_correct, created_at) values
('cccccccc-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', 2, true,  now() - interval '1 day'),
('cccccccc-0001-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', 0, false, now() - interval '20 hours');

-- 11. LLM usage records
insert into auditing.llm_usage (user_id, family_id, quiz_id, kind, model, prompt_tokens, output_tokens, cost_krw, created_at) values
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1111111-0001-0001-0001-000000000001', 'generate', 'demo-llm-v1', 220, 110, 1.20, now() - interval '4 days'),
('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b2222222-0002-0002-0002-000000000002', 'generate', 'demo-llm-v1', 240, 130, 1.40, now() - interval '3 days'),
('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b3333333-0003-0003-0003-000000000003', 'generate', 'demo-llm-v1', 260, 120, 1.30, now() - interval '2 days'),
('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b4444444-0004-0004-0004-000000000004', 'generate', 'demo-llm-v1', 230, 125, 1.35, now() - interval '1 day'),
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b5555555-0005-0005-0005-000000000005', 'generate', 'demo-llm-v1', 235, 118, 1.30, now() - interval '2 hours'),
(null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1111111-0001-0001-0001-000000000001', 'comment', 'demo-llm-v1', 320, 180, 2.10, now() - interval '3 days'),
(null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b2222222-0002-0002-0002-000000000002', 'comment', 'demo-llm-v1', 320, 200, 2.30, now() - interval '2 days'),
(null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b3333333-0003-0003-0003-000000000003', 'comment', 'demo-llm-v1', 320, 175, 2.05, now() - interval '1 day'),
(null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b4444444-0004-0004-0004-000000000004', 'comment', 'demo-llm-v1', 320, 195, 2.25, now() - interval '2 hours'),
('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b2222222-0002-0002-0002-000000000002', 'anonymize', 'demo-llm-v1', 180, 90, 1.00, now() - interval '1 day 13 hours');
