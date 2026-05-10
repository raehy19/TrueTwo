"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CodeShare({
  code,
  familyName,
}: {
  code: string;
  familyName: string;
}) {
  const [copied, setCopied] = useState<"none" | "code" | "link">("none");

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/onboarding?code=${code}`
      : `/onboarding?code=${code}`;

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied("code");
    setTimeout(() => setCopied("none"), 1500);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(
      `${familyName} 가족 진진거에 같이 들어와! ${link}`,
    );
    setCopied("link");
    setTimeout(() => setCopied("none"), 1500);
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-paper-edge bg-gradient-to-br from-coral-50 via-paper to-mustard-50 p-5 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
        Family code
      </p>
      <p className="mt-2 font-display text-4xl font-bold tracking-[0.4em] text-ink">
        {code}
      </p>
      <p className="mt-2 text-xs text-ink-soft">
        I, O, 0, 1 없는 6자리 코드. 정원 8명까지.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        <Button onClick={copyCode} variant="secondary" size="md" className="w-full justify-between gap-3">
          <span>코드 복사</span>
          <span className="text-xs text-ink-faint">{copied === "code" ? "✓ 복사됨" : ""}</span>
        </Button>
        <Button onClick={copyLink} variant="primary" size="md" className="w-full justify-between gap-3">
          <span>초대 링크 복사</span>
          <span className="text-xs text-paper/80">{copied === "link" ? "✓ 복사됨" : ""}</span>
        </Button>
      </div>
    </div>
  );
}
