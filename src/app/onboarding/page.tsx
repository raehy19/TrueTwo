import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingTabs } from "./tabs";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; tab?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("family_member")
    .select("family_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (member) redirect("/home");

  const sp = await searchParams;
  const initialCode = (sp.code ?? "").toUpperCase().slice(0, 6);
  const initialTab: "create" | "join" =
    sp.tab === "join" || initialCode ? "join" : "create";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-12">
      <header className="text-sm font-semibold tracking-tight text-ink-soft">
        진진거
      </header>
      <div className="mt-10 space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          가족을 만들거나
          <br />
          기존 가족에 들어와요.
        </h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          한 사람은 한 가족에만 속할 수 있어요. 가족 코드는 6자리예요.
        </p>
      </div>
      <div className="mt-8">
        <OnboardingTabs initialCode={initialCode} initialTab={initialTab} />
      </div>
    </main>
  );
}
