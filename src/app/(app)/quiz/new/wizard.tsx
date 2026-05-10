"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Textarea, FieldHint } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { createQuizAction } from "./actions";

type Difficulty = 1 | 2 | 3 | 4;

type LieGenResponse = {
  candidates?: string[];
  message?: string;
  model?: string;
};

const DIFFICULTY_OPTIONS: {
  value: Difficulty;
  label: string;
  emoji: string;
  hint: string;
  badge: string;
}[] = [
  {
    value: 1,
    label: "너무 티 남",
    emoji: "🟢",
    hint: "명백히 우스꽝스러운 거짓",
    badge: "bg-mint-50 text-mint-700",
  },
  {
    value: 2,
    label: "가족이면 헷갈림",
    emoji: "🟡",
    hint: "평범한 일상 톤의 거짓",
    badge: "bg-mustard-50 text-mustard-500",
  },
  {
    value: 3,
    label: "엄마도 속음",
    emoji: "🔴",
    hint: "진짜의 디테일을 차용",
    badge: "bg-coral-100 text-coral-700",
  },
  {
    value: 4,
    label: "우리집 레전드급",
    emoji: "⚫",
    hint: "가족의 인물·습관 교차",
    badge: "bg-grape-50 text-grape-500",
  },
];

const MIN_LEN = 5;
const MAX_LEN = 200;
const MAX_AI_CALLS = 3;

function charLen(text: string): number {
  return text.trim().length;
}

function isValidLen(text: string): boolean {
  const len = charLen(text);
  return len >= MIN_LEN && len <= MAX_LEN;
}

