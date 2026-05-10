"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rpc } from "@/lib/supabase/rpc";

export type OnboardingState = {
  status: "idle" | "error";
  message?: string;
};

const friendly: Record<string, string> = {
  AUTH_REQUIRED: "다시 로그인해 주세요.",
  ALREADY_IN_FAMILY: "이미 가족에 가입되어 있어요.",
  FAMILY_NOT_FOUND: "그런 가족 코드를 찾을 수 없어요. 다시 확인해 주세요.",
  FAMILY_FULL: "이 가족은 이미 정원(8명)이 가득 찼어요.",
  CODE_GENERATION_FAILED: "코드 생성에 실패했어요. 다시 시도해 주세요.",
};

function describe(rawMessage: string | undefined, fallback: string): string {
  if (!rawMessage) return fallback;
  const code = rawMessage.replace(/^.*?:\s*/, "").trim();
  return friendly[code] ?? fallback;
}

export async function createFamilyAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 20) {
    return { status: "error", message: "가족 이름은 1~20자로 적어 주세요." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await rpc(supabase, "create_family", { p_name: name });
  if (error) {
    return {
      status: "error",
      message: describe(error.message, "가족 만들기에 실패했어요."),
    };
  }
  revalidatePath("/", "layout");
  redirect("/family?welcome=1");
}

export async function joinFamilyAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const code = String(formData.get("code") ?? "")
    .toUpperCase()
    .replace(/\s/g, "");
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    return {
      status: "error",
      message: "가족 코드는 영문 대문자(I, O 제외)와 숫자(0, 1 제외) 6자리예요.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await rpc(supabase, "join_family", { p_code: code });
  if (error) {
    return {
      status: "error",
      message: describe(error.message, "가족 가입에 실패했어요."),
    };
  }
  revalidatePath("/", "layout");
  redirect("/home?joined=1");
}
