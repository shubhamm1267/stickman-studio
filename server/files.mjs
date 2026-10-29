import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
export const ROOT = path.resolve(import.meta.dirname, ".."),
  DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
export async function atomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  let tmp = file + ".tmp";
  await writeFile(
    tmp,
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
  await rename(tmp, file);
}
export async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
export function redact(message, keys = {}) {
  let s = String(message);
  for (const k of Object.values(keys))
    if (typeof k === "string" && k.length > 6)
      s = s.split(k).join("[redacted]");
  return s.replace(/AIza[A-Za-z0-9_-]+|sk_car_[A-Za-z0-9_-]+/g, "[redacted]");
}
