import "dotenv/config";
import { runProviderSmokes } from "../server/provider-smoke.mjs";

const result = await runProviderSmokes({
  geminiKey: process.env.GEMINI_API_KEY,
  freesoundKey: process.env.FREESOUND_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
});
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (result.status !== "passed") process.exitCode = 1;
