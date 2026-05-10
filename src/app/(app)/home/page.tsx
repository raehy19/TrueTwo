import Link from "next/link";
import { requireFamily } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AvatarDot } from "@/components/app-shell/avatar-dot";
import { kstDateLabel, timeUntil } from "@/lib/kst";

type QuizRow = {
  id: string;
  family_id: string;
  author_user_id: string;
  day_label: string;
  status: "open" | "revealed";
  reveal_at: string;
  revealed_at: string | null;
  created_at: string;
  difficulty: number;
  is_backlog: boolean;
};

type AnswerRow = { quiz_id: string; solver_user_id: string; is_correct: boolean };
type MemberRow = {
  user_id: string;
  display_name: string | null;
  nickname: string | null;
};
type RankingRow = {
  user_id: string;
  category: "detective" | "lie_designer" | "pure_hearted" | "reaction_star" | "question_master";
  score: number | null;
};

const categoryMeta: Record<RankingRow["category"], { label: string; emoji: string; tone: string }> = {
  detective: { label: "탐정", emoji: "🔍", tone: "bg-coral-100 text-coral-700" },
  lie_designer: { label: "거짓 설계자", emoji: "🎭", tone: "bg-grape-50 text-grape-500" },
  pure_hearted: { label: "순수한 마음상", emoji: "💗", tone: "bg-mint-50 text-mint-700" },
  reaction_star: { label: "리액션 장인", emoji: "✨", tone: "bg-mustard-50 text-coral-700" },
  question_master: { label: "질문왕", emoji: "❓", tone: "bg-paper-soft text-ink-soft" },
};

