import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { kstDateLabel } from "@/lib/kst";

type PostRow = {
  id: string | null;
  category: "legend" | "plausible" | "familylike" | "funny_wrong" | "warm" | null;
  options: { text: string }[] | null;
  upvote_count: number | null;
  comment_count: number | null;
  solve_attempt_count: number | null;
  solve_accuracy: number | null;
  published_at: string | null;
  author_family_hash: string | null;
};

const categoryMeta: Record<NonNullable<PostRow["category"]>, { label: string; emoji: string; tone: string }> = {
  legend: { label: "레전드", emoji: "🏆", tone: "bg-coral-100 text-coral-700" },
  plausible: { label: "그럴듯", emoji: "🤔", tone: "bg-paper-soft text-ink-soft" },
  familylike: { label: "가족다운", emoji: "👨‍👩‍👧", tone: "bg-mint-50 text-mint-700" },
  funny_wrong: { label: "웃긴 오답", emoji: "😂", tone: "bg-mustard-50 text-coral-700" },
  warm: { label: "따뜻한", emoji: "💗", tone: "bg-grape-50 text-grape-500" },
};

export default async function BoardPage() {
  const { supabase } = await requireUser();
  const postsRes = await supabase
    .from("public_post_safe_v")
    .select(
      "id, category, options, upvote_count, comment_count, solve_attempt_count, solve_accuracy, published_at, author_family_hash",
    )
    .order("published_at", { ascending: false })
    .limit(30);
  const posts = ((postsRes.data as PostRow[] | null) ?? []).filter((p) => p.id);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          남의 집 진진거
        </h1>
        <p className="text-xs text-ink-faint">
          익명으로 공유된 다른 가족의 진진거. 누가 거짓말 했는지 맞혀보세요.
        </p>
      </header>

      {posts.length === 0 ? (
        <Card className="p-6 text-center text-sm text-ink-soft">
          아직 공유된 진진거가 없어요. 가족 결과 화면에서 익명으로 공유할 수 있어요.
        </Card>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => {
            const opts = (post.options ?? []) as { text: string }[];
            const meta = post.category ? categoryMeta[post.category] : categoryMeta.plausible;
            const acc = post.solve_accuracy != null ? Math.round(post.solve_accuracy * 100) : null;
            return (
              <li key={post.id!}>
                <Link href={`/board/${post.id}`}>
                  <Card className="space-y-3 p-4 transition hover:-translate-y-0.5 hover:shadow-pop">
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}>
                        {meta.emoji} {meta.label}
                      </span>
                      <span className="text-[10px] text-ink-faint">
                        {post.published_at ? kstDateLabel(post.published_at) : ""}
                      </span>
                    </div>

                    <ul className="space-y-1.5">
                      {opts.slice(0, 3).map((o, i) => (
                        <li
                          key={i}
                          className="rounded-2xl bg-paper-soft px-3 py-2 text-sm text-ink ring-paper"
                        >
                          <span className="mr-2 inline-block h-5 w-5 rounded-full bg-paper text-center text-[11px] font-semibold leading-5 text-ink-soft">
                            {i + 1}
                          </span>
                          {o.text}
                        </li>
                      ))}
                    </ul>

                    <div className="flex items-center justify-between text-[11px] text-ink-faint">
                      <span>👍 {post.upvote_count ?? 0}</span>
                      <span>💬 {post.comment_count ?? 0}</span>
                      <span>
                        🎯 {post.solve_attempt_count ?? 0}명 시도{acc != null ? ` · ${acc}%` : ""}
                      </span>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