export function QuizNewWizard({ familyName }: { familyName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [trueOne, setTrueOne] = useState("");
  const [trueTwo, setTrueTwo] = useState("");
  const [isBacklog, setIsBacklog] = useState(false);

  // Difficulty (used for step 2 + 3)
  const [difficulty, setDifficulty] = useState<Difficulty>(2);

  // Step 2 state
  const [candidates, setCandidates] = useState<string[]>([]);
  const [aiCalls, setAiCalls] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Step 3 state
  const [editedFalseText, setEditedFalseText] = useState("");
  const [originalAiText, setOriginalAiText] = useState<string | null>(null);

  // Submit state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Track first call when entering step 2
  const didInitialCall = useRef(false);

  async function fetchCandidates(): Promise<void> {
    if (aiCalls >= MAX_AI_CALLS) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/lie-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          true_1: trueOne.trim(),
          true_2: trueTwo.trim(),
          difficulty,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as LieGenResponse;
      if (!res.ok || !data.candidates || data.candidates.length === 0) {
        setAiError(
          data.message ?? "AI가 잠깐 졸고 있어요. 직접 적거나 다시 시도해 주세요.",
        );
        // Failed call doesn't burn a counter slot per S-9
      } else {
        setCandidates(data.candidates);
        setAiCalls((n) => n + 1);
        setSelectedIndex(null);
      }
    } catch {
      setAiError("네트워크 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setAiLoading(false);
    }
  }

  // Auto-fetch when entering step 2 for the first time
  useEffect(() => {
    if (step === 2 && !didInitialCall.current && !manualMode) {
      didInitialCall.current = true;
      void fetchCandidates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function goNextFromStep1() {
    if (!isValidLen(trueOne) || !isValidLen(trueTwo)) return;
    setStep(2);
  }

  function goNextFromStep2() {
    if (manualMode) {
      if (!isValidLen(manualText)) return;
      setOriginalAiText(null);
      setEditedFalseText(manualText.trim());
    } else {
      if (selectedIndex === null) return;
      const chosen = candidates[selectedIndex];
      setOriginalAiText(chosen);
      setEditedFalseText(chosen);
    }
    setStep(3);
  }

  function handleSubmit() {
    if (!isValidLen(editedFalseText)) {
      setSubmitError("가짜는 5~200자로 적어 주세요.");
      return;
    }
    setSubmitError(null);
    const wasEdited =
      originalAiText !== null
        ? originalAiText.trim() !== editedFalseText.trim()
        : true;
    const sourceLLM = originalAiText !== null ? originalAiText : null;

    startTransition(async () => {
      const result = await createQuizAction({
        true_1: trueOne.trim(),
        true_2: trueTwo.trim(),
        false_text: editedFalseText.trim(),
        false_source_llm: sourceLLM,
        false_edited: wasEdited,
        difficulty,
        is_backlog: isBacklog,
      });

      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }
      // Author can't play their own quiz → push to /home
      router.push("/home");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Header step={step} />

      {step === 1 ? (
        <Step1
          familyName={familyName}
          trueOne={trueOne}
          trueTwo={trueTwo}
          isBacklog={isBacklog}
          onTrueOne={setTrueOne}
          onTrueTwo={setTrueTwo}
          onIsBacklog={setIsBacklog}
          onNext={goNextFromStep1}
        />
      ) : null}

      {step === 2 ? (
        <Step2
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          candidates={candidates}
          loading={aiLoading}
          error={aiError}
          aiCalls={aiCalls}
          manualMode={manualMode}
          manualText={manualText}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          onToggleManual={() => {
            setManualMode((v) => !v);
            setSelectedIndex(null);
          }}
          onChangeManual={setManualText}
          onReroll={() => void fetchCandidates()}
          onBack={() => setStep(1)}
          onNext={goNextFromStep2}
        />
      ) : null}

      {step === 3 ? (
        <Step3
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          editedText={editedFalseText}
          onEditedText={setEditedFalseText}
          isFromAI={originalAiText !== null}
          submitError={submitError}
          submitting={isPending}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}

function Header({ step }: { step: 1 | 2 | 3 }) {
  const titles: Record<1 | 2 | 3, string> = {
    1: "오늘 진짜 두 개 적기",
    2: "AI 가짜 후보 고르기",
    3: "다듬고 등록하기",
  };
  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
          STEP {step} / 3
        </span>
        <span className="text-xs text-ink-faint">진진거 만들기</span>
      </div>
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              step >= n ? "bg-ink" : "bg-paper-edge",
            )}
          />
        ))}
      </div>
      <h1 className="text-balance text-2xl font-bold text-ink">{titles[step]}</h1>
    </header>
  );
}

function Step1({
  familyName,
  trueOne,
  trueTwo,
  isBacklog,
  onTrueOne,
  onTrueTwo,
  onIsBacklog,
  onNext,
}: {
  familyName: string;
  trueOne: string;
  trueTwo: string;
  isBacklog: boolean;
  onTrueOne: (v: string) => void;
  onTrueTwo: (v: string) => void;
  onIsBacklog: (v: boolean) => void;
  onNext: () => void;
}) {
  const t1Valid = isValidLen(trueOne) || trueOne.length === 0;
  const t2Valid = isValidLen(trueTwo) || trueTwo.length === 0;
  const canNext = isValidLen(trueOne) && isValidLen(trueTwo);

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-soft">
        <span className="font-semibold text-ink">{familyName}</span> 가족에게 보낼
        오늘의 진짜 일 두 개를 적어주세요. AI가 가족이 헷갈릴 만한 가짜를
        만들어 줄 거예요.
      </p>

      <Field
        label="진짜 1"
        value={trueOne}
        onChange={onTrueOne}
        placeholder="예: 오늘 회의에서 칭찬받았다"
        valid={t1Valid}
      />
      <Field
        label="진짜 2"
        value={trueTwo}
        onChange={onTrueTwo}
        placeholder="예: 점심을 못 먹고 커피만 마셨다"
        valid={t2Valid}
      />

      <button
        type="button"
        onClick={() => onIsBacklog(!isBacklog)}
        className={cn(
          "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ring-paper transition",
          isBacklog
            ? "bg-coral-50 text-coral-700"
            : "bg-paper-soft text-ink-soft hover:bg-paper-edge",
        )}
        aria-pressed={isBacklog}
      >
        <span className="text-sm">
          <span className="font-semibold">어제치 진진거로 등록</span>
          <span className="ml-2 text-xs text-ink-faint">
            어제 못 올렸으면 하나 더 채울 수 있어요
          </span>
        </span>
        <span
          className={cn(
            "h-6 w-10 rounded-full p-0.5 transition-colors",
            isBacklog ? "bg-coral-500" : "bg-paper-edge",
          )}
        >
          <span
            className={cn(
              "block h-5 w-5 rounded-full bg-white shadow transition-transform",
              isBacklog ? "translate-x-4" : "translate-x-0",
            )}
          />
        </span>
      </button>

      <Button size="lg" onClick={onNext} disabled={!canNext} className="w-full">
        다음
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  valid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  valid: boolean;
}) {
  const len = value.length;
  const tooLong = len > MAX_LEN;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-semibold text-ink">{label}</label>
        <span
          className={cn(
            "text-xs",
            tooLong ? "font-semibold text-coral-600" : "text-ink-faint",
          )}
        >
          {len} / {MAX_LEN}
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={MAX_LEN + 50}
      />
      {!valid ? (
        <FieldHint tone="error">5자 이상 적어주세요.</FieldHint>
      ) : tooLong ? (
        <FieldHint tone="error">200자 이내로 줄여 주세요.</FieldHint>
      ) : null}
    </div>
  );
}

