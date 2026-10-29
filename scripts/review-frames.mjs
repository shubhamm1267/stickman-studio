import fs from "node:fs/promises";
import { chromium } from "playwright";
import { validatePlan } from "../shared/schema.mjs";
import { svgFrame } from "../renderer/engine.mjs";
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--no-sandbox"],
  }),
  page = await browser.newPage({ viewport: { width: 540, height: 960 } });
await fs.mkdir("/tmp/sticklaugh-v3-review", { recursive: true });
for (const [name, times] of [
  ["interview-chair", [0.8, 2.5, 4.5, 9.9, 15, 17.6, 18.8, 25]],
  ["toilet-roll", [0.8, 4.7, 8, 10.5, 14, 16.9, 24.5, 29]],
]) {
  let plan = validatePlan(
    JSON.parse(
      await fs.readFile(
        new URL("../examples/" + name + ".json", import.meta.url),
        "utf8",
      ),
    ),
  );
  for (const [i, t] of times.entries()) {
    await page.setContent(
      `<html><body style="margin:0;width:540px;height:960px">${svgFrame(plan, t)}</body></html>`,
    );
    await page.screenshot({
      path: `/tmp/sticklaugh-v3-review/${name}-${i}.png`,
    });
  }
}
await browser.close();
console.log("Saved actual engine frame previews.");
