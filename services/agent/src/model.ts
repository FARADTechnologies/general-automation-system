// Thin model interface. Cloud model by default; a bank could plug its own model behind ModelClient.
import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient, ModelRequest, ModelResult, ToolMeta } from '@gas/agent-core';

// USD per million tokens. Verified against the current model table on 2026-11-08.
const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-5-5': { in: 2.0, out: 10.0, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-opus-5-5': { in: 4.0, out: 20.0, cacheRead: 0.2, cacheWrite: 5.0 },
};

// Keywords the model API's strict mode does not accept. The agent's own guard and the Bridge
// still enforce them, so stripping them here loses no protection.
const UNSUPPORTED = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'format']);
export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (UNSUPPORTED.has(k)) continue;
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v as object).map(([p, s]) => [p, strictSchema(s)])) : strictSchema(v);
  }
  if (out.type === 'object') {
    out.additionalProperties = false;
    if (!out.properties) out.properties = {};
    if (!out.required) out.required = [];
  }
  return out;
}

export interface ModelOptions {
  model: string; effort: 'low' | 'medium' | 'high'; thinking: 'between_tools' | 'adaptive'; maxTokens?: number; fallback?: boolean;
  /** A gateway in front of the Messages API (for example an event's shared proxy). */
  baseURL?: string;
  /** Bearer token for gateways that expect Authorization instead of x-api-key. */
  authToken?: string;
}

export class AnthropicModel implements ModelClient {
  private client: Anthropic;
  constructor(private opts: ModelOptions, apiKey?: string) {
    this.client = new Anthropic({
      apiKey: opts.authToken ? null : apiKey,
      authToken: opts.authToken || null,
      baseURL: opts.baseURL || undefined,
      maxRetries: 2,
      timeout: 60_000,
    });
  }
  get model() { return this.opts.model; }

  async create(req: ModelRequest, signal?: AbortSignal): Promise<ModelResult> {
    // The API accepts at most 20 strict tools. State-changing (prepare) tools get strict schemas
    // first; reads are validated by the agent guard and the Bridge either way.
    const MAX_STRICT = 20;
    const strictNames = new Set(req.tools.filter((t) => t.kind === 'prepare').concat(req.tools.filter((t) => t.kind === 'local')).slice(0, MAX_STRICT).map((t) => t.name));
    const tools = req.tools.map((t: ToolMeta, i: number) => ({
      name: t.name,
      description: t.description,
      input_schema: (strictNames.has(t.name) ? strictSchema(t.inputSchema) : t.inputSchema) as Anthropic.Beta.Messages.BetaTool.InputSchema,
      ...(strictNames.has(t.name) ? { strict: true } : {}),
      ...(i === req.tools.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));
    const t0 = Date.now();
    const params: Record<string, unknown> = {
      model: this.opts.model,
      max_tokens: this.opts.maxTokens ?? 4096,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: req.messages,
      cache_control: { type: 'ephemeral' },
      thinking: { type: this.opts.thinking },
      output_config: { effort: this.opts.effort },
    };
    if (this.opts.fallback) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
    const message = (await this.client.beta.messages.create(params as never, { signal })) as Anthropic.Beta.Messages.BetaMessage;
    const latencyMs = Date.now() - t0;
    return { message, latencyMs, costUsd: costOf(message.model || this.opts.model, message.usage as never) };
  }
}

export function costOf(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const p = PRICES[model] || PRICES['claude-sonnet-5-5'];
  return ((u.input_tokens || 0) * p.in + (u.output_tokens || 0) * p.out + (u.cache_read_input_tokens || 0) * p.cacheRead + (u.cache_creation_input_tokens || 0) * p.cacheWrite) / 1e6;
}
