import "dotenv/config";
import { command } from "../server/media.mjs";
import { findBrowser } from "../server/browser.mjs";
import { stat } from "node:fs/promises";
let ok = true;
console.log("Node", process.version);
for (const name of ["FFMPEG", "FFPROBE"]) {
  try {
    let x = await command(process.env[name + "_PATH"] || name.toLowerCase(), [
      "-version",
    ]);
    console.log("OK", x.split("\n")[0]);
  } catch (e) {
    console.error("MISSING", name, e.message);
    ok = false;
  }
}
try {
  let browser = await findBrowser();
  console.log(
    browser
      ? "OK Chromium executable: " + browser
      : "Chromium: npm run setup downloads it.",
  );
} catch (e) {
  ok = false;
  console.error(e.message);
}
process.exitCode = ok ? 0 : 1;
