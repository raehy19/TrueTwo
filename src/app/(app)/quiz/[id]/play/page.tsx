import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireFamily } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AvatarDot } from "@/components/app-shell/avatar-dot";
import { kstDateLabel, kstTimeLabel, timeUntil } from "@/lib/kst";
import { PlayForm } from "./play-form";
import { revealNowAction } from "./actions";

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
type SafeOptionRow = {
  id: string | null;
  quiz_id: string | null;
  position: number | null;
  text: string | null;
};
type AnswerRow = { id: string; chosen_option_id: string; reason_text: string | null };
type MemberRow = {
  user_id: string | null;
  display_name: string | null;
  nickname: string | null;
};

// Deterministic shuffle by quiz id so all family members see the same order.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stableShuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  const rand = mulberry32(hashSeed(seed));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default async function QuizPlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, membership } = await requireFamily();

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

  const now = Date.now();
  const revealMs = new Date(quiz.reveal_at).getTime();
  if (quiz.status === "revealed" || now >= revealMs) {
    redirect(`/quiz/${id}/result`);
  }

  // Author cannot answer their own quiz.
  if (quiz.author_user_id === user.id) {
    return <AuthorView quizId={id} revealAt={quiz.reveal_at} />;
  }

  // Already submitted?
  const { data: existingAnswer } = await supabase
    .from("answer")
    .select("id, chosen_option_id, reason_text")
    .eq("quiz_id", id)
    .eq("solver_user_id", user.id)
    .maybeSingle();

  if (existingAnswer) {
    const answer = existingAnswer as AnswerRow;
    // Load all options to highlight chosen — but only safe view (no kind exposed).
    const { data: optionsData } = await supabase
      .from("quiz_option_safe_v")
      .select("id, quiz_id, position, text")
      .eq("quiz_id", id);
    const safeOpts = ((optionsData as SafeOptionRow[] | null) ?? [])
      .filter((o): o is SafeOptionRow & { id: string; text: string; position: number } =>
        Boolean(o.id) && Boolean(o.text) && o.position != null,
      )
      .map((o) => ({ id: o.id, position: o.position, text: o.text }));
    const ordered = stableShuffle(safeOpts, id);

    return (
      <AlreadyAnsweredView
        quizId={id}
        revealAt={quiz.reveal_at}
        chosenId={answer.chosen_option_id}
        reasonText={answer.reason_text}
        options={ordered}
      />
    );
  }

  // Author display name lookup
  const { data: authorRow } = await supabase
    .from("family_member_profile_v")
    .select("user_id, display_name, nickname")
    .eq("family_id", membership.family_id)
    .eq("user_id", quiz.author_user_id)
    .maybeSingle();
  const authorMember = authorRow as MemberRow | null;
  const authorName =
    authorMember?.nickname || authorMember?.display_name || "가족";

  const { data: optionsData } = await supabase
    .from("quiz_option_safe_v")
    .select("id, quiz_id, position, text")
    .eq("quiz_id", id);

  const safeOpts = ((optionsData as SafeOptionRow[] | null) ?? [])
    .filter((o): o is SafeOptionRow & { id: string; text: string; position: number } =>
      Boolean(o.id) && Boolean(o.text) && o.position != null,
    )
    .map((o) => ({ id: o.id, position: o.position, text: o.text }));

  if (safeOpts.length < 3) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-8">
        <Card className="p-5">
          <p className="text-base font-semibold text-ink">
            진진거 데이터를 불러오지 못했어요.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            잠시 후 다시 시도해 주세요.
          </p>
          <Link
            href="/home"
            className="mt-4 inline-block text-sm font-semibold text-coral-600"
          >
            ← 홈으로
          </Link>
        </Card>
      </main>
    );
  }

  const ordered = stableShuffle(safeOpts, id);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-8">
      <PlayForm quizId={id} options={ordered} authorName={authorName} />
    </main>
  );
}

function AuthorView({ quizId, revealAt }: { quizId: string; revealAt: string }) {
  const t = timeUntil(revealAt);
  return (
    <main className="mx-auto w-full max-w-md px-6 py-8">
      <Card className="p-6">
        <span className="inline-block rounded-full bg-mustard-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-coral-700">
          출제자 안내
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold text-ink">
          내 진진거는 풀 수 없어요.
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          가족이 다 풀거나 {kstTimeLabel(revealAt)}이 되면 결과가 공개돼요.
          기다리지 않고 지금 바로 공개할 수도 있어요.
        </p>
        <p className="mt-3 text-xs font-semibold text-ink-faint">
          {t.label}
        </p>

        <form
          action={async () => {
            "use server";
            const res = await revealNowAction(quizId);
            if (res.ok) {
              redirect(`/quiz/${quizId}/result`);
            }
          }}
          className="mt-5 space-y-3"
        >
          <Button type="submit" size="lg" variant="primary" className="w-full">
            지금 결과 공개
          </Button>
        </form>

        <Link
          href="/home"
          className="mt-4 block text-center text-sm font-semibold text-ink-soft hover:text-ink"
        >
          ← 홈으로
        </Link>
      </Card>
    </main>
  );
}

function AlreadyAnsweredView({
  quizId,
  revealAt,
  chosenId,
  reasonText,
  options,
}: {
  quizId: string;
  revealAt: string;
  chosenId: string;
  reasonText: string | null;
  options: { id: string; position: number; text: string }[];
}) {
  const t = timeUntil(revealAt);
  return (
    <main className="mx-auto w-full max-w-md px-6 py-8 space-y-5">
      <Card className="p-6">
        <span className="inline-block rounded-full bg-mint-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-mint-700">
          제출 완료
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold text-ink">
          이미 풀었어요.
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          결과는 가족이 다 풀거나 {kstDateLabel(revealAt)} {kstTimeLabel(revealAt)}에
          공개돼요.
        </p>
        <p className="mt-3 text-xs font-semibold text-ink-faint">{t.label}</p>
      </Card>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          내 선택
        </p>
        <div className="mt-3 space-y-3">
          {options.map((opt, idx) => {
            const isChosen = opt.id === chosenId;
            return (
              <Card
                key={opt.id}
                className={
                  isChosen
                    ? "flex items-start gap-4 p-4 ring-2 ring-ink shadow-pop"
                    : "flex items-start gap-4 p-4 opacity-60"
                }
              >
                <span
                  className={
                    "mt-0.5 inline-grid h-6 w-6 shrink-0 place-items-center rounded-full ring-paper text-[11px] font-bold " +
                    (isChosen ? "bg-ink text-paper" : "bg-paper-soft text-ink-faint")
                  }
                >
                  {String.fromCharCode(65 + idx)}
                </span>
                <p className="text-pretty text-base font-medium text-ink">
                  {opt.text}
                </p>
              </Card>
            );
          })}
        </div>
      </div>

      {reasonText ? (
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
            내가 적은 이유
          </p>
          <p className="mt-2 text-sm font-medium text-ink">{reasonText}</p>
        </Card>
      ) : null}

      <div className="flex items-center justify-center gap-2">
        <AvatarDot seed={quizId} label="결과" size="sm" />
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
