import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "하루진진거 — 가족의 하루를 맞혀보세요",
  description:
    "진짜 2개, 가짜 1개. 매일 한 사람의 진진거 한 판으로 가족이 서로의 진짜 하루를 발견하게 만드는 데일리 가족 게임.",
  applicationName: "하루진진거",
  authors: [{ name: "하루진진거 팀" }],
  openGraph: {
    title: "하루진진거 — 가족의 하루를 맞혀보세요",
    description: "진짜 2개, 가짜 1개. 오늘 가족 누가 거짓말을 했게?",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#fbf7ee",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
