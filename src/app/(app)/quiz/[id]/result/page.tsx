import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireFamily } from "@/lib/auth-helpers";
import { rpc } from "@/lib/supabase/rpc";
import { Card } from "@/components/ui/card";
import { AvatarDot } from "@/components/app-shell/avatar-dot";
import { kstDateLabel } from "@/lib/kst";
import { env } from "@/lib/env";
import { cn } from "@/lib/cn";
import {
  CommentComposer,
  FollowUpQuestionChip,
} from "./comment-composer";

export const dynamic = "force-dynamic";

type QuizRow = {
  id: string;
  family_id: string;
  author_user_id: string;
  day_label: string;
  status: "open" | "revealed";
  reveal_at: string;
  revealed_at: string | null;
  difficulty: number;
};
type RevealedOptionRow = {
  id: string | null;
  quiz_id: string | null;
  position: number | null;
  text: string | null;
  kind: "true" | "false" | null;
};
type AnswerRow = {
  id: string;
  solver_user_id: string;
  chosen_option_id: string;
  reason_text: string | null;
  is_correct: boolean;
};
type MemberRow = {
  user_id: string | null;
  display_name: string | null;
  nickname: string | null;
};
type CommentRow = {
  id: string;
  author_user_id: string | null;
  kind: "user" | "ai";
  category: "reaction" | "question" | "other" | null;
  text: string;
  created_at: string;
  deleted_at: string | null;
};

function memberDisplayName(m: MemberRow | undefined | null): string {
  if (!m) return "가족";
  return m.nickname || m.display_name || "가족";
}

// Pull short follow-up questions out of an AI comment text.
// Heuristics: split on bullet markers and pick lines ending in ?,
// then fall back to scanning sentences.
function extractFollowUpQuestions(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];

  // 1) Look for bullet-style splits.
  const bulletParts = text
    .split(/[•·\n\-]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const part of bulletParts) {
    if (out.length >= 2) break;
    if ((part.endsWith("?") || part.endsWith("？")) && part.length <= 40) {
      out.push(part.replace(/^[-•·\s]+/, "").trim());
    }
  }

  // 2) Fall back to scanning sentences for question marks.
  if (out.length < 2) {
    const sentences = text.split(/(?<=[.!?？])\s+/);
    for (const s of sentences) {
      if (out.length >= 2) break;
      const t = s.trim();
      if (!t) continue;
      if ((t.endsWith("?") || t.endsWith("？")) && t.length <= 50 && !out.includes(t)) {
        out.push(t);
      }
    }
  }

  return out.slice(0, 2);
}

