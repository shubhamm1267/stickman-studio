import path from "node:path";
import os from "node:os";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { ROOT, DATA, json, atomic } from "./files.mjs";

const browserCommands = {
  win32: ["chrome.exe", "chromium.exe"],
  darwin: ["google-chrome", "chromium"],
  linux: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"],
};

function isExecutableFile(file) {
  try {
    if (!statSync(file).isFile()) return false;
    if (process.platform !== "win32") accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function findBrowserOnPath(pathValue = process.env.PATH, platform = process.platform) {
  const commands = browserCommands[platform] || browserCommands.linux;
  for (const directory of String(pathValue || "").split(path.delimiter).filter(Boolean)) {
    for (const command of commands) {
      const candidate = path.join(directory, command);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

export async function findBrowser() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH))
      throw Error("CHROME_PATH points to a missing executable.");
    return process.env.CHROME_PATH;
  }
  try {
    let cached = await json(path.join(DATA, "browser.json"));
    if (cached.path && existsSync(cached.path)) return cached.path;
  } catch {}
  const candidates =
    process.platform === "win32"
      ? [
          path.join(
            process.env.PROGRAMFILES || "C:\\Program Files",
            "Google/Chrome/Application/chrome.exe",
          ),
          path.join(
            process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
            "Google/Chrome/Application/chrome.exe",
          ),
          path.join(
            process.env.LOCALAPPDATA || os.homedir(),
            "Google/Chrome/Application/chrome.exe",
          ),
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];
  return candidates.find(isExecutableFile) || findBrowserOnPath() || null;
}
export async function rememberBrowser(executable) {
  if (executable)
    await atomic(path.join(DATA, "browser.json"), { path: executable });
}
