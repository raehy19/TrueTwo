"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rpc } from "@/lib/supabase/rpc";

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

const friendly: Record<string, string> = {
  AUTH_REQUIRED: "다시 로그인해 주세요.",
  AUTHOR_CANNOT_ANSWER: "내 진진거는 풀 수 없어요.",
  QUIZ_NOT_OPEN: "이미 결과가 공개된 진진거예요.",
  QUIZ_NOT_FOUND: "진진거를 찾을 수 없어요.",
  OPTION_NOT_IN_QUIZ: "선택지가 올바르지 않아요. 새로고침해 주세요.",
  NOT_FAMILY_MEMBER: "이 가족의 진진거가 아니에요.",
  ONLY_AUTHOR_CAN_REVEAL: "출제자만 결과를 공개할 수 있어요.",
};

function describe(rawMessage: string | undefined, fallback: string): string {
  if (!rawMessage) return fallback;
  const code = rawMessage.replace(/^.*?:\s*/, "").trim();
  return friendly[code] ?? fallback;
}

export async function submitAnswerAction(
  quizId: string,
  chosenOptionId: string,
  reasonText: string,
): Promise<ActionResult> {
  if (!quizId || !chosenOptionId) {
    return { ok: false, message: "선택지를 골라 주세요." };
  }
  const trimmed = reasonText.trim();
  if (trimmed.length > 80) {
    return { ok: false, message: "이유는 80자 이내로 적어 주세요." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await rpc(supabase, "submit_answer", {
    p_quiz_id: quizId,
    p_chosen_option_id: chosenOptionId,
    p_reason_text: trimmed.length > 0 ? trimmed : null,
  });

  if (error) {
    return {
      ok: false,
      message: describe(error.message, "제출에 실패했어요. 잠시 뒤 다시 시도해 주세요."),
    };
  }

  revalidatePath(`/quiz/${quizId}/play`);
  revalidatePath(`/quiz/${quizId}/result`);
  revalidatePath("/home");
  return { ok: true };
}

export async function revealNowAction(quizId: string): Promise<ActionResult> {
  if (!quizId) return { ok: false, message: "잘못된 요청입니다." };

  const supabase = await createSupabaseServerClient();
  const { error } = await rpc(supabase, "reveal_quiz_now", {
    p_quiz_id: quizId,
  });

  if (error) {
    return {
      ok: false,
      message: describe(error.message, "결과 공개에 실패했어요. 잠시 뒤 다시 시도해 주세요."),
    };
  }

  revalidatePath(`/quiz/${quizId}/play`);
  revalidatePath(`/quiz/${quizId}/result`);
  revalidatePath("/home");
  return { ok: true };
}

export type CommentCategory = "reaction" | "question" | "other";

export async function postCommentAction(
  quizId: string,
  text: string,
  category: CommentCategory,
): Promise<ActionResult> {
  const trimmed = text.trim();
  if (trimmed.length < 1) {
    return { ok: false, message: "댓글을 입력해 주세요." };
  }
  if (trimmed.length > 200) {
    return { ok: false, message: "댓글은 200자 이내로 적어 주세요." };
  }
  if (!["reaction", "question", "other"].includes(category)) {
    return { ok: false, message: "댓글 분류가 올바르지 않아요." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "다시 로그인해 주세요." };
  }

  const insertPayload = {
    quiz_id: quizId,
    author_user_id: user.id,
    kind: "user" as const,
    category,
    category_source: "heuristic" as const,
    text: trimmed,
  };
  // Supabase generated generics require an exact `Insert` shape per table;
  // since our condensed `Database` type doesn't expose that here, cast the
  // builder to a permissive shape — runtime is unchanged.
  const { error } = await (
    supabase.from("comment") as unknown as {
      insert: (
        v: typeof insertPayload,
      ) => Promise<{ error: { message: string } | null }>;
    }
  ).insert(insertPayload);

  if (error) {
    return {
      ok: false,
      message: describe(error.message, "댓글을 남기지 못했어요. 잠시 뒤 다시 시도해 주세요."),
    };
  }

  revalidatePath(`/quiz/${quizId}/result`);
  return { ok: true };
}
