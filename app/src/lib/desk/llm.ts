// Server-only: one chat-completion call, two backends.
//   zg     — 0G Compute Router (OpenAI-compatible, TEE-verified, request IDs)
//   openai — spare brain for dev/eval iterations, so 0G credits go to prod
// Plain fetch on purpose: no SDK, no extra deps, lowest latency.

export interface LlmResult {
  text: string;
  source: "0g" | "openai";
  model: string;
  requestId: string | null; // x_0g_trace.request_id on 0G
  provider: string | null; // TEE provider address on 0G
  teeVerified: boolean | null; // only when verify_tee was honored
  latencyMs: number;
}

const ZG_URL = process.env.ZG_ROUTER_URL || "https://router-api-testnet.integratenetwork.work/v1";
const ZG_MODEL = process.env.ZG_MODEL || "glm-5.2";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

export function backends(): ("zg" | "openai")[] {
  const pref = process.env.DESK_BACKEND;
  if (pref === "openai") return ["openai"];
  if (pref === "zg") return ["zg"];
  const order: ("zg" | "openai")[] = [];
  if (process.env.ZG_ROUTER_API_KEY) order.push("zg");
  if (process.env.OPENAI_API_KEY) order.push("openai");
  return order;
}

async function post(url: string, key: string, body: object, timeoutMs: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function complete(system: string, user: string, backend: "zg" | "openai", timeoutMs = 25_000): Promise<LlmResult> {
  const started = Date.now();
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  if (backend === "zg") {
    const data = await post(
      `${ZG_URL}/chat/completions`,
      process.env.ZG_ROUTER_API_KEY!,
      {
        model: ZG_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        verify_tee: true,
        // GLM thinks by default; the desk needs numbers fast, not an essay
        chat_template_kwargs: { enable_thinking: false },
      },
      timeoutMs,
    );
    const trace = data.x_0g_trace ?? {};
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      source: "0g",
      model: data.model ?? ZG_MODEL,
      requestId: trace.request_id ?? data.id ?? null,
      provider: trace.provider ?? null,
      teeVerified: typeof trace.tee_verified === "boolean" ? trace.tee_verified : null,
      latencyMs: Date.now() - started,
    };
  }
  const data = await post(
    "https://api.openai.com/v1/chat/completions",
    process.env.OPENAI_API_KEY!,
    { model: OPENAI_MODEL, messages, response_format: { type: "json_object" }, max_completion_tokens: 2000, reasoning_effort: "minimal" },
    timeoutMs,
  );
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    source: "openai",
    model: data.model ?? OPENAI_MODEL,
    requestId: data.id ?? null,
    provider: null,
    teeVerified: null,
    latencyMs: Date.now() - started,
  };
}
