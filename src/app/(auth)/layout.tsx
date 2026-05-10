import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-12">
      <header className="flex items-center">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-ink-soft hover:text-ink"
        >
          ← 진진거
        </Link>
      </header>
      <div className="flex-1">{children}</div>
    </main>
  );
}
