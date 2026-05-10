"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  primary?: boolean;
};

const items: NavItem[] = [
  { href: "/home", label: "홈", icon: "🏠" },
  { href: "/family", label: "가족", icon: "👨‍👩‍👧" },
  { href: "/quiz/new", label: "올리기", icon: "✍️", primary: true },
  { href: "/board", label: "남의집", icon: "🌍" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-4 pb-3 pt-2">
      <ul className="flex items-end justify-between rounded-full border border-paper-edge bg-paper/95 px-2 py-1 shadow-pop backdrop-blur">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/home" && pathname.startsWith(item.href));
          if (item.primary) {
            return (
              <li key={item.href} className="relative -mt-7">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-coral-500 text-2xl text-white shadow-pop transition active:scale-95"
                >
                  ✍️
                </Link>
              </li>
            );
          }
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-full px-3 py-2 text-[10px] font-semibold transition",
                  active ? "text-ink" : "text-ink-faint hover:text-ink-soft",
                )}
              >
                <span aria-hidden className="text-base">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
