import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: member } = await supabase
      .from("family_member")
      .select("family_id")
      .eq("user_id", user.id)
      .maybeSingle();
    redirect(member ? "/home" : "/onboarding");
  }

  const sp = await searchParams;
  const initialMode = sp.mode === "signup" ? "signup" : "signin";

  return (
    <div className="mt-10">
      <h1 className="text-pretty font-display text-3xl font-bold tracking-tight text-ink">
        가족과 진짜 하루를
        <br />
        주고받기
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        이메일 1개면 시작할 수 있어요. 가족 코드를 받았다면 가입한 뒤 입력하세요.
      </p>
      <div className="mt-8">
        <LoginForm initialMode={initialMode} />
      </div>
    </div>
  );
}
