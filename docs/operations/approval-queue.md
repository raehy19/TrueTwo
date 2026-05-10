# Pending Approval Queue

Keep this document concise. Only record items that require a real decision.

## Lifecycle

Every approval item moves through these states:

1. **open** — appended via `/approval-add`. Waiting for a decision.
2. **resolved** — the user has decided. Record `Decision:` and `Resolved:` date.
3. **routed** — moved out of the active list:
   - **High-impact** → promoted to an ADR via `/promote-to-adr <id>`. The
     resolved item gets a `Promoted to docs/architecture/adr/<file>.md` line and
     is moved to the archive section below.
   - **Low-impact** → captured as a one-line entry in `docs/learnings/` and
     moved to the archive section below.
   - **Dropped** → no longer relevant. State `Decision: dropped` with a reason.

Resolved items must not stay in the active list. The active list is only for
**open** decisions.

## Item format

```
## <id>. <title>

- Status: open | resolved
- Opened: YYYY-MM-DD
- (when resolved) Resolved: YYYY-MM-DD
- (when resolved) Decision: <chosen option and one-line reason>
- (when promoted) Promoted to: <ADR path> or <learning path>
- Why it matters: <fill>
- Options:
  - <option A>
  - <option B>
- Recommended option: <fill>
- Risks: <fill>
- Affected areas: <fill>
```

---

## Active

### 5. License choice
- Status: open
- Opened: 2026-05-03
- Why it matters: licensing is a legal decision that affects reuse, contribution, and distribution.
- Options:
  - Keep the repository private and effectively unlicensed
  - Choose a permissive open-source license
  - Choose a copyleft license
- Recommended option: keep private until first beta release; revisit before any external code sharing.
- Risks: choosing the wrong license creates legal ambiguity or unintended reuse terms.
- Affected areas: repository metadata, distribution, contribution policy

### 6. AI provider selection (single vs multi-provider)
- Status: open
- Opened: 2026-05-10
- Why it matters: ADR-0001 locks "single LLM provider for MVP" but the actual provider has not been chosen. Affects cost, latency, safety filter quality, and Korean output quality.
- Options:
  - Provider X (a) — Korean instruct strength, mid-cost
  - Provider Y (a) — cheaper, weaker safety filter
  - Provider Z (a) — best safety, highest cost
- Recommended option: pick after a 1-day prompt evaluation against the F4 prompt outline using sample family inputs.
- Risks: switching providers post-launch requires prompt re-tuning. Cost guardrail (PRD §6) depends on per-token price.
- Affected areas: PRD §12 dependency, F4 prompt outline, `auditing.llm_usage.cost_krw` calculation.

### 7. `remove_public_post` RPC scope (OQ-DM7)
- Status: open
- Opened: 2026-05-10
- Why it matters: data-model §9.2 revokes UPDATE on `public.public_post` from clients. Author self-delete (F7 S-14) needs an RPC. Without it, the 48h self-delete UX is non-functional.
- Options:
  - Add `remove_public_post(post_id)` RPC enforcing author + 48h window before v1.0.
  - Postpone delete UX entirely (route to support form even within 48h).
  - Allow admin-only delete via `service_role` only.
- Recommended option: add the RPC before v1.0; matches user expectation set in F7.
- Risks: small surface; needs RLS test for non-author + post-48h paths.
- Affected areas: F7 spec, data-model §7, §9.2.

### 8. AI cost guardrail enforcement (OQ-DM8)
- Status: open
- Opened: 2026-05-10
- Why it matters: PRD §9 B-11 caps LLM calls per quiz at 3 (generate + 2 reroll) + 1 anonymize. MVP enforces in app; if any path bypasses, cost can run away.
- Options:
  - Keep app-only enforcement, monitor `auditing.llm_usage` daily.
  - Add DB-level rate limit table + trigger.
  - Add Vercel rate-limit middleware in front of LLM Route Handlers.
- Recommended option: app + monitor for MVP, schedule DB enforcement for v1.1 if monitoring shows runaways.
- Risks: leak path = abusive client could call generate endpoint repeatedly until app gate fires.
- Affected areas: F4 spec, data-model §15 (jurisdiction of cost), Vercel function settings.

### 9. Family code expiration policy (OQ-F1)
- Status: open
- Opened: 2026-05-10
- Why it matters: codes today never expire. Convenience high, brute-force exposure non-zero.
- Options:
  - Never expire (current MVP).
  - Expire 7 days after creation, owner can rotate.
  - Expire on first member join, only owner can reissue.
