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
await fs.mkdir("/tmp/sticklaugh-v4-review", { recursive: true });
for (const [name, times] of [
  ["banana-bin", [0.2, 1.1, 3.5, 6.8, 7.8, 9.1, 12.6, 15.3, 19.8, 21]],
  ["lion-balloon", [0.8, 2.6, 4.5, 8, 9.7, 10.3, 13, 16.8, 20, 22]],
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
      path: `/tmp/sticklaugh-v4-review/${name}-${i}.png`,
    });
  }
}
await browser.close();
console.log("Saved actual engine frame previews.");
