"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, FieldHint } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  signInAction,
  signUpAction,
  type AuthState,
} from "./actions";

const initial: AuthState = { status: "idle" };

export function LoginForm({
  initialMode,
}: {
  initialMode: "signin" | "signup";
}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const action = mode === "signin" ? signInAction : signUpAction;
  const [state, formAction] = useActionState(action, initial);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-paper-soft p-1">
        <Tab active={mode === "signin"} onClick={() => setMode("signin")}>
          로그인
        </Tab>
        <Tab active={mode === "signup"} onClick={() => setMode("signup")}>
          회원가입
        </Tab>
      </div>

      <form action={formAction} className="space-y-3" key={mode}>
        <div>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="이메일"
            required
          />
        </div>
        <div>
          <Input
            type="password"
            name="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={mode === "signin" ? "비밀번호" : "비밀번호 (8자 이상)"}
            minLength={8}
            required
          />
          {mode === "signup" ? (
            <FieldHint>이메일 인증 메일은 보내지 않아요. 비밀번호는 안전하게 보관해 주세요.</FieldHint>
          ) : null}
        </div>

        {state.status === "error" ? (
          <div className="rounded-2xl bg-coral-50 px-4 py-3 text-sm font-medium text-coral-700 ring-paper">
            {state.message}
          </div>
        ) : null}

        <SubmitButton mode={mode} />
      </form>

      <p className="text-center text-xs text-ink-faint">
        {mode === "signin"
          ? "처음이세요? 위에서 회원가입을 눌러주세요."
          : "이메일 본인 인증을 거치지 않습니다. 가족과만 공유되는 정보예요."}
      </p>
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

function SubmitButton({ mode }: { mode: "signin" | "signup" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full">
      {mode === "signin" ? "로그인" : "가입하고 시작하기"}
    </Button>
  );
}
