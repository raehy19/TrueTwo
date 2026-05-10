import { cn } from "@/lib/cn";

const palette = [
  "bg-coral-300 text-coral-700",
  "bg-mint-300 text-mint-700",
  "bg-mustard-300 text-coral-700",
  "bg-grape-300 text-grape-500",
] as const;

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h = (h ^ input.charCodeAt(i)) * 16777619;
  }
  return Math.abs(h);
}

export function AvatarDot({
  seed,
  label,
  size = "md",
  className,
}: {
  seed: string;
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tone = palette[hash(seed) % palette.length];
  const sizes = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-xs",
    lg: "h-10 w-10 text-sm",
  } as const;
  const initial = (label || "·").slice(0, 1);
  return (
    <span
      className={cn(
        "inline-grid place-items-center rounded-full font-bold uppercase ring-1 ring-paper-edge",
        sizes[size],
        tone,
        className,
      )}
      title={label}
    >
      {initial}
    </span>
  );
}
