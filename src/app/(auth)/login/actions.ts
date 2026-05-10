"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = {
  status: "idle" | "error";
  message?: string;
};

const friendly: Record<string, string> = {
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않아요.",
  email_not_confirmed: "이메일 확인이 필요해요.",
  user_already_exists: "이미 가입된 이메일이에요. 로그인해 주세요.",
  weak_password: "비밀번호는 8자 이상이어야 해요.",
};

function translate(code: string | null, fallback: string): string {
  if (!code) return fallback;
  return friendly[code] ?? fallback;
}

async function nextRouteAfterAuth(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";
  const { data: member } = await supabase
    .from("family_member")
    .select("family_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return member ? "/home" : "/onboarding";
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { status: "error", message: "이메일과 비밀번호를 모두 입력해 주세요." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      status: "error",
      message: translate(error.code ?? null, error.message ?? "로그인 실패"),
    };
  }

  const next = await nextRouteAfterAuth();
  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email.includes("@")) {
    return { status: "error", message: "올바른 이메일 형식을 입력해 주세요." };
  }
  if (password.length < 8) {
    return { status: "error", message: "비밀번호는 8자 이상이어야 해요." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: email.split("@")[0] },
    },
  });
  if (error) {
    return {
      status: "error",
      message: translate(error.code ?? null, error.message ?? "가입 실패"),
    };
  }

  // 이메일 인증이 비활성화되어 있다면 자동으로 세션이 생성됨.
  // 비활성화 안 됐으면 로그인 시도로 강제 세션 발급.
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    await supabase.auth.signInWithPassword({ email, password });
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
