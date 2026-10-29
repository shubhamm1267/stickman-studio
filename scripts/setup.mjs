import "dotenv/config";
import { ensureBrowser } from "@remotion/renderer";
import { command } from "../server/media.mjs";
import { findBrowser, rememberBrowser } from "../server/browser.mjs";
try {
  await command(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]);
  await command(process.env.FFPROBE_PATH || "ffprobe", ["-version"]);
  const existing = await findBrowser(),
    r = await ensureBrowser({
      logLevel: "info",
      ...(existing ? { browserExecutable: existing } : {}),
    });
  if ("path" in r) await rememberBrowser(r.path);
  console.log("Chromium ready:", "path" in r ? r.path : r.type);
  console.log("Setup complete. npm run build && npm start");
} catch (e) {
  console.error(e.message);
  console.error(
    "Check FFmpeg/ffprobe. If the Chromium download is blocked, install Chrome or set CHROME_PATH in .env and rerun setup. See README.",
  );
  process.exitCode = 1;
}
