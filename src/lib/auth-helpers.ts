import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FamilyMembership = {
  family_id: string;
  family_name: string;
  family_code: string;
  role: "owner" | "member";
  nickname: string | null;
};

type FamilyMemberRow = {
  family_id: string;
  role: "owner" | "member";
  nickname: string | null;
};
type FamilyRow = { name: string; code: string };

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function requireFamily() {
  const { supabase, user } = await requireUser();
  const memberRes = await supabase
    .from("family_member")
    .select("family_id, role, nickname")
    .eq("user_id", user.id)
    .maybeSingle();

  const member = memberRes.data as FamilyMemberRow | null;
  if (memberRes.error || !member) redirect("/onboarding");

  const familyRes = await supabase
    .from("family")
    .select("name, code")
    .eq("id", member.family_id)
    .maybeSingle();

  const family = familyRes.data as FamilyRow | null;
  if (!family) redirect("/onboarding");

  const membership: FamilyMembership = {
    family_id: member.family_id,
    family_name: family.name,
    family_code: family.code,
    role: member.role,
    nickname: member.nickname,
  };
  return { supabase, user, membership };
}
