import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAnthropic, LLM_MODEL } from "@/lib/anthropic";
import { env, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `당신은 한국 가족 데일리 게임 "진진거"의 결과 해설가다.
규칙:
- 출력은 200자 이내의 한국어 한 단락이다.
- 누가 무엇을 골랐는지 부드럽게 요약한다. 비방·조롱·외모·정치·종교 단정 표현 금지.
- 톤은 다정하고 살짝 위트 있게.
- 마지막에 진짜였던 옵션 2개에 대해 가족이 이어서 물어볼 만한 짧은 후속 질문 2개를
  각 줄에 "• 질문?" 형태로 덧붙인다.
- JSON, 코드블록, 헤더 금지. 사용자에게 직접 보여줄 텍스트만 출력.`;

type QuizRow = Database["public"]["Tables"]["quiz"]["Row"];

type RevealedOption = {
  id: string;
  position: number;
  text: string;
  kind: "true" | "false";
};

type AnswerWithSolver = {
  solver_user_id: string;
  chosen_option_id: string;
  reason_text: string | null;
  is_correct: boolean;
};

type MemberRow = {
  user_id: string | null;
  display_name: string | null;
  nickname: string | null;
};

const FALLBACK_TEXT =
  "오늘도 가족이 한 발씩 더 가까워졌어요. 진짜 둘에 대해 한 마디씩 더 나눠 봐요.\n• 그 일은 어떻게 시작했어?\n• 그때 기분이 어땠어?";

function memberLabel(
  m: MemberRow | undefined,
  fallback = "가족",
): string {
  if (!m) return fallback;
  return m.nickname || m.display_name || fallback;
}

export async function POST(request: Request) {
  // Auth check via SSR cookie-bound client.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const obj = (body ?? {}) as Record<string, unknown>;
  const quizId = obj.quiz_id;
  if (typeof quizId !== "string" || quizId.length === 0) {
    return NextResponse.json(
      { ok: false, message: "quiz_id가 필요해요." },
      { status: 400 },
    );
  }

  // Membership check via the user-bound client (RLS).
  const quizRes = await supabase
    .from("quiz")
    .select("id, family_id, author_user_id, day_label, status")
    .eq("id", quizId)
    .maybeSingle();
  const quiz = quizRes.data as Pick<
    QuizRow,
    "id" | "family_id" | "author_user_id" | "day_label" | "status"
  > | null;
  if (!quiz) {
    return NextResponse.json(
      { ok: false, message: "진진거를 찾을 수 없어요." },
      { status: 404 },
    );
  }
  if (quiz.status !== "revealed") {
    return NextResponse.json(
      { ok: false, message: "아직 결과가 공개되지 않았어요." },
      { status: 400 },
    );
  }

  // If a comment already exists, return it.
  const existingRes = await supabase
    .from("comment")
    .select("text")
    .eq("quiz_id", quizId)
    .eq("kind", "ai")
    .maybeSingle();
  const existing = existingRes.data as { text: string } | null;
  if (existing?.text) {
    return NextResponse.json({ ok: true, text: existing.text });
  }

  // Load options + answers + members for prompt context.
  const [optionsRes, answersRes, membersRes] = await Promise.all([
    supabase
      .from("quiz_option_revealed_v")
      .select("id, position, text, kind")
      .eq("quiz_id", quizId),
    supabase
      .from("answer")
      .select("solver_user_id, chosen_option_id, reason_text, is_correct")
      .eq("quiz_id", quizId),
    supabase
      .from("family_member_profile_v")
      .select("user_id, display_name, nickname")
      .eq("family_id", quiz.family_id),
  ]);

  const optionRows = (optionsRes.data ?? []) as Array<{
    id: string | null;
    position: number | null;
    text: string | null;
    kind: "true" | "false" | null;
  }>;
  const options: RevealedOption[] = optionRows
    .filter(
      (o): o is { id: string; position: number; text: string; kind: "true" | "false" } =>
        Boolean(o.id) &&
        Boolean(o.text) &&
        o.position != null &&
        (o.kind === "true" || o.kind === "false"),
    )
    .sort((a, b) => a.position - b.position);

  if (options.length < 3) {
    return NextResponse.json(
      { ok: false, message: "옵션 데이터를 불러오지 못했어요." },
      { status: 500 },
    );
  }

  const answers = (answersRes.data ?? []) as AnswerWithSolver[];
  const members = (membersRes.data ?? []) as MemberRow[];
  const memberByUserId = new Map<string, MemberRow>();
  for (const m of members) {
    if (m.user_id) memberByUserId.set(m.user_id, m);
  }

  const author = memberByUserId.get(quiz.author_user_id);
  const authorName = memberLabel(author, "가족");

  const trueOpts = options.filter((o) => o.kind === "true");
  const falseOpt = options.find((o) => o.kind === "false");

  const optionsBlock = options
    .map(
      (o) =>
        `- [${o.kind === "false" ? "가짜" : "진짜"}] ${o.text}`,
    )
    .join("\n");

  const answersBlock =
    answers.length > 0
      ? answers
          .map((a) => {
            const opt = options.find((o) => o.id === a.chosen_option_id);
            const solver = memberLabel(memberByUserId.get(a.solver_user_id));
            const verdict = a.is_correct ? "맞춤" : "속음";
            const reason = a.reason_text ? ` / 이유: "${a.reason_text}"` : "";
            return `- ${solver}: "${opt?.text ?? "(?)"}" (${verdict})${reason}`;
          })
          .join("\n")
      : "- (풀이자 없음)";

  const userPrompt = `출제자: ${authorName}
날짜: ${quiz.day_label}

옵션:
${optionsBlock}

풀이자별 결과:
${answersBlock}

위 정보를 바탕으로 다정하고 짧은 결과 코멘트(200자 이내)를 한 단락 작성하고,
진짜였던 두 옵션에 대해 가족이 이어 물어볼 짧은 후속 질문 2개를 "• 질문?" 형식으로
다음 줄들에 덧붙여 줘.`;

  let generated = "";
  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: LLM_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      generated = textBlock.text.trim();
    }
  } catch (err) {
    console.error("[ai/comment] anthropic call failed", err);
  }

  if (!generated) {
    // Last-ditch templated fallback that still mentions both true options.
    const t1 = trueOpts[0]?.text ?? "오늘 있었던 일";
    const t2 = trueOpts[1]?.text ?? "또 하나의 일";
    generated = `오늘 ${authorName}의 진진거에서 가짜는 "${falseOpt?.text ?? ""}"였어요. 가족 한 명 한 명의 선택이 다정해 보이네요.
• "${t1}" — 그때 어떤 마음이었어?
• "${t2}" — 다음엔 같이 해볼래?`;
  }

  // Insert via service role to bypass RLS that requires kind='user'.
  if (!serverEnv.supabaseServiceRoleKey) {
    return NextResponse.json(
      { ok: false, message: "AI 코멘트를 저장할 수 없어요(설정 누락)." },
      { status: 500 },
    );
  }

  const admin = createClient<Database>(
    env.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const insertRes = await admin.from("comment").insert({
    quiz_id: quizId,
    author_user_id: null,
    kind: "ai",
    category: null,
    category_source: null,
    text: generated.slice(0, 200 * 3),
  });

  if (insertRes.error) {
    // Possibly a race — re-fetch existing.
    const retryRes = await supabase
      .from("comment")
      .select("text")
      .eq("quiz_id", quizId)
      .eq("kind", "ai")
      .maybeSingle();
    const retry = retryRes.data as { text: string } | null;
    if (retry?.text) {
      return NextResponse.json({ ok: true, text: retry.text });
    }
    console.error("[ai/comment] insert failed", insertRes.error);
    return NextResponse.json(
      { ok: false, message: "AI 코멘트 저장에 실패했어요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, text: generated });
}
