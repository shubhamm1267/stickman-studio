const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const FREESOUND_SEARCH_URL = "https://freesound.org/apiv2/search/text/";
const RUNTIME_DEFAULT_MODEL = "gemini-3.5-flash-lite";
const MODEL_PREFERENCES = [
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

function parseBody(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function errorText(body, text) {
  const details = body?.error;
  const parts = [details?.status, details?.message, ...(details?.details || []).flatMap(x => [x?.reason, x?.message, x?.metadata?.quotaMetric])];
  return parts.filter(x => typeof x === "string").join(" ").toLowerCase() || String(text || "").slice(0, 500).toLowerCase();
}

function httpCategory(provider, status, body, text) {
  const message = errorText(body, text);
  if (status === 401 || status === 403 || /api.?key.*(invalid|not valid)|unauthenticated|permission_denied|invalid token|authentication/.test(message)) return "authentication";
  if (/quota|daily limit|billing|resource exhausted/.test(message)) return "quota";
  if (status === 429 || /rate.?limit|requests per minute|too many requests/.test(message)) return "rate_limit";
  if (provider === "gemini" && (status === 404 || /model.*(not found|unsupported|unavailable)/.test(message))) return "model_availability";
  return "provider_error";
}

async function getJson(fetcher, url, options, timeoutMs) {
  let response;
  try {
    response = await fetcher(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { networkError: true };
  }
  let text;
  try { text = await response.text(); } catch { text = ""; }
  return { response, text, body: parseBody(text) };
}

function supportedModels(body) {
  return Array.isArray(body?.models)
    ? body.models.filter(model => typeof model?.name === "string" && (model.supportedGenerationMethods || []).includes("generateContent"))
    : [];
}

function modelId(name) { return String(name).replace(/^models\//, ""); }

function chooseModel(models, requestedModel) {
  if (requestedModel) return models.find(x => modelId(x.name) === requestedModel) || null;
  for (const preferred of MODEL_PREFERENCES) {
    const match = models.find(x => modelId(x.name) === preferred);
    if (match) return match;
  }
  return models.find(x => /flash/i.test(x.name)) || models[0] || null;
}

function blocked(provider, category) {
  return { provider, outcome: category, status: "blocked" };
}

export async function smokeGemini({ key, requestedModel, fetcher = fetch, timeoutMs = 15000 } = {}) {
  if (!key) return blocked("gemini", "missing_credential");
  const modelsResponse = await getJson(fetcher, GEMINI_MODELS_URL, {
    headers: { "x-goog-api-key": key },
  }, timeoutMs);
  if (modelsResponse.networkError) return blocked("gemini", "connectivity");
  if (!modelsResponse.response.ok) {
    return { provider: "gemini", outcome: httpCategory("gemini", modelsResponse.response.status, modelsResponse.body, modelsResponse.text), status: "failed", httpStatus: modelsResponse.response.status, stage: "model_discovery" };
  }
  const models = supportedModels(modelsResponse.body);
  if (!modelsResponse.body || !Array.isArray(modelsResponse.body.models)) {
    return { provider: "gemini", outcome: "provider_error", status: "failed", stage: "model_discovery", httpStatus: modelsResponse.response.status };
  }
  const selected = chooseModel(models, requestedModel);
  const runtimeDefaultAvailable = models.some(x => modelId(x.name) === (requestedModel || RUNTIME_DEFAULT_MODEL));
  if (!selected) {
    return { provider: "gemini", outcome: "model_availability", status: "failed", stage: "model_discovery", httpStatus: modelsResponse.response.status, modelDiscovery: "passed", compatibleModelCount: 0, runtimeDefaultAvailable };
  }
  const selectedModel = modelId(selected.name);
  const structuredResponse = await getJson(fetcher, `https://generativelanguage.googleapis.com/v1beta/${selected.name}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: 'Return exactly the JSON object {"ok":true}.' }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] },
        maxOutputTokens: 128,
        temperature: 0,
      },
    }),
  }, timeoutMs);
  if (structuredResponse.networkError) return { provider: "gemini", outcome: "connectivity", status: "failed", stage: "structured_output", selectedModel, modelDiscovery: "passed", runtimeDefaultAvailable };
  if (!structuredResponse.response.ok) {
    return { provider: "gemini", outcome: httpCategory("gemini", structuredResponse.response.status, structuredResponse.body, structuredResponse.text), status: "failed", httpStatus: structuredResponse.response.status, stage: "structured_output", selectedModel, modelDiscovery: "passed", runtimeDefaultAvailable };
  }
  const body = structuredResponse.body;
  const text = body?.candidates?.[0]?.content?.parts?.filter(x => !x?.thought).map(x => x?.text || "").join("")
    || body?.output_text
    || body?.outputs?.map(x => x?.text || "").join("")
    || body?.steps?.filter(x => x?.type === "model_output").flatMap(x => x?.content || []).map(x => x?.text || "").join("");
  const normalizedText = String(text || "").trim().replace(/^```(?:json)?\s*|```$/g, "").trim();
  let parsed;
  try { parsed = JSON.parse(normalizedText || ""); } catch { parsed = null; }
  if (parsed?.ok !== true) {
    return { provider: "gemini", outcome: "structured_output", status: "failed", stage: "structured_output", structuredDetail: !normalizedText ? "no_text" : parsed === null ? "invalid_json" : "unexpected_value", finishReason: body?.candidates?.[0]?.finishReason, selectedModel, modelDiscovery: "passed", runtimeDefaultAvailable };
  }
  return {
    provider: "gemini",
    outcome: runtimeDefaultAvailable ? "success" : "model_availability",
    status: runtimeDefaultAvailable ? "passed" : "failed",
    modelDiscovery: "passed",
    structuredOutput: "passed",
    selectedModel,
    runtimeDefaultModel: requestedModel || RUNTIME_DEFAULT_MODEL,
    runtimeDefaultAvailable,
    compatibleModelCount: models.length,
  };
}

function isCc0(license) {
  return typeof license === "string" && /creativecommons\.org\/publicdomain\/zero\//i.test(license);
}

async function freesoundSearch(fetcher, key, filter, timeoutMs) {
  const url = new URL(FREESOUND_SEARCH_URL);
  url.searchParams.set("query", "pop");
  url.searchParams.set("fields", "id,name,license");
  url.searchParams.set("page_size", "1");
  if (filter) url.searchParams.set("filter", 'license:"Creative Commons 0"');
  return getJson(fetcher, url, { headers: { Authorization: `Token ${key}` } }, timeoutMs);
}

export async function smokeFreesound({ key, fetcher = fetch, timeoutMs = 15000 } = {}) {
  if (!key) return blocked("freesound", "missing_credential");
  const authenticated = await freesoundSearch(fetcher, key, false, timeoutMs);
  if (authenticated.networkError) return blocked("freesound", "connectivity");
  if (!authenticated.response.ok) {
    return { provider: "freesound", outcome: httpCategory("freesound", authenticated.response.status, authenticated.body, authenticated.text), status: "failed", httpStatus: authenticated.response.status, stage: "authenticated_search" };
  }
  if (!Array.isArray(authenticated.body?.results)) {
    return { provider: "freesound", outcome: "provider_error", status: "failed", stage: "authenticated_search", httpStatus: authenticated.response.status };
  }
  const licensed = await freesoundSearch(fetcher, key, true, timeoutMs);
  if (licensed.networkError) return { provider: "freesound", outcome: "connectivity", status: "failed", stage: "cc0_search", authentication: "passed" };
  if (!licensed.response.ok) {
    return { provider: "freesound", outcome: httpCategory("freesound", licensed.response.status, licensed.body, licensed.text), status: "failed", httpStatus: licensed.response.status, stage: "cc0_search", authentication: "passed" };
  }
  const results = licensed.body?.results;
  if (!Array.isArray(results)) return { provider: "freesound", outcome: "provider_error", status: "failed", stage: "cc0_search", authentication: "passed" };
  const cc0 = results.find(x => isCc0(x?.license));
  if (!cc0) return { provider: "freesound", outcome: "licensing", status: "failed", stage: "cc0_search", authentication: "passed", cc0Match: false };
  return { provider: "freesound", outcome: "success", status: "passed", authentication: "passed", search: "passed", licensing: "CC0 result found", sampleResultId: String(cc0.id ?? "") };
}

export async function runProviderSmokes({ geminiKey, freesoundKey, geminiModel, fetcher = fetch, timeoutMs = 15000 } = {}) {
  const [gemini, freesound] = await Promise.all([
    smokeGemini({ key: geminiKey, requestedModel: geminiModel, fetcher, timeoutMs }),
    smokeFreesound({ key: freesoundKey, fetcher, timeoutMs }),
  ]);
  const outcomes = [gemini, freesound];
  const contacted = outcomes.some(x => Number.isInteger(x.httpStatus) || x.status === "passed" || x.modelDiscovery === "passed" || x.authentication === "passed");
  const allPassed = outcomes.every(x => x.status === "passed");
  return { mode: contacted ? "LIVE" : "OFFLINE", status: allPassed ? "passed" : "failed", providers: { gemini, freesound } };
}
