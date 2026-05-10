import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LandingPage() {
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
    if (member) redirect("/home");
    redirect("/onboarding");
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-16">
      <header className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight text-ink-soft">
          진진거
        </span>
        <Link
          href="/login"
          className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          로그인
        </Link>
      </header>

      <section className="mt-14 flex flex-1 flex-col">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-coral-100 px-3 py-1 text-xs font-medium text-coral-700">
          <span aria-hidden>🔍</span>
          매일 한 명, 한 줄, 한 가짜
        </span>

        <h1 className="mt-5 text-balance font-display text-[40px] font-bold leading-[1.05] tracking-tight text-ink">
          가족의 진짜 하루,
          <br />
          <span className="relative inline-block">
            <span className="relative z-10">거짓을 맞히면서</span>
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-1 z-0 h-3 bg-mustard-300/70"
            />
          </span>{" "}
          발견해요.
        </h1>

        <p className="mt-5 text-pretty text-base leading-relaxed text-ink-soft">
          진짜 일 2개와 가짜 1개. 오늘 가족이 누가 어떤 거짓말을 했는지
          맞혀보세요. AI가 가짜 후보를 제안하고, 마지막 살은 당신이 붙입니다.
        </p>

        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/login?mode=signup"
            className="flex h-14 items-center justify-center rounded-full bg-ink text-base font-semibold text-paper shadow-pop transition hover:bg-ink-soft active:scale-[0.99]"
          >
            가족과 시작하기
          </Link>
          <Link
            href="/login"
            className="flex h-14 items-center justify-center rounded-full bg-paper-soft text-base font-medium text-ink ring-paper transition hover:bg-paper-edge"
          >
            이미 계정이 있어요
          </Link>
        </div>

        <div className="mt-14 grid grid-cols-3 gap-3 text-center text-[11px] text-ink-faint">
          <Step n="1" t="진짜 2개" />
          <Step n="2" t="AI가 가짜 후보" />
          <Step n="3" t="가족이 맞히기" />
        </div>
      </section>

      <footer className="pt-10 text-center text-[11px] text-ink-faint">
        가족이 거짓을 찾는 척하면서 서로의 진짜 하루를 발견하게.
      </footer>
    </main>
  );
}

function Step({ n, t }: { n: string; t: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-paper-soft px-2 py-3 ring-paper">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-paper text-[12px] font-semibold text-ink">
        {n}
      </span>
      <span className="text-[11px] font-medium text-ink-soft">{t}</span>
    </div>
  );
}