async function triggerAIComment(quizId: string, cookieHeader: string) {
  try {
    const res = await fetch(`${env.appBaseUrl}/api/ai/comment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
      },
      body: JSON.stringify({ quiz_id: quizId }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function QuizResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, membership } = await requireFamily();

  // Make sure quiz is auto-revealed if eligible. RPC is safe to call even when
  // already revealed.
  await rpc(supabase, "mark_quiz_revealed_if_needed", { p_quiz_id: id });

  const quizRes = await supabase
    .from("quiz")
    .select(
      "id, family_id, author_user_id, day_label, status, reveal_at, revealed_at, difficulty",
    )
    .eq("id", id)
    .eq("family_id", membership.family_id)
    .maybeSingle();

  const quiz = quizRes.data as QuizRow | null;
  if (!quiz) notFound();

  // If the quiz is still open AND not yet past reveal time, send the user back to play.
  const now = Date.now();
  const revealMs = new Date(quiz.reveal_at).getTime();
  if (quiz.status !== "revealed" && now < revealMs) {
    redirect(`/quiz/${id}/play`);
  }

  // Load options (revealed view exposes kind).
  const { data: optionsData } = await supabase
    .from("quiz_option_revealed_v")
    .select("id, quiz_id, position, text, kind")
    .eq("quiz_id", id);

  const options = ((optionsData as RevealedOptionRow[] | null) ?? [])
    .filter(
      (o): o is RevealedOptionRow & {
        id: string;
        text: string;
        position: number;
        kind: "true" | "false";
      } =>
        Boolean(o.id) &&
        Boolean(o.text) &&
        o.position != null &&
        (o.kind === "true" || o.kind === "false"),
    )
    .map((o) => ({
      id: o.id,
      position: o.position,
      text: o.text,
      kind: o.kind,
    }))
    .sort((a, b) => a.position - b.position);

  // Load answers + member profiles.
  const [answersRes, membersRes, commentsRes] = await Promise.all([
    supabase
      .from("answer")
      .select("id, solver_user_id, chosen_option_id, reason_text, is_correct")
      .eq("quiz_id", id),
    supabase
      .from("family_member_profile_v")
      .select("user_id, display_name, nickname")
      .eq("family_id", membership.family_id),
    supabase
      .from("comment")
      .select("id, author_user_id, kind, category, text, created_at, deleted_at")
      .eq("quiz_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const answers = (answersRes.data as AnswerRow[] | null) ?? [];
  const members = (membersRes.data as MemberRow[] | null) ?? [];
  const comments = (commentsRes.data as CommentRow[] | null) ?? [];

  const memberByUserId = new Map<string, MemberRow>();
  for (const m of members) {
    if (m.user_id) memberByUserId.set(m.user_id, m);
  }

  const aiComment = comments.find((c) => c.kind === "ai");
  const userComments = comments.filter((c) => c.kind === "user");

  // Trigger AI generation if missing — fire and forget on first hit.
  if (!aiComment) {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    // Don't await indefinitely — we already render; the user can refresh.
    void triggerAIComment(id, cookieHeader);
  }

  const author = memberByUserId.get(quiz.author_user_id);
  const authorName = memberDisplayName(author);

  const answersByOption = new Map<string, AnswerRow[]>();
  for (const a of answers) {
    const list = answersByOption.get(a.chosen_option_id) ?? [];
    list.push(a);
    answersByOption.set(a.chosen_option_id, list);
  }

  const totalSolvers = answers.length;
  const correctCount = answers.filter((a) => a.is_correct).length;
  const accuracy =
    totalSolvers > 0 ? Math.round((correctCount / totalSolvers) * 100) : null;
  const foolRate = accuracy == null ? null : 100 - accuracy;

  const followUpQuestions = aiComment
    ? extractFollowUpQuestions(aiComment.text)
    : [];

  const myAnswer = answers.find((a) => a.solver_user_id === user.id);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-8 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <AvatarDot seed={quiz.author_user_id} label={authorName} size="lg" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
              {kstDateLabel(quiz.day_label)} · 진짜 2 / 가짜 1
            </p>
            <h1 className="font-display text-2xl font-bold text-ink">
              {authorName}의 진진거 결과
            </h1>
          </div>
        </div>
        {quiz.author_user_id !== user.id && !myAnswer ? (
          <p className="rounded-2xl bg-mustard-50 px-4 py-2.5 text-xs font-semibold text-coral-700 ring-paper">
            풀이는 끝났지만 결과를 같이 봐요.
          </p>
        ) : null}
      </header>

      {/* Options */}
      <section className="space-y-3">
        {options.map((opt) => {
          const isFalse = opt.kind === "false";
          const choosers =
            (answersByOption.get(opt.id) ?? []).map((a) => {
              const m = memberByUserId.get(a.solver_user_id);
              return { userId: a.solver_user_id, name: memberDisplayName(m) };
            });
          return (
            <Card
              key={opt.id}
              className={cn(
                "p-4",
                isFalse
                  ? "ring-2 ring-coral-300 bg-coral-50/40"
                  : "ring-1 ring-mint-300/60",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold",
                    isFalse
                      ? "bg-coral-500 text-white"
                      : "bg-mint-300 text-mint-700",
                  )}
                  aria-hidden
                >
                  {isFalse ? "✕" : "✓"}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-pretty text-base font-semibold",
                      isFalse ? "text-coral-700" : "text-ink",
                    )}
                  >
                    {opt.text}
                  </p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                    {isFalse ? "가짜였어요" : "진짜"}
                  </p>
                  {choosers.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-ink-faint">
                        선택:
                      </span>
                      {choosers.map((c) => (
                        <div
                          key={c.userId}
                          className="flex items-center gap-1.5"
                        >
                          <AvatarDot seed={c.userId} label={c.name} size="sm" />
                          <span className="text-xs font-semibold text-ink-soft">
                            {c.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      {/* Stats */}
      {accuracy != null ? (
        <section>
          <Card className="grid grid-cols-2 gap-2 p-4">
            <Stat label="정답률" value={`${accuracy}%`} tone="mint" />
            <Stat label="속임률" value={`${foolRate}%`} tone="coral" />
          </Card>
        </section>
      ) : null}

      {/* Reasons from solvers */}
      {answers.length > 0 ? (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
            가족이 적은 이유
          </h2>
          <div className="mt-3 space-y-3">
            {answers.map((a) => {
              const m = memberByUserId.get(a.solver_user_id);
              const name = memberDisplayName(m);
              return (
                <Card key={a.id} className="flex items-start gap-3 p-4">
                  <AvatarDot seed={a.solver_user_id} label={name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink">{name}</span>
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          a.is_correct
                            ? "bg-mint-50 text-mint-700"
                            : "bg-coral-50 text-coral-700",
                        )}
                      >
                        {a.is_correct ? "맞춤" : "속음"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">
                      {a.reason_text || "이유는 적지 않았어요."}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* AI comment */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          AI 코멘트
        </h2>
        {aiComment ? (
          <Card className="mt-3 bg-grape-50/40 p-5">
            <p className="text-pretty text-sm leading-relaxed text-ink">
              {aiComment.text}
            </p>
          </Card>
        ) : (
          <Card className="mt-3 p-5">
            <p className="text-sm text-ink-soft">
              AI가 코멘트를 정리하고 있어요…
            </p>
            <RefreshLink quizId={id} />
          </Card>
        )}

        {followUpQuestions.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              진짜 하루 질문
            </p>
            <div className="flex flex-wrap gap-2">
              {followUpQuestions.map((q, i) => (
                <FollowUpQuestionChip key={i} question={q} />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* User comments */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          가족 한마디 · {userComments.length}
        </h2>
        {userComments.length > 0 ? (
          <div className="mt-3 space-y-2">
            {userComments.map((c) => {
              const m = c.author_user_id
                ? memberByUserId.get(c.author_user_id)
                : null;
              const name = memberDisplayName(m);
              return (
                <Card
                  key={c.id}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <AvatarDot
                    seed={c.author_user_id ?? c.id}
                    label={name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-ink">{name}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">{c.text}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-faint">
            아직 한마디가 없어요. 가장 먼저 남겨 보세요.
          </p>
        )}

        <div className="mt-4">
          <CommentComposer quizId={id} />
        </div>
      </section>

      <div className="flex items-center justify-center pt-2">
        <Link
          href="/home"
          className="text-sm font-semibold text-ink-soft hover:text-ink"
        >
          ← 홈으로
        </Link>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "mint" | "coral";
}) {
  const colors =
    tone === "mint"
      ? "bg-mint-50 text-mint-700"
      : "bg-coral-50 text-coral-700";
  return (
    <div className={cn("rounded-2xl px-3 py-3 ring-paper", colors)}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function RefreshLink({ quizId }: { quizId: string }) {
  return (
    <Link
      href={`/quiz/${quizId}/result`}
      className="mt-3 inline-block text-xs font-semibold text-coral-600 hover:underline"
    >
      새로고침
    </Link>
  );
}
