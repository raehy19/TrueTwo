import { requireFamily } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AvatarDot } from "@/components/app-shell/avatar-dot";
import { signOutAction } from "@/app/(auth)/login/actions";
import { CodeShare } from "./code-share";
import { kstDateLabel } from "@/lib/kst";

type MemberRow = {
  member_id: string | null;
  user_id: string | null;
  display_name: string | null;
  nickname: string | null;
  role: "owner" | "member" | null;
  joined_at: string | null;
};

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const sp = await searchParams;
  const welcome = sp.welcome === "1";
  const { supabase, user, membership } = await requireFamily();

  const membersRes = await supabase
    .from("family_member_profile_v")
    .select("member_id, user_id, display_name, nickname, role, joined_at")
    .eq("family_id", membership.family_id)
    .order("joined_at", { ascending: true });
  const members = ((membersRes.data as MemberRow[] | null) ?? []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          {membership.family_name}
        </h1>
        <p className="text-xs text-ink-faint">
          가족 {members.length}명 · 1인 1가족
        </p>
      </header>

      {welcome ? (
        <Card className="bg-mustard-50 p-4 text-sm text-ink-soft">
          <p className="font-semibold text-ink">가족이 만들어졌어요!</p>
          <p className="mt-0.5">아래 코드를 가족에게 보내주세요.</p>
        </Card>
      ) : null}

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          가족 코드
        </h2>
        <div className="mt-3">
          <CodeShare code={membership.family_code} familyName={membership.family_name} />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          가족 구성원
        </h2>
        <div className="mt-3 space-y-2">
          {members.map((m) => {
            if (!m.user_id) return null;
            const name = m.nickname || m.display_name || "가족";
            return (
              <Card key={m.member_id ?? m.user_id} className="flex items-center gap-3 p-3">
                <AvatarDot seed={m.user_id} label={name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {name}
                    {m.user_id === user.id ? (
                      <span className="ml-2 rounded-full bg-paper-soft px-2 py-0.5 text-[10px] font-medium text-ink-faint">
                        나
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-ink-faint">
                    {m.role === "owner" ? "방장" : "멤버"} · 가입 {m.joined_at ? kstDateLabel(m.joined_at) : "—"}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="pt-2">
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            로그아웃
          </Button>
        </form>
      </section>
    </div>
  );
}
