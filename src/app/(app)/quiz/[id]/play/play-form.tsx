"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea, FieldHint } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { submitAnswerAction } from "./actions";

type PlayOption = { id: string; position: number; text: string };

export function PlayForm({
  quizId,
  options,
  authorName,
}: {
  quizId: string;
  options: PlayOption[];
  authorName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) {
      setError("가짜 같은 옵션을 하나 골라 주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitAnswerAction(quizId, chosen, reason);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/quiz/${quizId}/result`);
      router.refresh();
    });
  };

  const remaining = 80 - reason.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          {authorName}의 진진거
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          이 중에 하나는 가짜예요. 골라 보세요.
        </h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          진짜 2개 · 가짜 1개. 가족이 다 풀거나 24시간 뒤에 결과가 공개돼요.
        </p>
      </div>

      <div className="space-y-3">
        {options.map((opt, idx) => {
          const selected = chosen === opt.id;
          return (
            <button
              type="button"
              key={opt.id}
              onClick={() => setChosen(opt.id)}
              className="block w-full text-left"
              aria-pressed={selected}
            >
              <Card
                className={cn(
                  "flex items-start gap-4 p-4 transition",
                  selected
                    ? "ring-2 ring-ink shadow-pop"
                    : "hover:-translate-y-0.5",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-grid h-6 w-6 shrink-0 place-items-center rounded-full ring-paper text-[11px] font-bold",
                    selected
                      ? "bg-ink text-paper"
                      : "bg-paper-soft text-ink-faint",
                  )}
                  aria-hidden
                >
                  {String.fromCharCode(65 + idx)}
                </span>
                <p className="text-pretty text-base font-medium text-ink">
                  {opt.text}
                </p>
              </Card>
            </button>
          );
        })}
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          왜 이게 가짜라고 생각했나요? (선택)
        </label>
        <Textarea
          className="mt-2"
          maxLength={80}
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 80))}
          placeholder="예: 이건 너무 그럴듯해서 오히려 의심됨"
        />
        <FieldHint tone={remaining < 0 ? "error" : "neutral"}>
          {remaining}자 남음
        </FieldHint>
      </div>

      {error ? (
        <div className="rounded-2xl bg-coral-50 px-4 py-3 text-sm font-medium text-coral-700 ring-paper">
          {error}
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={pending}
        disabled={!chosen}
      >
        제출하기
      </Button>
    </form>
  );
}