export default async function HomePage() {
  const { supabase, user, membership } = await requireFamily();

  const today = new Date()
    .toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\./g, "-")
    .replace(/\s/g, "")
    .replace(/-$/, "");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const [quizzesRes, membersRes, rankingRes] = await Promise.all([
    supabase
      .from("quiz")
      .select("id, family_id, author_user_id, day_label, status, reveal_at, revealed_at, created_at, difficulty, is_backlog")
      .eq("family_id", membership.family_id)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false }),
    supabase
      .from("family_member_profile_v")
      .select("user_id, display_name, nickname")
      .eq("family_id", membership.family_id),
    supabase
      .from("weekly_ranking_v")
      .select("user_id, category, score")
      .eq("family_id", membership.family_id),
  ]);

  const quizzes = ((quizzesRes.data as QuizRow[] | null) ?? []);
  const members = ((membersRes.data as MemberRow[] | null) ?? []);
  const memberById = new Map(members.map((m) => [m.user_id, m] as const));
  const rankings = ((rankingRes.data as RankingRow[] | null) ?? []);

  const myAnswerRes = quizzes.length
    ? await supabase
        .from("answer")
        .select("quiz_id, solver_user_id, is_correct")
        .in(
          "quiz_id",
          quizzes.map((q) => q.id),
        )
    : { data: [] as AnswerRow[] };
  const myAnswers = ((myAnswerRes.data as AnswerRow[] | null) ?? []).filter(
    (a) => a.solver_user_id === user.id,
  );
  const answeredQuizIds = new Set(myAnswers.map((a) => a.quiz_id));

  const openQuizzes = quizzes.filter((q) => q.status === "open");
  const revealedQuizzes = quizzes.filter((q) => q.status === "revealed");

  const myOpenToday = openQuizzes.find(
    (q) => q.author_user_id === user.id && q.day_label === today,
  );
  const toSolve = openQuizzes.filter(
    (q) => q.author_user_id !== user.id && !answeredQuizIds.has(q.id),
  );

  // Top ranking by category — pick top scorer per category
  const topByCategory = new Map<RankingRow["category"], RankingRow>();
  for (const r of rankings) {
    if (r.score == null) continue;
    const prev = topByCategory.get(r.category);
    if (!prev || (prev.score ?? -1) < (r.score ?? 0)) {
      topByCategory.set(r.category, r);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            안녕, {membership.nickname || "가족"} 👋
          </h1>
          <p className="text-xs text-ink-faint">
            {membership.family_name} · {kstDateLabel(new Date())}
          </p>
        </div>
        <AvatarDot seed={user.id} label={membership.nickname ?? user.email ?? "나"} size="lg" />
      </header>

      {/* Today's status */}
      <section>
        <SectionTitle>오늘의 진진거</SectionTitle>
        {myOpenToday ? (
          <Card className="mt-3 p-5">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-mint-50 px-2.5 py-1 text-[11px] font-semibold text-mint-700">
                내가 등록함
              </span>
              <span className="text-xs text-ink-faint">{timeUntil(myOpenToday.reveal_at).label}</span>
            </div>
            <p className="mt-3 text-pretty text-base font-semibold text-ink">
              가족이 풀어 주기를 기다리고 있어요.
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              모두 풀거나 24시간이 지나면 결과가 자동 공개돼요.
            </p>
            <div className="mt-4">
              <Link href={`/quiz/${myOpenToday.id}/result`} className="text-sm font-semibold text-coral-600 underline-offset-2 hover:underline">
                결과 미리보기 →
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="mt-3 p-5">
            <p className="text-balance text-base font-semibold text-ink">
              아직 오늘 진진거를 안 올렸어요.
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              진짜 일 2개를 적으면 AI가 그럴듯한 가짜를 만들어 드려요.
            </p>
            <div className="mt-4">
              <Link href="/quiz/new">
                <Button size="md" variant="primary">오늘 진진거 올리기</Button>
              </Link>
            </div>
          </Card>
        )}
      </section>

      {/* To solve */}
      {toSolve.length > 0 ? (
        <section>
          <SectionTitle>풀어야 할 진진거 · {toSolve.length}</SectionTitle>
          <div className="mt-3 space-y-3">
            {toSolve.map((q) => {
              const author = memberById.get(q.author_user_id);
              const name = author?.nickname || author?.display_name || "가족";
              return (
                <Link key={q.id} href={`/quiz/${q.id}/play`}>
                  <Card className="flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-pop">
                    <AvatarDot seed={q.author_user_id} label={name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{name}의 진진거</p>
                      <p className="text-xs text-ink-faint">
                        {timeUntil(q.reveal_at).label} · 난이도 {"●".repeat(q.difficulty)}
                      </p>
                    </div>
                    <span className="text-coral-600">→</span>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Recently revealed */}
      {revealedQuizzes.length > 0 ? (
        <section>
          <SectionTitle>최근 결과</SectionTitle>
          <div className="mt-3 space-y-3">
            {revealedQuizzes.slice(0, 4).map((q) => {
              const author = memberById.get(q.author_user_id);
              const name = author?.nickname || author?.display_name || "가족";
              return (
                <Link key={q.id} href={`/quiz/${q.id}/result`}>
                  <Card className="flex items-center gap-4 p-4">
                    <AvatarDot seed={q.author_user_id} label={name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {name}의 진진거 · {kstDateLabel(q.day_label)}
                      </p>
                      <p className="text-xs text-ink-faint">결과 보기 →</p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Weekly ranking peek */}
      {topByCategory.size > 0 ? (
        <section>
          <SectionTitle>이번 주 가족</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {Array.from(topByCategory.entries()).slice(0, 4).map(([cat, row]) => {
              const author = memberById.get(row.user_id);
              const name = author?.nickname || author?.display_name || "가족";
              const meta = categoryMeta[cat];
              return (
                <div
                  key={cat}
                  className={`rounded-2xl px-3 py-3 ring-paper ${meta.tone}`}
                >
                  <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
                    <span>{meta.emoji}</span>
                    <span>{meta.label}</span>
                  </div>
                  <p className="mt-1.5 text-base font-bold text-ink">{name}</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
      {children}
    </h2>
  );
}