function Step2({
  difficulty,
  onDifficulty,
  candidates,
  loading,
  error,
  aiCalls,
  manualMode,
  manualText,
  selectedIndex,
  onSelectIndex,
  onToggleManual,
  onChangeManual,
  onReroll,
  onBack,
  onNext,
}: {
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  candidates: string[];
  loading: boolean;
  error: string | null;
  aiCalls: number;
  manualMode: boolean;
  manualText: string;
  selectedIndex: number | null;
  onSelectIndex: (i: number) => void;
  onToggleManual: () => void;
  onChangeManual: (v: string) => void;
  onReroll: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const callsLeft = MAX_AI_CALLS - aiCalls;
  const canReroll = !loading && callsLeft > 0;
  const canNext = manualMode ? isValidLen(manualText) : selectedIndex !== null;

  return (
    <div className="space-y-5">
      <DifficultyToggle value={difficulty} onChange={onDifficulty} />

      {!manualMode ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-ink-faint">
            <span>가짜 후보 3개 중 하나를 골라 주세요</span>
            <span className="font-semibold">
              사용 {aiCalls}/{MAX_AI_CALLS}
            </span>
          </div>

          {loading ? (
            <SkeletonCards />
          ) : error ? (
            <Card>
              <CardBody className="space-y-2 py-5">
                <p className="text-sm font-semibold text-coral-700">{error}</p>
                <p className="text-xs text-ink-faint">
                  다시 시도하거나 직접 적기로 진행할 수 있어요.
                </p>
              </CardBody>
            </Card>
          ) : candidates.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-ink-soft">
                  AI가 가짜 후보를 만들고 있어요…
                </p>
              </CardBody>
            </Card>
          ) : (
            candidates.map((c, idx) => (
              <CandidateCard
                key={`${idx}-${c.slice(0, 12)}`}
                text={c}
                selected={selectedIndex === idx}
                onSelect={() => onSelectIndex(idx)}
              />
            ))
          )}

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onReroll}
              disabled={!canReroll}
              loading={loading}
            >
              다른 후보 보기
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggleManual}>
              직접 적기
            </Button>
          </div>
          {callsLeft === 0 ? (
            <FieldHint tone="warn">
              오늘 진진거에서 사용 가능한 횟수를 다 썼어요.
            </FieldHint>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">직접 적기</span>
            <Button variant="ghost" size="sm" onClick={onToggleManual}>
              AI 후보로 돌아가기
            </Button>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm text-ink-soft">가짜 한 줄</label>
              <span
                className={cn(
                  "text-xs",
                  manualText.length > MAX_LEN
                    ? "font-semibold text-coral-600"
                    : "text-ink-faint",
                )}
              >
                {manualText.length} / {MAX_LEN}
              </span>
            </div>
            <Textarea
              value={manualText}
              onChange={(e) => onChangeManual(e.target.value)}
              placeholder="가족이 헷갈릴 만한 그럴듯한 가짜를 적어 주세요"
              maxLength={MAX_LEN + 50}
            />
            {manualText.length > 0 && !isValidLen(manualText) ? (
              <FieldHint tone="error">5~200자로 적어 주세요.</FieldHint>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" size="lg" onClick={onBack} className="flex-1">
          이전
        </Button>
        <Button size="lg" onClick={onNext} disabled={!canNext} className="flex-[2]">
          다음
        </Button>
      </div>
    </div>
  );
}

function CandidateCard({
  text,
  selected,
  onSelect,
}: {
  text: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "block w-full rounded-[var(--radius-card)] p-4 text-left ring-paper transition",
        selected
          ? "bg-coral-50 ring-2 ring-coral-500/60"
          : "bg-white/80 hover:bg-paper-soft",
      )}
      aria-pressed={selected}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className={cn(
            "rounded-full bg-mint-50 px-2 py-0.5 text-xs font-semibold text-mint-700",
          )}
        >
          AI 만든 거
        </span>
        {selected ? (
          <span className="text-xs font-semibold text-coral-700">선택됨</span>
        ) : null}
      </div>
      <p className="text-pretty text-sm leading-relaxed text-ink">{text}</p>
    </button>
  );
}

function SkeletonCards() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-[var(--radius-card)] bg-white/60 p-4 ring-paper"
        >
          <div className="mb-2 h-4 w-20 animate-pulse rounded bg-paper-edge" />
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-paper-edge" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-paper-edge" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DifficultyToggle({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  const current = DIFFICULTY_OPTIONS.find((o) => o.value === value);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">난이도</span>
        {current ? (
          <span className="text-xs text-ink-faint">{current.hint}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {DIFFICULTY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-2xl px-2 py-2 text-xs font-semibold ring-paper transition",
              value === opt.value
                ? "bg-ink text-paper"
                : "bg-paper-soft text-ink-soft hover:bg-paper-edge",
            )}
            aria-pressed={value === opt.value}
          >
            <span className="block text-base leading-tight">{opt.emoji}</span>
            <span className="mt-1 block leading-tight">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Step3({
  difficulty,
  onDifficulty,
  editedText,
  onEditedText,
  isFromAI,
  submitError,
  submitting,
  onBack,
  onSubmit,
}: {
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  editedText: string;
  onEditedText: (v: string) => void;
  isFromAI: boolean;
  submitError: string | null;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const tooLong = editedText.length > MAX_LEN;
  const canSubmit = isValidLen(editedText) && !submitting;

  return (
    <div className="space-y-5">
      <DifficultyToggle value={difficulty} onChange={onDifficulty} />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-semibold text-ink">가짜 한 줄</label>
          <span
            className={cn(
              "text-xs",
              tooLong ? "font-semibold text-coral-600" : "text-ink-faint",
            )}
          >
            {editedText.length} / {MAX_LEN}
          </span>
        </div>
        <Textarea
          value={editedText}
          onChange={(e) => onEditedText(e.target.value)}
          maxLength={MAX_LEN + 50}
        />
        {isFromAI ? (
          <FieldHint tone="neutral">
            AI가 만들었어요 — 자유롭게 다듬어 주세요.
          </FieldHint>
        ) : null}
        {tooLong ? (
          <FieldHint tone="error">200자 이내로 줄여 주세요.</FieldHint>
        ) : null}
      </div>

      {submitError ? (
        <Card className="bg-coral-50">
          <CardBody>
            <p className="text-sm font-semibold text-coral-700">{submitError}</p>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="lg"
          onClick={onBack}
          className="flex-1"
          disabled={submitting}
        >
          이전
        </Button>
        <Button
          size="lg"
          onClick={onSubmit}
          disabled={!canSubmit}
          loading={submitting}
          className="flex-[2]"
        >
          등록하기
        </Button>
      </div>
    </div>
  );
}
