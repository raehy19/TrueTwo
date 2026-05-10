"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rpc } from "@/lib/supabase/rpc";
import type { Database } from "@/lib/supabase/types";

type QuizRow = Database["public"]["Tables"]["quiz"]["Row"];

export type CreateQuizInput = {
  true_1: string;
  true_2: string;
  false_text: string;
  false_source_llm: string | null;
  false_edited: boolean;
  difficulty: 1 | 2 | 3 | 4;
  is_backlog: boolean;
};

export type CreateQuizResult =
  | { ok: true; quiz_id: string }
  | { ok: false; message: string };

const friendly: Record<string, string> = {
  TODAY_ALREADY_EXISTS: "오늘 진진거를 이미 등록했어요.",
  BACKLOG_ALREADY_EXISTS: "어제 진진거를 이미 등록했어요.",
  NO_FAMILY: "가족이 없어요. 먼저 가입해 주세요.",
  AUTH_REQUIRED: "다시 로그인해 주세요.",
};

function describe(rawMessage: string | undefined, fallback: string): string {
  if (!rawMessage) return fallback;
  const code = rawMessage.replace(/^.*?:\s*/, "").trim();
  return friendly[code] ?? fallback;
}

function validateLength(text: string): string | null {
  const len = text.trim().length;
  if (len < 5) return "5자 이상 적어 주세요.";
  if (len > 200) return "200자 이내로 적어 주세요.";
  return null;
}

export async function createQuizAction(
  input: CreateQuizInput,
): Promise<CreateQuizResult> {
  const true1Err = validateLength(input.true_1);
  if (true1Err) return { ok: false, message: `진짜 1: ${true1Err}` };
  const true2Err = validateLength(input.true_2);
  if (true2Err) return { ok: false, message: `진짜 2: ${true2Err}` };
  const falseErr = validateLength(input.false_text);
  if (falseErr) return { ok: false, message: `가짜: ${falseErr}` };

  if (![1, 2, 3, 4].includes(input.difficulty)) {
    return { ok: false, message: "난이도가 올바르지 않아요." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await rpc<QuizRow>(supabase, "create_quiz", {
    p_true_1: input.true_1.trim(),
    p_true_2: input.true_2.trim(),
    p_false: input.false_text.trim(),
    p_false_source_llm: input.false_source_llm,
    p_false_edited: input.false_edited,
    p_difficulty: input.difficulty,
    p_is_backlog: input.is_backlog,
  });

  if (error) {
    return {
      ok: false,
      message: describe(error.message, "등록에 실패했어요. 잠시 뒤 다시 시도해 주세요."),
    };
  }

  if (!data?.id) {
    return { ok: false, message: "등록에 실패했어요. 잠시 뒤 다시 시도해 주세요." };
  }

  revalidatePath("/home");
  return { ok: true, quiz_id: data.id };
}
