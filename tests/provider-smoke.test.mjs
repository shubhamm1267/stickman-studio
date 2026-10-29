import test from "node:test";
import assert from "node:assert/strict";
import { runProviderSmokes, smokeFreesound, smokeGemini } from "../server/provider-smoke.mjs";

const modelList = (...names) => Response.json({ models: names.map(name => ({ name: `models/${name}`, supportedGenerationMethods: ["generateContent"] })) });
const structured = () => Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });

test("Gemini smoke discovers an available model and validates live-shaped JSON output", async () => {
  const calls = [];
  const result = await smokeGemini({ key: "test-secret-gemini", requestedModel: "gemini-2.5-flash-lite", fetcher: async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1 ? modelList("gemini-2.5-flash-lite") : structured();
  } });
  assert.equal(result.status, "passed");
  assert.equal(result.modelDiscovery, "passed");
  assert.equal(result.structuredOutput, "passed");
  assert.equal(result.selectedModel, "gemini-2.5-flash-lite");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers["x-goog-api-key"], "test-secret-gemini");
  assert.equal(JSON.parse(calls[1].options.body).generationConfig.responseMimeType, "application/json");
  assert.equal(JSON.stringify(result).includes("test-secret-gemini"), false);
});

test("Gemini smoke reports a missing runtime model separately from a successful structured request", async () => {
  let call = 0;
  const result = await smokeGemini({ key: "test-key", fetcher: async () => ++call === 1 ? modelList("gemini-2.5-flash-lite") : structured() });
  assert.equal(result.status, "failed");
  assert.equal(result.outcome, "model_availability");
  assert.equal(result.structuredOutput, "passed");
  assert.equal(result.runtimeDefaultAvailable, false);
});

test("Gemini smoke classifies auth, quota, rate-limit, model, connectivity and structured-output failures", async t => {
  const cases = [
    ["authentication", async () => new Response('{"error":{"message":"invalid API key"}}', { status: 401 })],
    ["quota", async () => new Response('{"error":{"message":"daily quota exceeded"}}', { status: 429 })],
    ["rate_limit", async () => new Response('{"error":{"message":"requests per minute rate limit"}}', { status: 429 })],
    ["connectivity", async () => { throw Error("network includes test-secret"); }],
  ];
  for (const [category, fetcher] of cases) await t.test(category, async () => {
    const result = await smokeGemini({ key: "test-secret", fetcher });
    assert.equal(result.outcome, category);
    assert.equal(JSON.stringify(result).includes("test-secret"), false);
  });
  await t.test("model_availability", async () => {
    const result = await smokeGemini({ key: "test-key", requestedModel: "not-in-list", fetcher: async () => modelList("gemini-2.5-flash-lite") });
    assert.equal(result.outcome, "model_availability");
    assert.equal(result.status, "failed");
  });
  await t.test("structured_output", async () => {
    let n = 0;
    const result = await smokeGemini({ key: "test-key", fetcher: async () => ++n === 1 ? modelList("gemini-2.5-flash-lite") : Response.json({ candidates: [{ content: { parts: [{ text: "not JSON" }] } }] }) });
    assert.equal(result.outcome, "structured_output");
  });
});

test("Freesound smoke makes an authenticated search and checks CC0 licensing", async () => {
  const calls = [];
  const result = await smokeFreesound({ key: "test-secret-freesound", fetcher: async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return Response.json({ results: [{ id: 4 }] });
    return Response.json({ results: [{ id: 9, license: "https://creativecommons.org/publicdomain/zero/1.0/" }] });
  } });
  assert.equal(result.status, "passed");
  assert.equal(result.authentication, "passed");
  assert.equal(result.licensing, "CC0 result found");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, "Token test-secret-freesound");
  assert.match(calls[1].url, /filter=license/);
  assert.equal(JSON.stringify(result).includes("test-secret-freesound"), false);
});

test("Freesound smoke distinguishes auth, rate-limit, connectivity and no CC0 match", async t => {
  await t.test("authentication", async () => {
    const result = await smokeFreesound({ key: "test-key", fetcher: async () => new Response('{"detail":"invalid token"}', { status: 401 }) });
    assert.equal(result.outcome, "authentication");
  });
  await t.test("rate_limit", async () => {
    const result = await smokeFreesound({ key: "test-key", fetcher: async () => new Response("slow down", { status: 429 }) });
    assert.equal(result.outcome, "rate_limit");
  });
  await t.test("connectivity", async () => {
    const result = await smokeFreesound({ key: "test-key", fetcher: async () => { throw Error("offline"); } });
    assert.equal(result.outcome, "connectivity");
  });
  await t.test("licensing", async () => {
    const result = await smokeFreesound({ key: "test-key", fetcher: async () => Response.json({ results: [{ id: 1 }] }) });
    assert.equal(result.outcome, "licensing");
    assert.equal(result.authentication, "passed");
  });
});

test("combined report says OFFLINE only when neither provider responded", async () => {
  const offline = await runProviderSmokes({ geminiKey: "g", freesoundKey: "f", fetcher: async () => { throw Error("offline"); } });
  assert.equal(offline.mode, "OFFLINE");
  assert.equal(offline.status, "failed");
});