- Recommended option: never expire for MVP, add rotation in v1.1 if abuse appears.
- Risks: leaked code grants gameplay-level access (no real damage but breaks family trust).
- Affected areas: F2 spec, data-model `family.code` semantics.

### 10. Vercel cron vs pg_cron (OQ-DM6)
- Status: open
- Opened: 2026-05-10
- Why it matters: `auto_reveal_expired` and daily character comment refresh need a 1-minute and a daily cron. Supabase Free tier may not include `pg_cron` by default.
- Options:
  - `pg_cron` (when available on the chosen plan).
  - Vercel Cron + `service_role` calling the RPC.
  - External worker (Cloudflare Worker / GitHub Actions cron).
- Recommended option: confirm `pg_cron` availability on the chosen Supabase plan; use Vercel Cron as fallback.
- Risks: `pg_cron` unavailability discovered late blocks reveal automation.
- Affected areas: data-model §11 step 10, deployment checklist (§14).

---

## Resolved (archive)

<!--
Move resolved items here once they have been routed. Keep the original headings,
add Resolved/Decision/Promoted-to fields, and link to the ADR or learning entry
that captured the decision. Do not delete history.
-->

### 1. Product problem statement and primary user
- Status: resolved
- Opened: 2026-05-03
- Resolved: 2026-05-10
- Decision: 진진거 — 가족이 매일 진짜 2개와 가짜 1개로 서로의 하루를 맞히는 데일리 게임. 1차 사용자는 2~6인 가족 단톡방 사용자(부모·자녀·형제). 자세한 정의는 product-brief.md / brand-positioning.md / PRD.md.
- Promoted to: [`../project/product-brief.md`](../project/product-brief.md), [`../project/brand-positioning.md`](../project/brand-positioning.md), [`../project/PRD.md`](../project/PRD.md). 본 결정은 제품 브리프·브랜드·PRD 자체가 SoT라 ADR 별도 생성 안 함.
- Why it matters: this anchors requirements, scope, architecture, and priorities.
- Options considered: user-given problem statement vs hypothesis draft.
- Final option: user-given direction(가정의 달 데일리 가족 게임 — 진진거).

### 2. MVP scope and out-of-scope boundary
- Status: resolved
- Opened: 2026-05-03
- Resolved: 2026-05-10
- Decision: 좁은 MVP. 포함 = Google OAuth, 가족 워크스페이스, 일일 1개 진진거 등록 + 24h 풀이 창, AI 가짜 후보 + 사용자 편집, 결과 + AI 코멘트 + 진짜 하루 질문, 가족 랭킹 5종, 가족 대시보드, 익명화된 공개 게시판. 제외 = 알림 SDK, 결제, 다중 가족, 첨부, 다국어 등. 자세한 목록은 product-brief.md §"MVP 범위 (포함/Out of Scope)".
- Promoted to: [`../project/product-brief.md`](../project/product-brief.md), [`../project/PRD.md`](../project/PRD.md) §11.
- Why it matters: this prevents over-design and unnecessary technical decisions.
- Options considered: narrow MVP vs broad MVP.
- Final option: narrow.

### 3. First platform scope
- Status: resolved
- Opened: 2026-05-03
- Resolved: 2026-05-10
- Decision: Web first (모바일 우선 반응형 웹). 가족 단톡방에서 링크로 진입하는 컨텍스트.
- Promoted to: ADR-0001 — [`../architecture/adr/2026-05-10-tech-stack.md`](../architecture/adr/2026-05-10-tech-stack.md).
- Why it matters: web/mobile/API/internal-tool starts imply different architecture and planning paths.
- Options considered: Web / API / Mobile / Multi-platform.
- Final option: Web first.

### 4. Repository bootstrap strategy
- Status: resolved
- Opened: 2026-05-03
- Resolved: 2026-05-10
- Decision: Single-app Next.js repo on Vercel + Supabase. Mono-repo는 v1.1 검토.
- Promoted to: ADR-0001 — [`../architecture/adr/2026-05-10-tech-stack.md`](../architecture/adr/2026-05-10-tech-stack.md).
- Why it matters: Git initialization, mono-repo choice, and default tooling all depend on this.
- Options considered: single-app vs mono-repo vs docs-only.
- Final option: single-app after product definition.
