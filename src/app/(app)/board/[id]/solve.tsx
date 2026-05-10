"use client";

import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { rpc } from "@/lib/supabase/rpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Attempt = { chosen_index: number; is_correct: boolean } | null;

export function SolveBoardPost({
  postId,
  options,
  myAttempt,
  myUpvoteId,
  upvoteCount,
  solveAccuracy,
  attemptCount,
}: {
  postId: string;
  options: { text: string }[];
  myAttempt: Attempt;
  myUpvoteId: string | null;
  upvoteCount: number;
  solveAccuracy: number | null;
  attemptCount: number;
}) {
  const [chosen, setChosen] = useState<number | null>(myAttempt?.chosen_index ?? null);
  const [revealed, setRevealed] = useState<Attempt>(myAttempt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [upCount, setUpCount] = useState(upvoteCount);
  const [upvoteId, setUpvoteId] = useState<string | null>(myUpvoteId);
  const [revealedFalseIndex, setRevealedFalseIndex] = useState<number | null>(
    myAttempt ? null : null,
  );

  function submit(index: number) {
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error: rpcError } = await rpc<
        { is_correct: boolean; false_option_index: number }[]
      >(supabase, "solve_public_post", {
        p_post_id: postId,
        p_chosen_index: index,
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      const row = data?.[0];
      if (!row) {
        setError("결과를 가져오지 못했어요.");
        return;
      }
      setRevealed({ chosen_index: index, is_correct: row.is_correct });
      setRevealedFalseIndex(row.false_option_index);
    });
  }

  async function toggleUpvote() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return;
    if (upvoteId) {
      const { error: delErr } = await supabase
        .from("public_upvote")
        .delete()
        .eq("id", upvoteId);
      if (delErr) {
        setError(delErr.message);
        return;
      }
      setUpvoteId(null);
      setUpCount((c) => Math.max(0, c - 1));
    } else {
      const insRes = await supabase
        .from("public_upvote")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ post_id: postId, voter_user_id: userRes.user.id } as any)
        .select("id")
        .maybeSingle();
      if (insRes.error) {
        setError(insRes.error.message);
        return;
      }
      setUpvoteId((insRes.data as { id: string } | null)?.id ?? null);
      setUpCount((c) => c + 1);
    }
  }

  const isRevealed = revealed != null;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {options.map((o, i) => {
          const picked = chosen === i;
          const isFalse = isRevealed && revealedFalseIndex === i;
          const isMyChoice = isRevealed && revealed?.chosen_index === i;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={isRevealed || isPending}
                onClick={() => {
                  if (isRevealed) return;
                  setChosen(i);
                  submit(i);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[var(--radius-card)] bg-white/80 p-4 text-left text-sm transition ring-paper",
                  picked && !isRevealed ? "ring-2 ring-ink" : "",
                  isFalse ? "bg-coral-50 ring-2 ring-coral-500" : "",
                  isRevealed && !isFalse ? "bg-mint-50" : "",
                  isPending ? "opacity-60" : "",
                )}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-paper text-[12px] font-bold text-ink-soft">
                  {i + 1}
                </span>
                <span className="flex-1 text-ink">{o.text}</span>
                {isRevealed ? (
                  <span className="text-lg">{isFalse ? "🎯" : "✓"}</span>
                ) : null}
                {isMyChoice && !isFalse ? (
                  <span className="text-[10px] text-ink-soft">내 선택</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <div className="rounded-2xl bg-coral-50 px-4 py-3 text-sm text-coral-700">
          {error}
        </div>
      ) : null}

      {isRevealed ? (
        <div className="rounded-[var(--radius-card)] bg-paper-soft px-4 py-3 text-sm text-ink-soft">
          {revealed?.is_correct ? "🎯 가짜를 맞혔어요." : "🤔 다음 가족엔 더 잘 맞힐 수 있어요."}
          {solveAccuracy != null ? (
            <span className="ml-1 text-ink-faint">
              · {attemptCount}명이 도전, {Math.round(solveAccuracy * 100)}%가 정답
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="pt-1">
        <Button onClick={toggleUpvote} variant={upvoteId ? "primary" : "secondary"} size="sm">
          👍 {upCount}
        </Button>
      </div>
    </div>
  );
}
