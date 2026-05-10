import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full bg-paper-soft text-ink placeholder:text-ink-faint rounded-2xl ring-paper focus:outline-none focus:ring-2 focus:ring-ink/30 transition px-4";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(fieldBase, "h-12 text-base", className)}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, "min-h-[96px] py-3 text-base resize-none", className)}
      {...rest}
    />
  );
});

export function FieldHint({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warn" | "error";
}) {
  const colors = {
    neutral: "text-ink-faint",
    warn: "text-mustard-500",
    error: "text-coral-600",
  } as const;
  return (
    <p className={cn("mt-1.5 text-xs font-medium", colors[tone])}>{children}</p>
  );
}
