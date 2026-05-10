// Generate a QR PNG for the deployed app and embed it in the deck.
// Usage: node scripts/generate-qr.mjs
import QRCode from "qrcode";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "presentations", "screenshots", "qr-app.png");
const URL = "https://true-two-taupe.vercel.app/login";

await mkdir(dirname(OUT), { recursive: true });
await QRCode.toFile(OUT, URL, {
  width: 800,
  margin: 1,
  color: {
    // Bold Signal palette: dark ink on warm cream so it pops both inside
    // the orange card and as a standalone PNG.
    dark: "#1a1a1a",
    light: "#fbf7ee",
  },
  errorCorrectionLevel: "Q",
});
console.log("✓", OUT);
