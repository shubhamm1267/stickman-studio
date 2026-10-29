import { chromium } from "playwright";
import fs from "node:fs/promises";
import { createApp } from "../server/index.mjs";
const { app } = await createApp(),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
    executablePath: await (await import('../server/browser.mjs')).findBrowser(),
    headless: true,
    args: ["--no-sandbox"],
  }),
  page = await browser.newPage();
let renders = 0,
  options;
const plan = JSON.parse(
  await fs.readFile(
    new URL("../examples/interview-chair.json", import.meta.url),
    "utf8",
  ),
);
try {
  await page.route("**/api/plan", async (route) => {
    options = route.request().postDataJSON().options;
    await route.fulfill({
      json: { id: "mock-plan", status: "queued", kind: "plan" },
    });
  });
  await page.route("**/api/jobs/mock-plan", (route) =>
    route.fulfill({
      json: {
        id: "mock-plan",
        status: "completed",
        kind: "plan",
        result: { plan },
      },
    }),
  );
  await page.route("**/api/render", async (route) => {
    let payload = route.request().postDataJSON();
    if (payload.plan.title !== plan.title || payload.mode !== "live")
      throw Error("Wrong automatic render payload");
    renders++;
    await route.fulfill({
      json: { id: "mock-render", status: "queued", kind: "render" },
    });
  });
  await page.route("**/api/jobs/mock-render", (route) =>
    route.fulfill({
      json: {
        id: "mock-render",
        status: "completed",
        kind: "render",
        result: { seo: plan.seo },
      },
    }),
  );
  await page.goto(base);
  if (
    !(await page
      .getByLabel("Render automatically after Gemini review")
      .isChecked())
  )
    throw Error("Automatic render is not the default");
  await page.getByRole("button", { name: /Generate comedy video/ }).click();
  await page.waitForFunction(() =>
    document.querySelector("h1")?.textContent?.includes("creator pack"),
  );
  if (renders !== 1 || options.category !== "family-comedy")
    throw Error("One-click bridge/default category failed");
  console.log(
    "PASS: one-click client plan-to-render bridge; provider/job responses mocked, actual renders verified separately.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
