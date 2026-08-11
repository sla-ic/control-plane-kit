// llm.js — headless Claude access for the fleet.
//
// COMPLIANCE (ADR-0008): this uses the *exact same* path Claude Code already
// uses — the Acme AI gateway → the `genai-project` Vertex
// project, identified by Jordan's user header. No new processor, no new API
// key, no new egress. `CLAUDE_CODE_SKIP_VERTEX_AUTH=1` in the harness means the
// gateway (not GCP creds) does auth; a headless process reaches it the same way.
//
// This is the seam that gets us off the interactive terminal ("not
// terminal-stuck") while staying inside the floor. Verified 2026-07-01:
// a raw POST to the gateway returned HTTP 200 with no interactive harness.

const GATEWAY = process.env.ANTHROPIC_VERTEX_BASE_URL
  || 'https://llm-gateway.internal/proxy/claude-code/vertex/v1';
const PROJECT = process.env.ANTHROPIC_VERTEX_PROJECT_ID || 'genai-project';
const USER    = process.env.AMP_GATEWAY_USER || 'jordan@example.com';
const REGION  = process.env.CLOUD_ML_REGION || 'global';

// Model tiers, matching the harness defaults (settings.json env).
const MODELS = {
  opus:   process.env.ANTHROPIC_DEFAULT_OPUS_MODEL   || 'claude-opus-4-7',
  sonnet: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'claude-sonnet-4-6',
  haiku:  process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL  || 'claude-haiku-4-5',
};

function resolveModel(m) {
  if (!m) return MODELS.sonnet;
  return MODELS[m] || m; // allow a tier alias OR a literal model id
}

/**
 * Call Claude through the gateway. Returns the concatenated text output.
 * @param {Array<{role:string,content:string}>} messages
 * @param {{model?:string, maxTokens?:number, system?:string, temperature?:number}} opts
 */
async function claude(messages, opts = {}) {
  const { model = 'sonnet', maxTokens = 800, system, temperature = 0 } = opts;
  const modelId = resolveModel(model);
  const url = `${GATEWAY}/projects/${PROJECT}/locations/${REGION}`
    + `/publishers/anthropic/models/${modelId}:rawPredict`;
  const body = {
    anthropic_version: 'vertex-2023-10-16',
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (system) body.system = system;

  // Wall-clock guard: the AbortController must cover the ENTIRE request —
  // headers AND body read. Clearing the timer the instant headers arrive (the
  // old bug) left `res.json()` unguarded, so a gateway that returned 200 then
  // stalled mid-body hung forever and starved the whole serial cycle-b chain
  // (2026-07-17 incident, adjudicate item #134). Mirror mcp-dispatch.js: clear
  // the timer only in `finally`, never early. Env-tunable for slow models.
  const TIMEOUT_MS = parseInt(process.env.AMP_LLM_TIMEOUT_MS, 10) || 90000;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-llm-gateway-user': USER },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        // 429 / 5xx → retry; 4xx (auth/shape) → fail fast
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
        const e = new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
        e.fatal = true;
        throw e;
      }
      const data = await res.json();
      const text = (data.content || [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('')
        .trim();
      return { text, usage: data.usage || {}, model: data.model || modelId };
    } catch (e) {
      lastErr = e;
      // AbortError from the wall-clock is a timeout — retryable like a 5xx.
      if (e.name === 'AbortError') lastErr = new Error(`gateway timeout after ${TIMEOUT_MS}ms`);
      if (e.fatal || attempt === 3) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Parse a JSON object out of a model reply, tolerating ```json fences / prose. */
function parseJSON(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

module.exports = { claude, parseJSON, MODELS, GATEWAY };
