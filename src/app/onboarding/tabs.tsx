"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, FieldHint } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  createFamilyAction,
  joinFamilyAction,
  type OnboardingState,
} from "./actions";

const initial: OnboardingState = { status: "idle" };

export function OnboardingTabs({
  initialCode,
  initialTab,
}: {
  initialCode: string;
  initialTab: "create" | "join";
}) {
  const [tab, setTab] = useState<"create" | "join">(initialTab);
  const [createState, createFormAction] = useActionState(createFamilyAction, initial);
  const [joinState, joinFormAction] = useActionState(joinFamilyAction, initial);

  const state = tab === "create" ? createState : joinState;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-paper-soft p-1">
        <Tab active={tab === "create"} onClick={() => setTab("create")}>
          가족 만들기
        </Tab>
        <Tab active={tab === "join"} onClick={() => setTab("join")}>
          가족 코드로 가입
        </Tab>
      </div>

      {tab === "create" ? (
        <form action={createFormAction} className="space-y-3" key="create">
          <Input
            name="name"
            placeholder="가족 이름 (예: 콩가족)"
            maxLength={20}
            required
            autoFocus
          />
          <FieldHint>나중에 변경할 수 있어요.</FieldHint>
          <Submit label="가족 만들기" />
        </form>
      ) : (
        <form action={joinFormAction} className="space-y-3" key="join">
          <Input
            name="code"
            placeholder="6자리 가족 코드"
            defaultValue={initialCode}
            maxLength={6}
            required
            autoFocus
            style={{ letterSpacing: "0.3em", textTransform: "uppercase" }}
            className="text-center text-lg font-semibold"
          />
          <FieldHint>가족이 보낸 코드를 그대로 입력해 주세요.</FieldHint>
          <Submit label="가족 가입" />
        </form>
      )}

      {state.status === "error" ? (
        <div className="rounded-2xl bg-coral-50 px-4 py-3 text-sm font-medium text-coral-700 ring-paper">
          {state.message}
        </div>
      ) : null}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full py-2 text-sm font-semibold transition",
        active ? "bg-paper text-ink shadow-card" : "text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full">
      {label}
    </Button>
  );
}
