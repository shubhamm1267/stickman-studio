import { chromium } from "playwright";
import fs from "node:fs/promises";
import { createApp } from "../server/index.mjs";
const { app } = await createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
let errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base);
await page.getByRole("button", { name: "Try the tested demo" }).click();
await page.getByAltText("Actual animation frame preview").waitFor();
await page.waitForFunction(
  () => document.querySelector(".preview-stage img")?.complete,
);
await page.screenshot({ path: "/tmp/sticklaugh-director.png", fullPage: true });
await page.getByRole("button", { name: /Connections/ }).click();
await page.getByLabel("Gemini API key").fill("not-a-real-key");
await page.getByRole("button", { name: "Save connections" }).click();
await page.getByRole("button", { name: "Forget keys" }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page
  .getByRole("button", { name: "Create a story", exact: false })
  .click();
await page.screenshot({ path: "/tmp/sticklaugh-mobile.png", fullPage: true });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth + 1,
);
await browser.close();
await new Promise((r) => server.close(r));
if (errors.length || overflow)
  throw Error(JSON.stringify({ errors, overflow }));
console.log(
  "PASS: Angular boot, demo load, actual frame preview, settings, forget keys, mobile navigation, no overflow or page errors.",
);
