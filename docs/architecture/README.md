# Architecture

## Files

- [`data-model.md`](data-model.md) — Supabase 데이터 모델 단일 SoT (테이블 14, ENUM 11, RPC 7, 트리거 9, 안전 뷰 6, RLS 정책, **§15 Production Safety Review**)
- [`adr/`](adr/) — Architecture Decision Records
  - **ADR-0001** Tech stack — Next.js 15 + Vercel + Supabase + Anthropic Claude Haiku 4.5
  - **ADR-0002** 1인 1가족 제약 (v1.1 다중 가족 마이그레이션 경로 포함)
  - **ADR-0003** 모든 일자/주는 Asia/Seoul 자정 기준
  - **ADR-0004** 모든 변경은 `security definer` RPC + RLS + 안전 뷰 패턴 — 클라이언트 base table 직접 INSERT/UPDATE/DELETE 금지

## Stack

```
[Browser]
   │ HTTPS
   ▼
[Vercel — Next.js 15 App Router]
   ├── RSC pages (auth / onboarding / home / quiz / family / board)
   ├── Route Handlers (/api/ai)  ──► Anthropic Claude Haiku 4.5
   └── @supabase/ssr             ──► Supabase Auth (Email/Password, no confirm)
                                  └► Postgres
                                       public/    가족 자원 (RLS + 안전 뷰)
                                       private/   신고 큐, 익명화 매핑 (deny all)
                                       auditing/  llm_usage 비용 로그 (deny all)
```

## 보안 핵심

- 정답 컬럼(`quiz_option.kind`, `public_post.false_option_index`, `public_post.family_id`)은 **base SELECT가 revoke**되어 있고, 안전 뷰(`quiz_option_safe_v` / `public_post_safe_v`)로만 노출됩니다.
- 모든 RPC는 `set search_path = public, pg_temp` + `auth.uid()` 검증 + `is_family_member()` 검증 + `revoke from anon`으로 잠겨 있습니다.
- 가족 정원 8명, 1인 1가족, 1일 1판 등 비즈니스 규칙이 모두 DB 레벨에서 강제됩니다.
- 자세한 발견·처치·잔여 리스크 매트릭스는 `data-model.md` §15 참조.
