import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/app-shell/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="relative mx-auto min-h-dvh max-w-md bg-paper pb-28">
      <main className="px-6 pt-8">{children}</main>
      <BottomNav />
      <Link
        href="/quiz/new"
        className="sr-only"
      >
        진진거 올리기 바로가기
      </Link>
    </div>
  );
}
