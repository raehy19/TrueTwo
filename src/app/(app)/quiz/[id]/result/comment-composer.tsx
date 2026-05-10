"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea, FieldHint } from "@/components/ui/input";
import { postCommentAction, type CommentCategory } from "../play/actions";

const PRESETS = ["ㅋㅋㅋ", "ㅎㅎ 진짜?", "왜 그랬어?"];

const QUESTION_HEADS = [
  "왜",
  "어떻게",
  "뭐",
  "무엇",
  "언제",
  "어디",
  "누가",
  "누구",
  "어느",
];

function detectCategory(text: string): CommentCategory {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "other";

  // Question detection — starts with question word OR ends with ?
  if (trimmed.endsWith("?") || trimmed.endsWith("？")) return "question";
  for (const head of QUESTION_HEADS) {
    if (trimmed.startsWith(head)) return "question";
  }

  // Reaction detection — short, contains laughter / emojis / strong tone marks.
  const reactionPattern = /[ㅋㅎㅠㅜ!~]|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/u;
  if (trimmed.length <= 12 && reactionPattern.test(trimmed)) return "reaction";
  if (reactionPattern.test(trimmed) && trimmed.length <= 20) return "reaction";

  return "other";
}

export function CommentComposer({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const category = detectCategory(text);
  const remaining = 200 - text.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length === 0) {
      setError("댓글을 입력해 주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await postCommentAction(quizId, text, category);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setText("");
      router.refresh();
    });
  };

  const tone =
    category === "reaction"
      ? "bg-mustard-50 text-coral-700"
      : category === "question"
        ? "bg-grape-50 text-grape-500"
        : "bg-paper-soft text-ink-soft";

  const toneLabel =
    category === "reaction"
      ? "리액션"
      : category === "question"
        ? "질문"
        : "한마디";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() =>
              setText((prev) => (prev.length === 0 ? preset : prev))
            }
            className="rounded-full bg-paper-soft px-3 py-1.5 text-xs font-semibold text-ink-soft ring-paper hover:bg-paper-edge"
          >
            {preset}
          </button>
        ))}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 200))}
        placeholder="가족에게 한마디 남겨 보세요"
        maxLength={200}
      />
      <div className="flex items-center justify-between">
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${tone}`}
        >
          {toneLabel}
        </span>
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
        size="md"
        className="w-full"
        loading={pending}
        disabled={text.trim().length === 0}
      >
        댓글 남기기
      </Button>
    </form>
  );
}

export function FollowUpQuestionChip({ question }: { question: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(question);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-full bg-grape-50 px-3.5 py-2 text-xs font-semibold text-grape-500 ring-paper transition hover:bg-grape-300/40"
    >
      {copied ? "복사됐어요 ✓" : question}
    </button>
  );
}
