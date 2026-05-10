import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { kstDateLabel } from "@/lib/kst";
import { SolveBoardPost } from "./solve";

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

type CommentRow = {
  id: string;
  text: string;
  created_at: string;
  author_user_id: string;
};

export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  const postRes = await supabase
    .from("public_post_safe_v")
    .select(
      "id, category, options, upvote_count, comment_count, solve_attempt_count, solve_accuracy, published_at, author_family_hash",
    )
    .eq("id", id)
    .maybeSingle();
  const post = postRes.data as PostRow | null;
  if (!post || !post.id) notFound();

  const [commentsRes, attemptRes, upvoteRes] = await Promise.all([
    supabase
      .from("public_comment")
      .select("id, text, created_at, author_user_id")
      .eq("post_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("public_solve_attempt")
      .select("chosen_index, is_correct")
      .eq("post_id", id)
      .eq("solver_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("public_upvote")
      .select("id")
      .eq("post_id", id)
      .eq("voter_user_id", user.id)
      .maybeSingle(),
  ]);
  const comments = ((commentsRes.data as CommentRow[] | null) ?? []);
  const myAttempt = attemptRes.data as
    | { chosen_index: number; is_correct: boolean }
    | null;
  const myUpvoteId = (upvoteRes.data as { id: string } | null)?.id ?? null;

  const opts = (post.options ?? []) as { text: string }[];

  return (
    <div className="space-y-5">
      <Link href="/board" className="text-xs font-semibold text-ink-soft">
        ← 게시판
      </Link>
      <header>
        <span className="rounded-full bg-paper-soft px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
          {post.published_at ? kstDateLabel(post.published_at) : ""}
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">
          이 가족의 진짜는?
        </h1>
        <p className="mt-1 text-xs text-ink-faint">
          진짜 2개, 가짜 1개. 가짜를 골라 보세요.
        </p>
      </header>

      <SolveBoardPost
        postId={post.id!}
        options={opts}
        myAttempt={myAttempt}
        myUpvoteId={myUpvoteId}
        upvoteCount={post.upvote_count ?? 0}
        solveAccuracy={post.solve_accuracy}
        attemptCount={post.solve_attempt_count ?? 0}
      />

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          댓글 {comments.length}
        </h2>
        <ul className="mt-3 space-y-2">
          {comments.map((c) => (
            <Card key={c.id} className="p-3 text-sm text-ink-soft">
              {c.text}
              <p className="mt-1 text-[10px] text-ink-faint">
                {kstDateLabel(c.created_at)}
              </p>
            </Card>
          ))}
        </ul>
      </section>
    </div>
  );
}
