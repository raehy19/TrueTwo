// Capture key product screens from the deployed app for the pitch deck.
// Output: presentations/screenshots/*.png at iPhone-ish viewport.
//
// Usage: node scripts/capture-screenshots.mjs
// Requires: playwright (already installed via export-pdf.sh)

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "presentations", "screenshots");
const BASE_URL = "https://true-two-taupe.vercel.app";

const ACCOUNTS = {
  mom: { email: "mom@jinjin.demo", password: "password123" },
  dad: { email: "dad@jinjin.demo", password: "password123" },
  sis: { email: "sis@jinjin.demo", password: "password123" },
  me: { email: "me@jinjin.demo", password: "password123" },
};

// 모바일 우선 반응형이라 폰 사이즈로 캡처
const VIEWPORT = { width: 420, height: 900 };

async function login(page, account) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  // Login form: email + password fields
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page
    .locator('input[type="password"], input[name="password"]')
    .first();
  await emailInput.fill(account.email);
  await passwordInput.fill(account.password);
  // Submit (button or form submit)
  const submit = page
    .locator(
      'button[type="submit"], form button:has-text("로그인"), form button:has-text("로그인하기")',
    )
    .first();
  await Promise.all([
    page.waitForLoadState("networkidle"),
    submit.click(),
  ]);
  // Wait for redirect away from /login.
  await page.waitForURL((u) => !u.toString().includes("/login"), {
    timeout: 15000,
  });
}

async function shot(page, file) {
  await page.waitForLoadState("networkidle");
  // Tiny extra wait so RSC streams settle visually.
  await page.waitForTimeout(300);
  const path = join(OUT_DIR, file);
  await page.screenshot({ path, fullPage: false });
  console.log("  ✓", file);
}

async function captureFor(label, account, jobs) {
  console.log(`\n[${label}] login as ${account.email}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  try {
    await login(page, account);
    for (const job of jobs) {
      await page.goto(`${BASE_URL}${job.path}`, {
        waitUntil: "domcontentloaded",
      });
      await shot(page, job.file);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // me — 가장 풍부한 데모 시점 (오늘 진진거 출제자가 mom이라 me는 풀이자 시점)
  await captureFor("me", ACCOUNTS.me, [
    { path: "/home", file: "01-home-me.png" },
    { path: "/family", file: "02-family.png" },
    { path: "/board", file: "03-board.png" },
  ]);

  // sis — 어제 결과(나=me 출제) 화면 + 본인이 출제했던 진진거 결과
  // 어제치 quiz id 는 b4444444... (me 출제, sis는 풀이자, revealed)
  await captureFor("sis", ACCOUNTS.sis, [
    {
      path: "/quiz/b4444444-0004-0004-0004-000000000004/result",
      file: "04-result-real-day.png",
    },
  ]);

  // dad — 본인이 출제한 quiz가 게시판에 공유된 케이스 → 게시판 상세
  // public_post id: cccccccc-0001-0001-0001-000000000001
  await captureFor("dad", ACCOUNTS.dad, [
    {
      path: "/board/cccccccc-0001-0001-0001-000000000001",
      file: "05-board-detail.png",
    },
  ]);

  console.log("\nDone. Files in", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
