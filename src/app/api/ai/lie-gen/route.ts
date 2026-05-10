import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAnthropic, LLM_MODEL } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Difficulty = 1 | 2 | 3 | 4;

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: "1: 너무 티 남",
  2: "2: 가족이면 헷갈림",
  3: "3: 엄마도 속음",
  4: "4: 우리집 레전드급",
};

const SYSTEM_PROMPT = `너는 한국 가족의 데일리 게임 "진진거"의 가짜 옵션 생성기다.
규칙:
- 결과는 정확히 3개의 한국어 가짜 일상 사건으로만 이루어진 JSON 배열이다.
- 각 항목은 5~120자의 일상 한 줄 사건이며, 진짜 옵션 두 개의 톤·길이·시점과 비슷해야 한다.
- 진짜 옵션의 인물·장소·시간 단서를 자연스럽게 변형해 그럴듯하게 만든다.
- 비속어, 차별, 자해, 폭력, 타인 식별 정보(전화번호/주소/회사명), 정치, 종교 단정 표현 금지.
- 절대 진짜 옵션 텍스트와 동일/거의 동일한 문장을 쓰지 않는다.
- JSON 배열 외에 다른 텍스트 금지. 예: ["문장1","문장2","문장3"]`;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function tokenOverlapRatio(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const bSet = new Set(bTokens);
  let common = 0;
  for (const t of aTokens) if (bSet.has(t)) common += 1;
  const denom = Math.min(aTokens.length, bTokens.length);
  return common / denom;
}

function tooSimilar(candidate: string, true1: string, true2: string): boolean {
  return (
    tokenOverlapRatio(candidate, true1) > 0.7 ||
    tokenOverlapRatio(candidate, true2) > 0.7
  );
}

function extractJsonArray(text: string): string[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item === "string") out.push(item.trim());
    }
    return out;
  } catch {
    return null;
  }
}

async function callLLM(
  trueOne: string,
  trueTwo: string,
  difficulty: Difficulty,
): Promise<string[] | null> {
  const anthropic = getAnthropic();
  const userPrompt = `난이도: ${DIFFICULTY_LABELS[difficulty]}
진짜 1: ${trueOne}
진짜 2: ${trueTwo}
가짜 후보 3개를 만들어줘. JSON 배열 외에 다른 텍스트 금지.`;

  const response = await anthropic.messages.create({
    model: LLM_MODEL,
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  return extractJsonArray(textBlock.text);
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { candidates: [], message: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { candidates: [], message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const obj = (body ?? {}) as Record<string, unknown>;
  const true1 = obj.true_1;
  const true2 = obj.true_2;
  const difficulty = obj.difficulty;

  if (!isString(true1) || !isString(true2) || !isDifficulty(difficulty)) {
    return NextResponse.json(
      { candidates: [], message: "입력 형식이 올바르지 않아요." },
      { status: 400 },
    );
  }

  const t1 = true1.trim();
  const t2 = true2.trim();
  if (t1.length < 5 || t1.length > 200 || t2.length < 5 || t2.length > 200) {
    return NextResponse.json(
      { candidates: [], message: "진짜 두 개를 5~200자로 입력해 주세요." },
      { status: 400 },
    );
  }

  try {
    let raw = await callLLM(t1, t2, difficulty);
    if (!raw) {
      raw = await callLLM(t1, t2, difficulty);
    }
    if (!raw) {
      return NextResponse.json(
        {
          candidates: [],
          message: "AI 응답을 이해하지 못했어요. 다시 시도해 주세요.",
        },
        { status: 500 },
      );
    }

    const filtered = raw
      .map((s) => s.trim())
      .filter((s) => s.length >= 5 && s.length <= 200)
      .filter((s) => !tooSimilar(s, t1, t2));

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const s of filtered) {
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }

    return NextResponse.json({
      candidates: unique.slice(0, 3),
      model: LLM_MODEL,
    });
  } catch (err) {
    console.error("[lie-gen] anthropic call failed", err);
    return NextResponse.json(
      {
        candidates: [],
        message: "AI가 잠깐 졸고 있어요. 직접 적거나 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }
}
